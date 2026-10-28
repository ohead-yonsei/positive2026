const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const REVEAL=Date.parse('2026-10-31T21:00:00+09:00');
function server(){
 let time=REVEAL-1000;const data=new Map();const ctx=vm.createContext({Date:class extends Date{static now(){return time}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>data.get(k)||null,setProperty:(k,v)=>data.set(k,v)})}});
 vm.runInContext(fs.readFileSync('server/Vote.gs','utf8'),ctx);
 return{call:q=>JSON.parse(JSON.stringify(ctx.voteAction(q))),setTime:t=>time=t};
}
function client(api){
 class Element{
  constructor(){this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.style={};this.children=[];this.events={};this.attributes={}}
  addEventListener(e,f){(this.events[e]??=[]).push(f)}
  async fire(e){for(const f of this.events[e]||[])await f({target:this,preventDefault(){}})}
  append(...x){this.children.push(...x)}
  replaceChildren(...x){this.children=x}
  setAttribute(k,v){this.attributes[k]=v}
  focus(){}
 }
 const ids=[...fs.readFileSync('index.html','utf8').matchAll(/id="(vote[^"]*)"/g)].map(m=>m[1]);
 const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
 const document=new Element();Object.assign(document,{getElementById:id=>elements[id],createElement:()=>new Element(),visibilityState:'visible'});
 let perf=0,offline=false,loseResponse=false;const intervals=[];
 const context=vm.createContext({window:{GJ_API:'https://script.google.com/test'},document,performance:{now:()=>perf},URLSearchParams,AbortController,Option:class{constructor(text,value){this.text=text;this.value=value}},setTimeout:()=>1,clearTimeout(){},setInterval:(fn,ms)=>intervals.push({fn,ms}),
  fetch:async(url,options)=>{
   if(offline)throw Error('offline');const q=options.method==='POST'?JSON.parse(options.body):Object.fromEntries(new URL(url).searchParams);
   const j=api.call(q);if(loseResponse&&q.op==='voteSubmit'){loseResponse=false;throw Error('lost response')}return{ok:true,json:async()=>j};
  }
 });
 vm.runInContext(fs.readFileSync('vote.js','utf8'),context);
 const flush=()=>new Promise(r=>setImmediate(r));
 return{elements,flush,choose:async i=>{elements['vote-name'].value=String(i);await elements['vote-name'].fire('change')},
  review:async choices=>{for(let k=0;k<3;k++){elements['vote-choice-'+k].value=String(choices[k]);await elements['vote-choice-'+k].fire('change')}await elements['vote-form'].fire('submit')},
  submit:()=>elements['vote-send'].fire('click'),retry:async()=>{await elements['vote-retry'].fire('click');await flush()},
  offline:v=>offline=v,loseNext:()=>loseResponse=true,tick:async ms=>{perf+=ms;intervals.find(i=>i.ms===1000).fn();await flush()}};
}
test('review and submission, then a fresh browser recognizes the name as already voted',async()=>{
 const api=server(),a=client(api);await a.flush();assert.equal(a.elements['vote-review'].disabled,true);
 await a.choose(0);await a.review([1,2,3]);assert.equal(a.elements['vote-confirm'].hidden,false);assert.equal(api.call({op:'voteStatus'}).total,0);
 await a.submit();assert.equal(a.elements['vote-done'].hidden,false);assert.equal(a.elements['vote-fields'].hidden,true);assert.equal(a.elements['vote-results'].hidden,true);
 const b=client(api);await b.flush();await b.choose(0);assert.equal(b.elements['vote-done'].hidden,false);assert.equal(b.elements['vote-review'].disabled,true);
});
test('lost submission response is recovered by status without creating another ballot',async()=>{
 const api=server(),a=client(api);await a.flush();await a.choose(2);await a.review([0,0,0]);a.loseNext();await a.submit();
 assert.equal(a.elements['vote-send'].disabled,true);assert.match(a.elements['vote-status'].textContent,/저장 여부/);
 await a.retry();assert.equal(a.elements['vote-done'].hidden,false);assert.equal(api.call({op:'voteStatus'}).total,1);
});
test('deadline triggers automatic result fetch and closes form',async()=>{
 const api=server(),a=client(api);await a.flush();api.call({op:'voteSubmit',i:0,choices:[1,1,1]});api.setTime(REVEAL);await a.tick(1000);
 assert.equal(a.elements['vote-entry'].hidden,true);assert.equal(a.elements['vote-results'].hidden,false);assert.equal(a.elements['vote-results'].children.length,3);
 assert.match(a.elements['vote-results'].children[0].children[1].textContent,/권경지/);
});
test('offline status disables voting; retry restores it without relying on browser storage',async()=>{
 const api=server(),a=client(api);await a.flush();await a.choose(4);await a.review([0,1,2]);a.offline(true);await a.retry();
 assert.equal(a.elements['vote-send'].disabled,true);assert.match(a.elements['vote-status'].textContent,/연결/);
 a.offline(false);await a.retry();assert.equal(a.elements['vote-send'].disabled,false);
});
test('ties show shared winners and empty results never select all names as winners',async()=>{
 const api=server();api.call({op:'voteSubmit',i:0,choices:[1,1,1]});api.call({op:'voteSubmit',i:1,choices:[2,2,2]});api.setTime(REVEAL);
 const a=client(api);await a.flush();assert.match(a.elements['vote-results'].children[0].children[1].textContent,/권경지 · 권순록 공동 1위/);
 const empty=server();empty.setTime(REVEAL);const b=client(empty);await b.flush();assert.equal(b.elements['vote-results'].children[0].children[1].textContent,'아직 받은 표가 없어');
});
