const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const data=new Map([['positive_awards_2026_ballots',JSON.stringify({0:[1,2,3]})],['positive_awards_2026_opened_at','1']]);
 const server=vm.createContext({Date,Utilities:{getUuid:()=> 'test-id'},isAdmin:q=>q.pw==='admin',PropertiesService:{getScriptProperties:()=>({getProperty:k=>data.get(k)||null,setProperty:(k,v)=>data.set(k,v)})}});
 vm.runInContext(fs.readFileSync('server/Vote.gs','utf8'),server);
 const call=q=>JSON.parse(JSON.stringify(server.voteAction(q)));
 class Element{
  constructor(){this.value='';this.hidden=false;this.disabled=false;this.children=[];this.style={};this.events={};this.textContent=''}
  append(...c){this.children.push(...c)}replaceChildren(...c){this.children=c}setAttribute(){}focus(){}
  addEventListener(e,f){(this.events[e]??=[]).push(f)}async fire(e){for(const f of this.events[e]||[])await f({preventDefault(){}})}
 }
 const ids=[...fs.readFileSync('index.html','utf8').matchAll(/id="((?:rv-|revote)[^"]*)"/g)].map(m=>m[1]),elements=Object.fromEntries(ids.map(i=>[i,new Element()]));
 let lost=false,offline=false;
 const context=vm.createContext({window:{GJ_API:'https://example.test'},document:{getElementById:id=>elements[id],createElement:()=>new Element(),visibilityState:'visible'},Option:class{},setInterval(){},
  fetch:async(url,opts)=>{if(offline)throw Error('offline');const q=JSON.parse(opts.body),j=call(q);if(lost&&q.op==='voteSubmit'){lost=false;throw Error('lost')}return{json:async()=>j}}
 });
 const auth=require('./client-auth-stub.cjs')(context);vm.runInContext(fs.readFileSync('revote.js','utf8'),context);
 context.window.GJ_REVOTE.accept(call({op:'voteStatus'}));
 const flush=()=>new Promise(r=>setImmediate(r));
 return{elements,auth,call,context,flush,offline:v=>offline=v,lose:()=>lost=true,
  async open(){context.window.GJ_REVOTE_ADMIN.connect('admin');await flush();elements['rv-admin-prompt'].value='함께 여행을 계획하고 싶은 사람은?';await elements['rv-admin-prompt'].fire('input');await elements['rv-admin-open'].fire('click');assert.equal(call({op:'voteStatus'}).revote.phase,'none');await elements['rv-admin-go'].fire('click')},
  async review(i){elements['rv-choice'].value=String(i);await elements['rv-choice'].fire('change');await elements['rv-form'].fire('submit')}};
}
test('revote stays unopened until admin confirms a question; logged-in one-choice ballot and manual reveal',async()=>{
 const f=fixture(),e=f.elements;assert.equal(e['rv-form'].hidden,true);assert.match(e['rv-total'].textContent,/준비/);
 await f.open();assert.equal(e['rv-login'].hidden,false);assert.equal(f.call({op:'voteStatus'}).revote.counts,undefined);
 await f.auth.login(0);await f.review(2);assert.equal(e['rv-confirm'].hidden,false);assert.equal(f.call({op:'voteStatus'}).revote.total,0);
 await e['rv-send'].fire('click');assert.equal(e['rv-done'].hidden,false);assert.equal(e['rv-results'].hidden,true);
 await e['rv-admin-reveal'].fire('click');assert.equal(f.call({op:'voteStatus'}).revote.phase,'open');await e['rv-admin-go'].fire('click');
 assert.equal(e['rv-results'].hidden,false);assert.match(e['rv-results'].children[0].textContent,/권순록/);assert.deepEqual(f.call({op:'voteStatus'}).results[2],[0,0,0,1,0,0,0,0,0,0,0]);
});
test('lost response disables resubmission until refresh, then recognizes the saved ballot',async()=>{
 const f=fixture(),e=f.elements;await f.open();await f.auth.login(4);await f.review(0);f.lose();await e['rv-send'].fire('click');assert.equal(e['rv-send'].disabled,true);assert.match(e['rv-status'].textContent,/저장 여부/);
 await e['rv-refresh'].fire('click');assert.equal(e['rv-done'].hidden,false);assert.equal(f.call({op:'voteStatus'}).revote.total,1);
});
test('account changes clear reviewed choices and stale responses cannot reopen closed voting',async()=>{
 const f=fixture(),e=f.elements;await f.open();await f.auth.login(0);await f.review(1);await f.auth.login(1);await e['rv-send'].fire('click');assert.equal(f.call({op:'voteStatus'}).revote.total,0);assert.equal(e['rv-confirm'].hidden,true);
 const old=f.call({op:'voteStatus'});await f.review(2);await e['rv-send'].fire('click');await e['rv-admin-reveal'].fire('click');await e['rv-admin-go'].fire('click');
 f.context.window.GJ_REVOTE.accept(old);assert.equal(e['rv-form'].hidden,true);assert.equal(e['rv-results'].hidden,false);
 f.context.window.GJ_REVOTE_ADMIN.disconnect();assert.equal(e['rv-admin-go'].disabled,true);
});
