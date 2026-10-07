// NBT tags retain their type; 64-bit values are BigInts throughout.
export const tag=(tid,value)=>({tid,value});
export const val=(c,n,f=null)=>c[n]?.value??f;
const utf8=new TextEncoder(),decoder=new TextDecoder();
class Reader{
 constructor(data){this.data=data;this.view=new DataView(data.buffer,data.byteOffset,data.byteLength);this.i=0;}
 number(method,n){if(this.i+n>this.data.length)throw Error('Truncated NBT.');const v=this.view[method](this.i);this.i+=n;return v;}
 take(n){if(n<0||this.i+n>this.data.length)throw Error('Invalid NBT length.');const b=this.data.slice(this.i,this.i+n);this.i+=n;return b;}
 string(){return decoder.decode(this.take(this.number('getUint16',2)));}
 payload(t){
  const nums={1:['getInt8',1],2:['getInt16',2],3:['getInt32',4],4:['getBigInt64',8],5:['getFloat32',4],6:['getFloat64',8]};if(nums[t])return this.number(...nums[t]);
  if(t===7)return this.take(this.number('getInt32',4));if(t===8)return this.string();
  if(t===9){const et=this.number('getUint8',1),n=this.number('getInt32',4);if(n<0)throw Error('Invalid NBT list.');return [et,Array.from({length:n},()=>this.payload(et))];}
  if(t===10){const c={};while(true){const tt=this.number('getUint8',1);if(!tt)return c;const name=this.string();Object.defineProperty(c,name,{value:tag(tt,this.payload(tt)),enumerable:true,writable:true,configurable:true});}}
  if(t===11||t===12){const n=this.number('getInt32',4);if(n<0)throw Error('Invalid NBT array.');return Array.from({length:n},()=>this.payload(t===11?3:4));}throw Error(`Unsupported NBT tag ${t}`);
 }
}
class Writer{
 constructor(){this.parts=[];}
 number(method,n,v){const a=new Uint8Array(n);new DataView(a.buffer)[method](0,v);this.parts.push(a);}
 string(s){const b=utf8.encode(s);if(b.length>65535)throw Error('NBT string too long.');this.number('setUint16',2,b.length);this.parts.push(b);}
 payload(t,v){
  const nums={1:['setInt8',1],2:['setInt16',2],3:['setInt32',4],4:['setBigInt64',8],5:['setFloat32',4],6:['setFloat64',8]};if(nums[t]){this.number(...nums[t],v);return;}
  if(t===7){this.number('setInt32',4,v.length);this.parts.push(new Uint8Array(v));return;}if(t===8){this.string(v);return;}
  if(t===9){this.number('setUint8',1,v[0]);this.number('setInt32',4,v[1].length);for(const a of v[1])this.payload(v[0],a);return;}
  if(t===10){for(const [name,a] of Object.entries(v)){this.number('setUint8',1,a.tid);this.string(name);this.payload(a.tid,a.value);}this.number('setUint8',1,0);return;}
  if(t===11||t===12){this.number('setInt32',4,v.length);for(const a of v)this.payload(t===11?3:4,a);return;}throw Error(`Unsupported NBT tag ${t}`);
 }
 finish(){const out=new Uint8Array(this.parts.reduce((n,a)=>n+a.length,0));let p=0;for(const a of this.parts){out.set(a,p);p+=a.length;}return out;}
}
export async function loadNBT(buffer){const raw=new Uint8Array(await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()),r=new Reader(raw),tid=r.number('getUint8',1),name=r.string();return {name,root:tag(tid,r.payload(tid))};}
export async function saveNBT(root,name=''){const w=new Writer();w.number('setUint8',1,root.tid);w.string(name);w.payload(root.tid,root.value);return new Response(new Blob([w.finish()]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();}
export const key=p=>p.join(',');
export const point=k=>k.split(',').map(Number);
export function decodeRegion(region){
 const dims=['x','y','z'],size=dims.map(k=>Math.abs(val(val(region,'Size'),k))),pos=dims.map(k=>val(val(region,'Position'),k));
 const palette=val(region,'BlockStatePalette')[1].map(c=>[val(c,'Name'),Object.fromEntries(Object.entries(val(c,'Properties',{})).map(([k,t])=>[k,t.value]).sort(([a],[b])=>a.localeCompare(b)))]);
 const bits=Math.max(2,Math.ceil(Math.log2(palette.length))),mask=(1n<<BigInt(bits))-1n,longs=val(region,'BlockStates').map(x=>BigInt.asUintN(64,x)),blocks=new Map();
 const [sx,sy,sz]=size;
 for(let i=0;i<sx*sy*sz;i++){const bit=i*bits,li=Math.floor(bit/64),off=bit%64;let p=longs[li]>>BigInt(off);if(off+bits>64)p|=longs[li+1]<<BigInt(64-off);const state=palette[Number(p&mask)];if(!state)throw Error('Invalid block palette index.');if(state[0]!=='minecraft:air'){const x=i%sx,z=Math.floor(i/sx)%sz,y=Math.floor(i/(sx*sz));blocks.set(key([pos[0]+x,pos[1]+y,pos[2]+z]),state);}}
 return {blocks,tes:structuredClone(val(region,'TileEntities',[10,[]])[1])};
}
export function makeLitematic(blocks,tes,name,description){
 const points=[...blocks.keys()].map(point),mn=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),mx=[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))),sizes=mx.map((m,i)=>m-mn[i]+1);
 const canonical=s=>JSON.stringify([s[0],Object.entries(s[1]).sort(([a],[b])=>a.localeCompare(b))]);
 const states=[['minecraft:air',{}]],stateMap=new Map([[canonical(states[0]),0]]),indices=new Map();
 for(const [p,s] of blocks){const k=canonical(s);if(!stateMap.has(k)){stateMap.set(k,states.length);states.push(s);}indices.set(p,stateMap.get(k));}
 const bits=Math.max(2,Math.ceil(Math.log2(states.length))),volume=sizes[0]*sizes[1]*sizes[2],longs=Array(Math.ceil(volume*bits/64)).fill(0n);
 let i=0;for(let y=mn[1];y<=mx[1];y++)for(let z=mn[2];z<=mx[2];z++)for(let x=mn[0];x<=mx[0];x++,i++){
  const n=BigInt(indices.get(key([x,y,z]))||0),bit=i*bits,li=Math.floor(bit/64),off=bit%64;longs[li]|=BigInt.asUintN(64,n<<BigInt(off));if(off+bits>64)longs[li+1]|=n>>BigInt(64-off);
 }
 const xyz=a=>tag(10,Object.fromEntries(['x','y','z'].map((k,i)=>[k,tag(3,a[i])]))),empty=()=>tag(9,[10,[]]);
 const region={Size:xyz(sizes),Entities:empty(),BlockStatePalette:tag(9,[10,states.map(([n,p])=>({Name:tag(8,n),...(Object.keys(p).length?{Properties:tag(10,Object.fromEntries(Object.entries(p).map(([k,v])=>[k,tag(8,v)])))}:{})}))]),BlockStates:tag(12,longs.map(n=>BigInt.asIntN(64,n))),Position:xyz(mn),PendingFluidTicks:empty(),TileEntities:tag(9,[10,tes]),PendingBlockTicks:empty()};
 const now=BigInt(Date.now()),meta={Description:tag(8,description),TimeModified:tag(4,now),TimeCreated:tag(4,now),TotalVolume:tag(3,volume),Name:tag(8,name),Author:tag(8,'ReturnCannonGenerator'),TotalBlocks:tag(3,blocks.size),EnclosingSize:xyz(sizes),RegionCount:tag(3,1)};
 return tag(10,{Regions:tag(10,{return_cannon:tag(10,region)}),SubVersion:tag(3,1),Metadata:tag(10,meta),Version:tag(3,7),MinecraftDataVersion:tag(3,4903)});
}
