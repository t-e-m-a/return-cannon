import {trace,stopBlock,DIR_NAME} from './engine/calculator.mjs';
const $=id=>document.getElementById(id),inputs=['sx','sz','tx','tz'];
let worker,id=0,revision=0,model=null,selected=0,shown=50,calculating=false,building=false,toastTimer;
const pending=new Map();
function initWorker(){worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.value);};worker.onerror=()=>{for(const p of pending.values())p.reject(Error('The calculation worker could not start. Reload the page and try again.'));pending.clear();worker.terminate();worker=null;};}
function request(type,args){if(!worker)initWorker();return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});worker.postMessage({id:n,type,args});});}
const aligner=()=>document.querySelector('input[name="aligner"]:checked').value;
const fmt=n=>Object.is(n,-0)?'0':String(n);
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2400);}
async function copy(text){try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);else{const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();if(!ok)throw Error('Clipboard unavailable.');}toast('Copied!');}catch{status('Clipboard is unavailable. Select and copy the coordinates manually.',true);}}
function coords(){const out={};for(const k of inputs){const raw=$(k).value.trim();if(!raw||!Number.isFinite(Number(raw))){$(k).focus();throw Error('Enter a valid number in every coordinate field.');}out[k]=Number(raw);}if(!Number.isSafeInteger(out.sx)||!Number.isSafeInteger(out.sz))throw Error('Start X and Z must be whole numbers for schematic placement.');return out;}
function busy(){ $('calculate').disabled=calculating;$('calculate').querySelector('span').textContent=calculating?'Calculating…':'Calculate cannon';$('download').disabled=building||!model;$('download').querySelector('span').textContent=building?'Generating…':'Download .litematic';$('result-region').setAttribute('aria-busy',String(calculating||building));}
function clearResults(){model=null;$('results').hidden=true;$('export-panel').hidden=true;$('empty-state').hidden=false;$('result-count').textContent='Awaiting calculation';busy();}
function invalidate(){revision++;clearResults();status('Coordinates changed. Calculate to update your cannon.');}
function selectedInfo(){const r=model.results[selected],states=trace(model.coords.sx,model.coords.sz,r.red,r.blue,r.tick+1,model.direction,model.settings),next=states.at(-1).position;return {r,next,stop:stopBlock(next)};}
function renderSelected(){
 if(!model)return;const {r,next,stop}=selectedInfo();
 $('landing-error').textContent=r.distance.toFixed(6);$('flight-ticks').textContent=`${r.tick} ticks`;$('flight-seconds').textContent=`${(r.tick/20).toFixed(2)} seconds`;$('total-tnt').textContent=r.total_tnt;
 $('stop-value').textContent=`Stop block : ${stop.join(' ')}`;
 $('export-summary').textContent=`${DIR_NAME[model.direction]} cannon · ${aligner()} aligner · ${r.red} red + ${r.blue} blue TNT`;
 const c=model.coords;$('details-content').replaceChildren();
 for(const [label,value]of [['Placement origin',`${c.sx} 128 ${c.sz}`],['TNT templates',`${String(Math.ceil(r.red/11)*11).padStart(3,'0')} red / ${String(Math.ceil(r.blue/11)*11).padStart(3,'0')} blue`],[`Pearl at tick ${r.tick}`,`${fmt(r.position.x)}  ${fmt(r.position.y)}  ${fmt(r.position.z)}`],[`Pearl at tick ${r.tick+1}`,`${fmt(next.x)}  ${fmt(next.y)}  ${fmt(next.z)}`]]){const d=document.createElement('div'),s=document.createElement('span'),v=document.createElement('code');s.textContent=label;v.textContent=value;d.append(s,v);$('details-content').append(d);}
 for(const row of $('solutions').rows){const active=Number(row.dataset.index)===selected;row.classList.toggle('selected',active);row.querySelector('input').checked=active;}
}
function renderTable(){
 const body=$('solutions');body.replaceChildren();for(const [i,r]of model.results.slice(0,shown).entries()){
  const row=document.createElement('tr');row.dataset.index=i;const pick=document.createElement('td'),radio=document.createElement('input');radio.type='radio';radio.name='solution';radio.value=i;radio.setAttribute('aria-label',`Use solution ${i+1}: ${r.distance.toFixed(6)} blocks error, ${r.tick} ticks, ${r.red} red and ${r.blue} blue TNT`);radio.addEventListener('change',()=>{selected=i;revision++;renderSelected();});pick.append(radio);row.append(pick);
  for(const [j,value]of [r.distance.toFixed(6),r.tick,r.red,r.blue,r.total_tnt].entries()){const td=document.createElement('td');td.textContent=value;if(j===2)td.className='red-text';if(j===3)td.className='blue-text';row.append(td);}row.addEventListener('click',e=>{if(e.target!==radio){radio.checked=true;radio.dispatchEvent(new Event('change'));}});body.append(row);
 }
 $('shown-count').textContent=`Showing ${Math.min(shown,model.results.length)} of ${model.results.length} solutions`;$('more-results').hidden=shown>=model.results.length;renderSelected();
}
async function run(){if(calculating)return;let c;try{c=coords();}catch(e){status(e.message,true);return;}const rev=++revision;clearResults();calculating=true;busy();status('Finding your closest launch solutions…');
 try{const value=await request('calculate',c);if(rev!==revision)return;if(!value.results.length){status('No solution found within 100 ticks and 209 TNT per side. Try a different destination.');$('result-count').textContent='No solutions';return;}model={...value,coords:c};selected=0;shown=50;$('empty-state').hidden=true;$('results').hidden=false;$('export-panel').hidden=false;$('result-count').textContent=`${model.results.length} solutions`;$('start-value').textContent=`${c.sx} 128 ${c.sz}`;$('target-value').textContent=`${c.tx} ~ ${c.tz}`;$('cannon-facing').textContent=DIR_NAME[model.direction];renderTable();status('Choose a solution, then download your cannon.');}
 catch(e){if(rev===revision)status(e.message,true);}finally{calculating=false;busy();}
}
$('calculator-form').addEventListener('submit',e=>{e.preventDefault();run();});inputs.forEach(k=>$(k).addEventListener('input',invalidate));
document.querySelectorAll('[name="aligner"]').forEach(el=>el.addEventListener('change',()=>{if(!calculating)revision++;renderSelected();}));
$('load-example').addEventListener('click',()=>{if(calculating)return;for(const[k,v]of Object.entries({sx:-651,sz:-1220,tx:-69.5,tz:40.5}))$(k).value=v;invalidate();run();});
$('more-results').addEventListener('click',()=>{shown+=50;renderTable();});
$('copy-start').addEventListener('click',()=>{if(model)copy(`/tp ${model.coords.sx} 128 ${model.coords.sz}`);});
$('copy-target').addEventListener('click',()=>{if(model)copy(`/tp ${model.coords.tx} ~ ${model.coords.tz}`);});
$('copy-stop').addEventListener('click',()=>{if(model)copy(selectedInfo().stop.join(' '));});
$('download').addEventListener('click',async()=>{
 if(!model||building)return;const rev=revision,{r}=selectedInfo(),args={...model.coords,facing:DIR_NAME[model.direction],red:r.red,blue:r.blue,aligner:aligner()};building=true;busy();
 try{const{buffer}=await request('build',args);if(rev!==revision){status('Configuration changed. Download again to use the current settings.');return;}
 const url=URL.createObjectURL(new Blob([buffer],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=`ReturnCannon_${args.sx}_${args.sz}_${args.facing}_${args.aligner}_R${r.red}_B${r.blue}.litematic`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Done!');
 }catch(e){if(rev===revision)status(e.message,true);}finally{building=false;busy();}
});
if(!('Worker'in window)||!('CompressionStream'in window)||!('DecompressionStream'in window)){status('Please use a current browser with Web Workers and gzip stream support.',true);$('calculate').disabled=true;}else run();
