const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function server(){
 const data=new Map();const ctx=vm.createContext({Date:class extends Date{static now(){return Date.parse('2026-10-25T00:00:00+09:00')}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>data.get(k)||null,getProperties:()=>Object.fromEntries(data),setProperty:(k,v)=>data.set(k,v)})},Utilities:{getUuid:()=>crypto.randomUUID()},isAdmin:()=>false});
 vm.runInContext(fs.readFileSync('server/Raffle.gs','utf8'),ctx);
 return {call:q=>JSON.parse(JSON.stringify(ctx.raffleAction(q))),data};
}
function client(api,{local=new Map(),tab=new Map(),blocked=false}={}){
 const ids=[...fs.readFileSync('index.html','utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
 class Element{
  constructor(){this.value='';this.textContent='';this.hidden=false;this.style={};this.children=[];this.events={};this.disabled=false}
  addEventListener(e,f){(this.events[e]??=[]).push(f)}
  removeEventListener(){}
  fire(e){for(const f of this.events[e]||[])f({target:this})}
  append(...x){this.children.push(...x)}
  replaceChildren(...x){this.children=x}
  querySelector(){return this.children.find(x=>x instanceof Element)}
  focus(){}
  scrollIntoView(){}
  getContext(){return new Proxy({},{get:()=>()=>{}})}
 }
 const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
 const document=new Element();Object.assign(document,{getElementById:id=>elements[id],createElement:()=>new Element(),createTextNode:text=>({textContent:text}),visibilityState:'visible',body:{style:{}},activeElement:elements['rf-enroll']});
 const timers=new Map();let timerId=0,failAfterCommit=false;
 const storage=map=>({getItem:k=>{if(blocked)throw Error('blocked');return map.get(k)??null},setItem:(k,v)=>{if(blocked)throw Error('blocked');map.set(k,v)}});
 const window=new Element();window.GJ_API='https://script.google.com/test';
 const context=vm.createContext({window,document,localStorage:storage(local),sessionStorage:storage(tab),crypto:crypto.webcrypto,URLSearchParams,AbortController,Option:class{constructor(text,value){this.text=text;this.value=value}},location:{hash:''},matchMedia:()=>({matches:true}),
  setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId},clearTimeout:id=>timers.delete(id),setInterval:()=>{},
  fetch:async(url,options)=>{const q=options.method==='POST'?JSON.parse(options.body):Object.fromEntries(new URL(url).searchParams);const result=api.call(q);if(failAfterCommit&&q.op==='progress'){failAfterCommit=false;throw Error('lost response')}return {ok:true,json:async()=>result}}
 });
 vm.runInContext(fs.readFileSync('raffle.js','utf8'),context);
 const flush=()=>new Promise(r=>setImmediate(r));
 return {elements,local,tab,flush,
  join:async i=>{elements['rf-name'].value=String(i);elements['rf-enroll'].fire('click');await flush()},
  clicks:n=>{for(let i=0;i<n;i++)document.fire('gj-boo')},
  save:async()=>{elements['rf-sync'].fire('click');await flush()},
  reload:async()=>{elements['rf-retry'].fire('click');await flush()},
  failNext:()=>failAfterCommit=true,
  text:id=>elements[id].textContent};
}
test('browser A and a fresh Kakao-like browser continue the same name without passwords',async()=>{
 const api=server(),a=client(api);await a.flush();await a.join(0);a.clicks(41);await a.flush();await a.save();
 assert.equal(api.call({op:'mine',i:0}).mine.count,41);
 const b=client(api);await b.flush();await b.join(0);assert.equal(b.text('rf-count'),'41번');
 b.clicks(59);await b.flush();await b.save();assert.equal(api.call({op:'mine',i:0}).mine.tickets,1);
 await a.reload();assert.equal(a.text('rf-count'),'100번');
});
test('participation works even when browser storage is disabled',async()=>{
 const api=server(),a=client(api,{blocked:true});await a.flush();await a.join(2);a.clicks(10);await a.save();
 assert.equal(api.call({op:'mine',i:2}).mine.count,10);
 const b=client(api,{blocked:true});await b.flush();await b.join(2);assert.equal(b.text('rf-count'),'10번');
});
test('a lost response, retry, and page reload never add the same clicks again',async()=>{
 const api=server(),a=client(api);await a.flush();await a.join(0);a.clicks(10);a.failNext();await a.save();
 assert.equal(api.call({op:'mine',i:0}).mine.count,10);
 await a.save();assert.equal(api.call({op:'mine',i:0}).mine.count,10);
 const reload=client(api,{local:a.local,tab:a.tab});await reload.flush();assert.equal(reload.text('rf-count'),'10번');
 reload.clicks(5);await reload.save();assert.equal(api.call({op:'mine',i:0}).mine.count,15);
});
test('legacy counts survive once, and switching names does not copy past clicks',async()=>{
 const api=server();api.data.set('ghost_raffle_2026_0',JSON.stringify({i:0,count:100,tickets:1,tokenHash:'old'}));
 const local=new Map([['gj26-boo','130'],['gj26-raffle-v3',JSON.stringify({i:0,token:'old'})]]);
 const a=client(api,{local});await a.flush();assert.equal(a.text('rf-count'),'130번');
 a.clicks(5);await a.save();assert.equal(api.call({op:'mine',i:0}).mine.count,135);
 await a.join(1);assert.equal(a.text('rf-count'),'0번');a.clicks(2);await a.save();
 assert.equal(api.call({op:'mine',i:0}).mine.count,135);assert.equal(api.call({op:'mine',i:1}).mine.count,2);
 const b=client(api,{local});await b.flush();await b.join(0);assert.equal(b.text('rf-count'),'135번');
});
