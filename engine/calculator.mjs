// Direct port of the bundled Python Pearl Calculator implementation.
export const DIR_NAME={1:'North',2:'South',4:'East',8:'West'};
const flags={North:1,South:2,East:4,West:8,NorthWest:9,NorthEast:5,SouthWest:10,SouthEast:6};
export function parseSettings(root){
 const all=root.CannonSettings;if(!all?.length)throw Error('CannonSettings is empty.');
 const r=all.find(x=>x.CannonName===root.SelectedCannon)||all[0];
 const vec=v=>({x:v.X,y:v.Y,z:v.Z});
 return {max_tnt:r.MaxTNT||0,default_red:flags[r.DefaultRedDirection||'SouthEast'],default_blue:flags[r.DefaultBlueDirection||'NorthWest'],tnt_positions:Object.fromEntries(['NorthWest','NorthEast','SouthWest','SouthEast'].map(n=>[flags[n],vec(r[n+'TNT'])])),offset_x:r.Offset?.X||0,offset_z:r.Offset?.Z||0,pearl_y:r.Pearl.Position.Y,pearl_motion_y:r.Pearl.Motion.Y,is_1212_plus:r.GameVersion!=='Version111To1211',pearl_y_motion_cancellation:r.PearlYMotionCancellation||false,pearl_y_position_original:r.PearlYPositionOriginal??r.Pearl.Position.Y,pearl_y_position_adjusted:r.PearlYPositionAdjusted??r.Pearl.Position.Y};
}
export function roundEven(x){const lo=Math.floor(x),f=x-lo;return f<.5?lo:f>.5?lo+1:lo%2===0?lo:lo+1;}
function invert(d){return (d&3?(~d)&3:0)|(d&12?(~d)&12:0);}
function motion(p,t){const ty=t.y+Math.fround(.98)*.0625,dx=p.x-t.x,dy=p.y-ty,dz=p.z-t.z,d12=Math.sqrt(dx*dx+dy*dy+dz*dz)/Math.fround(8),v=p.y+Math.fround(Math.fround(.85)*Math.fround(.25))-ty,d13=Math.sqrt(dx*dx+v*v+dz*dz),d11=1-d12;return {x:dx/d13*d11,y:v/d13*d11,z:dz/d13*d11};}
export function vectors(d,s){
 if((s.default_blue|s.default_red)!==15)throw Error('Default TNT directions must be opposite diagonals.');
 const p={x:s.offset_x,y:s.pearl_y,z:s.offset_z};let r,b;
 if((d&s.default_blue)===0){b=motion(p,s.tnt_positions[s.default_blue]);r=motion(p,s.tnt_positions[((~(d|s.default_blue))&15)|invert(d)]);}
 else{r=motion(p,s.tnt_positions[s.default_red]);b=motion(p,s.tnt_positions[((~(d|s.default_red))&15)|invert(d)]);}
 return [r,b];
}
export function initialState(sx,sz,r,b,d,s){
 const cancel=s.pearl_y_motion_cancellation,[rv,bv]=vectors(d,cancel?{...s,pearl_y:s.pearl_y_position_original}:s);
 return {position:{x:sx+s.offset_x,y:cancel?s.pearl_y_position_adjusted:s.pearl_y,z:sz+s.offset_z},motion:{x:r*rv.x+b*bv.x,y:cancel?0:s.pearl_motion_y+r*rv.y+b*bv.y,z:r*rv.z+b*bv.z}};
}
export function tick(state,s){const p=state.position,m=state.motion;if(s.is_1212_plus){const n={x:m.x*Math.fround(.99),y:(m.y-.03)*Math.fround(.99),z:m.z*Math.fround(.99)};return {position:{x:p.x+n.x,y:p.y+n.y,z:p.z+n.z},motion:n};}return {position:{x:p.x+m.x,y:p.y+m.y,z:p.z+m.z},motion:{x:m.x*.99,y:m.y*.99-.03,z:m.z*.99}};}
export function trace(sx,sz,r,b,t,d,s){let state=initialState(sx,sz,r,b,d,s);const out=[state];for(let i=0;i<t;i++){state=tick(state,s);out.push(state);}return out;}
export function calculate(sx,sz,tx,tz,s,maxTicks=100,maxError=10){
 const dx=tx-(sx+s.offset_x),dz=tz-(sz+s.offset_z);if(dx===0&&dz===0)return {direction:0,results:[]};
 const a=Math.atan2(-dx,dz)*(180/Math.PI),d=a>-135&&a<=-45?4:a>-45&&a<=45?2:a>45&&a<=135?8:1;
 const [rv,bv]=vectors(d,s),denom=rv.z*bv.x-bv.z*rv.x,trueRed=(dz*bv.x-dx*bv.z)/denom,trueBlue=(dx-trueRed*rv.x)/bv.x;
 const results=[];let divider=0;
 for(let t=1;t<=maxTicks;t++){
  divider+=Math.pow(.99,s.is_1212_plus?t:t-1);const br=roundEven(trueRed/divider),bb=roundEven(trueBlue/divider);
  for(let rd=-5;rd<=5;rd++)for(let bd=-5;bd<=5;bd++){
   const r=br+rd,b=bb+bd;if(r<0||b<0||(s.max_tnt>0&&(r>s.max_tnt||b>s.max_tnt)))continue;
   let state=initialState(sx,sz,r,b,d,s);for(let i=0;i<t;i++)state=tick(state,s);
   const ex=state.position.x-tx,ez=state.position.z-tz;
   if(Math.abs(ex)<=maxError&&Math.abs(ez)<=maxError)results.push({distance:Math.hypot(ex,ez),tick:t,red:r,blue:b,total_tnt:r+b,position:state.position});
  }
 }
 results.sort((a,b)=>a.distance-b.distance);return {direction:d,results};
}
export function stopBlock(p){return [Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)];}
