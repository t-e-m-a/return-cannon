import {calculate,parseSettings} from './engine/calculator.mjs';
import {build,templateLoader} from './engine/schematic.mjs';
const cache=new Map();
const load=name=>{if(!cache.has(name))cache.set(name,templateLoader(name).catch(e=>{cache.delete(name);throw e;}));return cache.get(name);};
let settingsPromise;
function settings(){return settingsPromise??=fetch(new URL('./templates/return cannon settings.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Could not load cannon settings.');return r.json();}).then(parseSettings).catch(e=>{settingsPromise=null;throw e;});}
self.onmessage=async({data:{id,type,args}})=>{try{if(type==='calculate'){const s=await settings();self.postMessage({id,type,value:{...calculate(args.sx,args.sz,args.tx,args.tz,s),settings:s}});}else if(type==='build'){const value=await build(args,load);self.postMessage({id,type,value},[value.buffer]);}else throw Error('Unknown request.');}catch(error){self.postMessage({id,type,error:error.message||'An unexpected error occurred.'});}};
