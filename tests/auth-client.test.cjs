const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),setup=require('./auth-helper.cjs');
function ver(password,salt){const bits=crypto.pbkdf2Sync(password,Buffer.from(salt,'base64'),300000,64,'sha256');return crypto.createHash('sha256').update(bits.subarray(32)).digest('hex')}
function seeded(){const s=setup();for(let i=0;i<2;i++){const salt=Buffer.alloc(16,i+1).toString('base64');s.seed(i,ver('old-password',salt));}return s}
function client(api,{local=new Map(),blocked=false}={}){
 class Element{
  constructor(){this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.checked=false;this.children=[];this.events={};this.style={}}
  addEventListener(e,f){(this.events[e]??=[]).push(f)}
  async fire(e,extra={}){for(const f of this.events[e]||[])await f({target:this,preventDefault(){},...extra})}
  dispatchEvent(e){for(const f of this.events[e.type]||[])f(e);return true}
  append(...x){this.children.push(...x)}replaceChildren(...x){this.children=x}focus(){}scrollIntoView(){}setAttribute(){}insertAdjacentElement(){}
  reset(){for(const key of ['auth-current','auth-new','auth-new-confirm'])elements[key].value=''}
 }
 const ids=[...fs.readFileSync('index.html','utf8').matchAll(/id="(auth[^"]*|account)"/g)].map(m=>m[1]);
 const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));elements['auth-remember'].checked=true;
 const document=new Element();Object.assign(document,{getElementById:id=>elements[id],createElement:()=>new Element(),querySelector:()=>null});
 const window=new Element();window.GJ_API='https://script.google.com/test';
 let offline=false,delay=null;const sent=[];
 const ctx=vm.createContext({window,document,crypto:crypto.webcrypto,TextEncoder,Uint8Array,AbortController,btoa,atob,Option:class{constructor(text,value){this.text=text;this.value=value}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},matchMedia:()=>({matches:true}),setTimeout:()=>1,clearTimeout(){},
 localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return local.get(k)||null},setItem:(k,v)=>{if(blocked)throw Error('blocked');local.set(k,v)},removeItem:k=>{if(blocked)throw Error('blocked');local.delete(k)}},
 fetch:async(url,options)=>{if(offline)throw Error('offline');const q=JSON.parse(options.body);sent.push(q);const j=api.call(q);if(delay&&q.op==='thirdStatus'){const hold=delay;delay=null;await hold}return {ok:true,json:async()=>j}}});
 vm.runInContext(fs.readFileSync('auth.js','utf8'),ctx);
 const flush=()=>new Promise(r=>setImmediate(r));
 return{elements,window,local,sent,auth:window.GJ_AUTH,flush,offline:v=>offline=v,delayNext:()=>{let done;delay=new Promise(r=>done=r);return done},
  login:async(i=0,password='old-password')=>{elements['auth-name'].value=String(i);elements['auth-password'].value=password;await elements['auth-login-form'].fire('submit')},
  change:async(current,password)=>{elements['auth-current'].value=current;elements['auth-new'].value=password;elements['auth-new-confirm'].value=password;await elements['auth-change-form'].fire('submit')},
  logout:()=>elements['auth-logout'].fire('click')};
}
test('real PBKDF2 login, browser restoration and no plaintext password storage/transmission',async()=>{
 const s=seeded(),a=client(s);await a.login();assert.equal(a.auth.identity(),0);assert.equal(a.elements['auth-login-form'].hidden,true);
 assert.ok(a.local.has('gj26-site-auth-v1'));assert.ok(!JSON.stringify([...a.local]).includes('old-password'));assert.ok(!JSON.stringify(a.sent).includes('old-password'));
 const b=client(s,{local:a.local});await b.flush();assert.equal(b.auth.identity(),0);
 const fresh=client(s);await fresh.login();assert.equal(fresh.auth.identity(),0);
});
test('admin reset only changes site login; temporary login cannot participate until password changed',async()=>{
 const s=seeded(),a=client(s);await a.login();const original=s.data.get('reg_0');
 const salt=Buffer.alloc(16,9).toString('base64');s.admin('authReset',{i:0,revision:1,salt,ver:ver('temporary',salt)});
 await assert.rejects(a.auth.request({a:'gift',op:'thirdStatus'}),/auth_required/);assert.equal(a.auth.identity(),null);
 await a.login(0,'temporary');assert.equal(a.auth.identity(),null);assert.equal(a.elements['auth-change'].open,true);
 await a.change('temporary','new-site-password');assert.equal(a.auth.identity(),0);assert.equal(s.data.get('reg_0'),original);
 await a.logout();await a.login(0,'new-site-password');assert.equal(a.auth.identity(),0);
 await a.logout();await a.login();assert.equal(a.auth.identity(),null);assert.match(a.elements['auth-status'].textContent,/맞지 않아/);
});
test('normal password change revokes other sessions and leaves the manito record byte-for-byte intact',async()=>{
 const s=seeded(),a=client(s),b=client(s);await a.login();await b.login();const original=s.data.get('reg_0');
 await a.change('old-password','site-only-new');assert.equal(a.auth.identity(),0);assert.equal(s.data.get('reg_0'),original);
 await assert.rejects(b.auth.request({a:'gift',op:'thirdStatus'}),/auth_required/);assert.equal(b.auth.identity(),null);
});
test('blocked storage and do-not-remember both allow a working in-memory session',async()=>{
 const s=seeded(),a=client(s,{blocked:true});await a.login();assert.equal(a.auth.identity(),0);
 assert.equal((await a.auth.request({a:'gift',op:'thirdStatus'})).mine.i,0);
 const b=client(s);b.elements['auth-remember'].checked=false;await b.login();assert.equal(b.auth.identity(),0);assert.equal(b.local.size,0);
});
test('logout clears private data, stale responses are discarded, and cross-tab logout does not erase a newer token',async()=>{
 const s=seeded(),a=client(s);await a.login();a.auth.summary('third','secret question',0);
 const release=a.delayNext(),pending=a.auth.request({a:'gift',op:'thirdStatus'});await a.logout();release();await assert.rejects(pending,/auth_changed/);
 assert.equal(a.auth.identity(),null);assert.equal(a.elements['auth-summary'].children.length,0);
 await a.login();const saved=a.local.get('gj26-site-auth-v1');await a.window.fire('storage',{key:'gj26-site-auth-v1'});
 assert.equal(a.auth.identity(),null);assert.equal(a.local.get('gj26-site-auth-v1'),saved);
});
test('offline login can be retried, and logout waits for pending participation saves',async()=>{
 const s=seeded(),a=client(s);a.offline(true);await a.login();assert.equal(a.auth.identity(),null);a.offline(false);await a.login();
 let saved=false;a.auth.beforeLogout(async()=>saved);await a.logout();assert.equal(a.auth.identity(),0);saved=true;await a.logout();assert.equal(a.auth.identity(),null);
});
