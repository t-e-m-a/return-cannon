import {loadNBT,saveNBT,val,key,point,decodeRegion,makeLitematic} from './nbt.mjs';
const ROT={North:0,East:1,South:2,West:3},DIRS=['north','east','south','west'];
const replacements={'minecraft:azalea_leaves':'minecraft:oak_leaves','minecraft:birch_sign':'minecraft:oak_sign','minecraft:birch_wall_sign':'minecraft:oak_wall_sign','minecraft:cyan_shulker_box':'minecraft:shulker_box'};
export const capacity=n=>Math.ceil(n/11)*11;
export function rotate(x,z,q){for(let i=0;i<q%4;i++)[x,z]=[-z,x];return [x,z];}
const add=(a,b)=>a.map((v,i)=>v+b[i]);
function facing(v,q,mirror){if(!DIRS.includes(v))return v;if(mirror){if(v==='east')v='west';else if(v==='west')v='east';}return DIRS[(DIRS.indexOf(v)+q)%4];}
export function transformState([name,props],q,mirror=false){
 const d={...props};if('facing'in d)d.facing=facing(d.facing,q,mirror);if(q%2&&['x','z'].includes(d.axis))d.axis=d.axis==='x'?'z':'x';
 if('rotation'in d&&/^\d+$/.test(d.rotation)){let r=Number(d.rotation);if(mirror)r=(16-r)%16;d.rotation=String((r+4*q)%16);}
 const directional=DIRS.filter(k=>k in d).map(k=>[k,d[k]]);for(const [k]of directional)delete d[k];for(const[k,v]of directional)d[facing(k,q,mirror)]=v;
 if(d.shape){const s=d.shape;if(['inner_left','inner_right','outer_left','outer_right'].includes(s)){if(mirror)d.shape=s.endsWith('left')?s.slice(0,-4)+'right':s.slice(0,-5)+'left';}
 else{const p=s.split('_').map(v=>DIRS.includes(v)?facing(v,q,mirror):v);if(p.length===2&&p.every(v=>DIRS.includes(v))){const order=['north_south','east_west','north_east','north_west','south_east','south_west'];d.shape=order.find(v=>v.split('_').every(x=>p.includes(x)))||p.join('_');}else d.shape=p.join('_');}}
 if(mirror&&['left','right'].includes(d.hinge))d.hinge=d.hinge==='left'?'right':'left';
 return [replacements[name]||name,d];
}
function transformTE(te,q,mirror,offset){const out=structuredClone(te);let x=val(te,'x',0),z=val(te,'z',0);if(mirror)x=-x;[x,z]=rotate(x,z,q);out.x.value=x+offset[0];out.y.value=val(te,'y',0)+offset[1];out.z.value=z+offset[2];return out;}
export async function templateLoader(name){const url=new URL('../templates/'+name,import.meta.url),res=await fetch(url);if(!res.ok)throw Error(`Could not load template: ${name}`);const {root}=await loadNBT(await res.arrayBuffer());const regs=Object.values(val(root.value,'Regions'));if(regs.length!==1)throw Error('Expected one template region.');return decodeRegion(regs[0].value);}
export async function transformedPart(load,name,q=0,mirror=false,offset=[0,0,0],trim=0){
 const raw=await load(name),correction=name.endsWith('duper 033 TNT.litematic')?[-5,-15,-15]:[0,0,0];
 const blocks=new Map([...raw.blocks].map(([k,s])=>[key(add(point(k),correction)),s])),tes=raw.tes.map(te=>transformTE(te,0,false,correction));
 if(trim>0){const ts=[...blocks].filter(([,s])=>s[0]==='minecraft:tnt').map(([k])=>point(k)),outer=Math.min(...ts.map(p=>p[0])),row=ts.filter(p=>p[0]===outer).sort((a,b)=>b[2]-a[2]);if(trim>row.length)throw Error('TNT trim exceeds one lane.');for(const p of row.slice(0,trim))blocks.set(key(p),['minecraft:gray_concrete',{}]);}
 const out=new Map();for(const[k,s]of blocks){let[x,y,z]=point(k);if(mirror)x=-x;[x,z]=rotate(x,z,q);out.set(key(add([x,y,z],offset)),transformState(s,q,mirror));}return {blocks:out,tes:tes.map(te=>transformTE(te,q,mirror,offset))};
}
function shift(part,offset){return {blocks:new Map([...part.blocks].map(([k,s])=>[key(add(point(k),offset)),s])),tes:part.tes.map(te=>transformTE(te,0,false,offset))};}
function junction(blocks,top){const bars=[...blocks].filter(([,s])=>s[0]==='minecraft:iron_bars').map(([k])=>point(k));if(!bars.length)throw Error('Missing iron-bar junction.');const y=(top?Math.max:Math.min)(...bars.map(p=>p[1])),layer=bars.filter(p=>p[1]===y),minx=Math.min(...layer.map(p=>p[0])),minz=Math.min(...layer.map(p=>p[2]));if(layer.length!==4||layer.some(p=>![minx,minx+1].includes(p[0])||![minz,minz+1].includes(p[2])))throw Error('Expected a 2×2 iron-bar junction.');return layer;}
export function addBridge(blocks,aq,q,bo,ao){
 let[x,z]=rotate(-2,-2,aq);const source=add([x,42,z],ao);[x,z]=rotate(0,3,q);const target=[bo[0]+x,42,bo[2]+z],start=[source[0],source[2]],goal=[target[0],target[2]],forbidden=new Set();
 for(const[k,s]of blocks)if(s[0]==='minecraft:iron_bars'){const[x,y,z]=point(k);forbidden.add(k);forbidden.add(key([x,y-1,z]));}
 const free=([x,z])=>[41,42].every(y=>!blocks.has(key([x,y,z]))&&!forbidden.has(key([x,y,z]))),dirs=[[1,0],[-1,0],[0,1],[0,-1]],candidates=[];
 const minx=Math.min(start[0],goal[0])-12,maxx=Math.max(start[0],goal[0])+12,minz=Math.min(start[1],goal[1])-12,maxz=Math.max(start[1],goal[1])+12;
 for(const[dx,dz]of dirs){
  const last=[goal[0]+dx,goal[1]+dz],entry=[goal[0]+2*dx,goal[1]+2*dz];if(!free(last)||!free(entry))continue;
  const lateral=[[last[0]-dz,last[1]+dx],[last[0]+dz,last[1]-dx]];if(lateral.some(([x,z])=>blocks.has(key([x,42,z]))||[41,43].some(y=>blocks.get(key([x,y,z]))?.[0]==='minecraft:redstone_wire')))continue;
  const blocked=new Set([...lateral,last,goal].map(key)),queue=[start],prev=new Map([[key(start),null]]);
  for(let i=0;i<queue.length;i++){const cur=queue[i];if(key(cur)===key(entry))break;for(const[mx,mz]of dirs){const next=[cur[0]+mx,cur[1]+mz],k=key(next);if(prev.has(k)||blocked.has(k)||next[0]<minx||next[0]>maxx||next[1]<minz||next[1]>maxz||!free(next))continue;prev.set(k,cur);queue.push(next);}}
  if(!prev.has(key(entry)))continue;const path=[];let cur=entry;while(cur!==null){path.push(cur);cur=prev.get(key(cur));}path.reverse();path.push(last,goal);if(path.length-2<=15)candidates.push(path);
 }
 if(!candidates.length)throw Error('Could not route a straight-ending trigger bridge to the piston.');candidates.sort((a,b)=>a.length-b.length);const mids=candidates[0].slice(1,-1),wires=new Set(mids.map(key));
 mids.forEach(([x,z],i)=>blocks.set(key([x,41,z]),i===0?['minecraft:gray_glazed_terracotta',{facing:'north'}]:['minecraft:black_stained_glass',{}]));
 for(const[x,z]of mids){const connections=new Set();for(const[dx,dz]of dirs){const k=key([x+dx,z+dz]);if(wires.has(k)||k===key(start))connections.add(dx===1?'east':dx===-1?'west':dz===1?'south':'north');}const ns=connections.has('north')||connections.has('south'),ew=connections.has('east')||connections.has('west');if(!ns){connections.add('east');connections.add('west');}if(!ew){connections.add('north');connections.add('south');}blocks.set(key([x,42,z]),['minecraft:redstone_wire',{...Object.fromEntries(DIRS.map(d=>[d,connections.has(d)?'side':'none'])),power:'0'}]);}
 return {source,target,path:mids};
}
export async function build({sx,sz,facing:cannon,red,blue,aligner='North'},load=templateLoader){
 if(!Number.isSafeInteger(sx)||!Number.isSafeInteger(sz))throw Error('Start X/Z must be integers to generate a schematic.');
 if(!(cannon in ROT)||!(aligner in ROT))throw Error('Invalid cannon or aligner facing.');
 if(![red,blue].every(n=>Number.isInteger(n)&&n>=0&&n<=209))throw Error('TNT must be between 0 and 209 per duper.');
 const q=ROT[cannon],aq=ROT[aligner],all=new Map(),tes=[],conflicts=[];
 const merge=(part,label)=>{for(const[k,s]of part.blocks){if(all.has(k)&&JSON.stringify(all.get(k))!==JSON.stringify(s))conflicts.push([k,label]);all.set(k,s);}tes.push(...part.tes);};
 let basket=await transformedPart(load,'basket.litematic',q);const bars=junction(basket.blocks,false),bo=[-(Math.min(...bars.map(p=>p[0]))+1),43-Math.min(...bars.map(p=>p[1])),-(Math.min(...bars.map(p=>p[2]))+1)];basket=shift(basket,bo);merge(basket,'basket');
 const[rx,rz]=rotate(0,2,q),top=add([rx,80,rz],bo),[lx,lz]=rotate(-1,0,q),sideA=add(top,[lx,0,lz]),sideB=add(top,[-lx,0,-lz]),aRed=['North','East'].includes(cannon),placements=[];
 for(const[n,color,offset,mirror]of [[aRed?red:blue,aRed?'red':'blue',sideA,false],[aRed?blue:red,aRed?'blue':'red',sideB,true]])if(n>0){const cap=capacity(n),part=await transformedPart(load,`dupers/duper ${String(cap).padStart(3,'0')} TNT.litematic`,q,mirror,offset,cap-n);merge(part,`${color}_duper_${n}`);placements.push([color,n,cap,offset,mirror]);}
 let ap=await transformedPart(load,'aligner.litematic',aq);const from=junction(ap.blocks,true),to=junction(basket.blocks,false),ao=[0,1,2].map(i=>Math.min(...to.map(p=>p[i]))-Math.min(...from.map(p=>p[i])));ap=shift(ap,ao);merge(ap,'aligner');
 const bridge=addBridge(all,aq,q,bo,ao),root=makeLitematic(all,tes,`Return Cannon ${sx} ${sz}`,`Return cannon. Start=(${sx},128,${sz}); facing=${cannon}; aligner=${aligner}; Red=${red}; Blue=${blue}.`),buffer=await saveNBT(root);
 return {buffer,diagnostics:{aligner_facing:aligner,aligner_origin:ao,launch_origin:[0,0],basket_origin:bo,bridge,top_redstone:top,side_a_origin:sideA,side_b_origin:sideB,placements,conflicts,final_tnt_count:[...all.values()].filter(s=>s[0]==='minecraft:tnt').length,block_count:all.size}};
}
