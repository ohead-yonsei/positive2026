const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),setup=require('./third-helper.cjs');
function client(api){
 const elements={};
 class Element{
  constructor(tag='div'){this.tag=tag;this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.children=[];this.events={};this.attributes={}}
  set id(v){this._id=v;elements[v]=this}get id(){return this._id}
  addEventListener(e,f){(this.events[e]??=[]).push(f)}
  async fire(e){for(const f of this.events[e]||[])await f({target:this,preventDefault(){}});await flush()}
  append(...x){this.children.push(...x)}replaceChildren(...x){this.children=x}focus(){}
  querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...(c.querySelectorAll?c.querySelectorAll(tag):[])])}
 }
 const ids=[...fs.readFileSync('index.html','utf8').matchAll(/id="(third[^"]*)"/g)].map(m=>m[1]);for(const id of ids)elements[id]=new Element();
 const document=new Element();Object.assign(document,{getElementById:id=>elements[id],createElement:tag=>new Element(tag),visibilityState:'visible'});
 let offline=false,loseResponse=false;const calls=[];const win={GJ_API:'https://script.google.com/test'};
 const context=vm.createContext({window:win,document,AbortController,Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value}},setTimeout:()=>1,clearTimeout(){},
  fetch:async(url,options)=>{if(offline)throw Error('offline');const q=JSON.parse(options.body);calls.push(q);const j=api.call(q);if(loseResponse&&['thirdSave','thirdVote'].includes(q.op)){loseResponse=false;throw Error('lost response')}return {ok:true,json:async()=>j};}
 });
 const flush=()=>new Promise(r=>setImmediate(r));
 const auth=require('./client-auth-stub.cjs')(context);
 vm.runInContext(fs.readFileSync('third.js','utf8'),context);
 return{elements,win,calls,flush,choose:async i=>{await auth.login(i)},
  edit:async text=>{elements['third-prompt'].value=text;await elements['third-prompt'].fire('input')},save:()=>elements['third-entry'].fire('submit'),
  pick:async(k,i)=>{elements['third-pick-'+k].value=String(i);await elements['third-pick-'+k].fire('change')},vote:()=>elements['third-vote'].fire('click'),
  retry:()=>elements['third-retry'].fire('click'),offline:v=>offline=v,loseNext:()=>loseResponse=true};
}
test('question saves once per name and loads in a fresh browser without local storage',async()=>{
 const api=setup(),a=client(api);await a.flush();assert.equal(a.elements['third-entry'].hidden,true);await a.choose(0);await a.edit('무인도에서 잘 살 것 같은 사람은?');await a.save();assert.equal(api.status().submittedCount,1);assert.match(a.elements['third-status'].textContent,/저장돼/);
 const b=client(api);await b.flush();await b.choose(0);assert.equal(b.elements['third-prompt'].value,'무인도에서 잘 살 것 같은 사람은?');await b.edit('다음 질문으로 바꿔볼까요?');await b.save();assert.equal(api.status().submittedCount,1);assert.equal(api.status(0).mine.entry.prompt,'다음 질문으로 바꿔볼까요?');
});
test('polling preserves unsaved edits and switching names does not copy drafts',async()=>{
 const api=setup(),a=client(api);await a.flush();await a.choose(0);await a.edit('아직 저장하지 않은 질문');await a.retry();assert.equal(a.elements['third-prompt'].value,'아직 저장하지 않은 질문');await a.choose(1);assert.equal(a.elements['third-prompt'].value,'');assert.equal(api.status().submittedCount,0);
});
test('lost question-save response is recoverable and never creates duplicate questions',async()=>{
 const api=setup(),a=client(api);await a.flush();await a.choose(0);await a.edit('한 번만 저장되는 질문');a.loseNext();await a.save();await a.save();assert.equal(api.status().submittedCount,1);assert.equal(a.elements['third-save'].disabled,true);
});
test('incomplete ranked selections stay disabled including selecting third place first',async()=>{
 const api=setup();api.start(2);const a=client(api);await a.flush();await a.choose(0);await a.pick(2,2);assert.equal(a.elements['third-vote'].disabled,true);await a.pick(1,1);assert.equal(a.elements['third-vote'].disabled,true);await a.pick(0,0);assert.equal(a.elements['third-vote'].disabled,false);await a.vote();assert.deepEqual(api.status(0).mine.choices,[0,1,2]);assert.equal(a.elements['third-vote'].hidden,true);
});
test('author sees a waiting message, entry locks at start, and author stays hidden before reveal',async()=>{
 const api=setup(),a=client(api);await a.flush();await a.choose(2);await a.edit('내가 만든 질문이에요');await a.save();api.admin('thirdStart');await a.retry();assert.equal(a.elements['third-entry'].hidden,true);assert.equal(a.elements['third-ballot'].hidden,true);assert.match(a.elements['third-status'].textContent,/내가 만든/);
 api.vote(0,[0,1,2]);api.admin('thirdClose');await a.retry();assert.equal(a.elements['third-results'].hidden,false);assert.equal(a.elements['third-reveal'].hidden,true);api.admin('thirdAuthor');await a.retry();assert.equal(a.elements['third-reveal'].hidden,false);assert.match(a.elements['third-reveal'].children[1].textContent,/성공/);
});
test('runoff resets prior picks and displays only tied candidates',async()=>{
 const api=setup();api.start(2);const a=client(api);await a.flush();await a.choose(0);await a.pick(0,0);await a.pick(1,1);await a.pick(2,2);await a.vote();api.vote(1,[0,2,1]);api.admin('thirdClose');await a.retry();assert.equal(a.elements['third-vote'].hidden,false);assert.equal(a.elements['third-vote'].disabled,true);assert.equal(a.elements['third-picks'].children.length,2);assert.deepEqual(a.elements['third-pick-0'].children.map(o=>o.value),['','1','2']);
});
test('offline errors disable submission and a retry restores it',async()=>{
 const api=setup(),a=client(api);await a.flush();await a.choose(0);await a.edit('오프라인에서 작성한 질문');a.offline(true);await a.retry();assert.equal(a.elements['third-save'].disabled,true);a.offline(false);await a.retry();assert.equal(a.elements['third-save'].disabled,false);
});
test('existing admin login connects game controls; start requires explicit confirmation and logout clears access',async()=>{
 const api=setup();api.save(2);const a=client(api);await a.flush();a.win.GJ_THIRD_ADMIN.connect('test-only-password');await a.flush();assert.equal(a.elements['third-start'].disabled,false);await a.elements['third-start'].fire('click');assert.equal(api.status().phase,'collecting');assert.equal(a.elements['third-confirm'].hidden,false);await a.elements['third-confirm-go'].fire('click');assert.equal(api.status().phase,'voting');assert.equal(a.elements['third-confirm'].hidden,true);a.win.GJ_THIRD_ADMIN.disconnect();assert.equal(a.elements['third-admin-refresh'].disabled,true);assert.equal(a.elements['third-admin-list'].children.length,0);
});
