(() => {
'use strict';
const NAMES=['구세라','권경지','권순록','김강일','류원선','박재훈','서정윤','유세종','이대호','이수한','천수진'];
const $=id=>document.getElementById(id),API=(window.GJ_API||'').trim(),KEY='gj26-site-auth-v1';
const storage={get(){try{return JSON.parse(localStorage.getItem(KEY))}catch(_){return null}},set(v){try{if(v)localStorage.setItem(KEY,JSON.stringify(v));else localStorage.removeItem(KEY)}catch(_){}}};
let user=null,token='',busy=false,restoring=false,epoch=0,remember=true,adminPw='',accounts=[],adminBusy=false;
const summaries=new Map(),bindings=[],logoutHooks=[];
const identity=()=>user&&!user.changeRequired?user.i:null;
const fail=code=>Object.assign(new Error(code),{code});
const errorText=e=>({auth_required:'먼저 사이트에 로그인해줘. 저장된 기록은 그대로 있어.',auth_change_required:'임시 비밀번호를 새 사이트 비밀번호로 바꿔줘.',auth_bad_password:'사이트 비밀번호가 맞지 않아. 처음에는 기존 마니또 비밀번호를 써줘.',auth_locked:'10회 틀려서 15분 동안 로그인이 잠겼어. 잠시 뒤 다시 시도하거나 운영진에게 사이트 비밀번호 초기화를 요청해줘.',auth_not_registered:'아직 마니또 등록 정보가 없어. 운영진에게 사이트 임시 비밀번호를 요청해줘.',auth_stale:'비밀번호 정보가 바뀌었어. 다시 로그인해서 확인해줘.',auth_identity:'로그인한 본인의 기록만 바꿀 수 있어.',auth_task_shared:'다른 사람이 맡은 할 일이 있어. 카드 전체를 삭제할 수 없어.',badpw:'운영진 비밀번호가 맞지 않아.',auth_bad_input:'비밀번호 입력을 다시 확인해줘.',auth_changed:'로그인 정보가 바뀌었어. 현재 화면에서 다시 확인해줘.',noapi:'아직 서버가 연결되지 않았어.'}[e.code||e.message]||'연결을 확인하지 못했어. 잠시 후 다시 시도해줘.');
function message(text,bad=false){$('auth-status').textContent=text;$('auth-status').className='msg'+(bad?' bad':'')}
async function raw(params,options={}){
  if(!/^https:\/\/script\.google\.com\//.test(API))throw fail('noapi');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(API,{method:'POST',body:JSON.stringify(params),signal:controller.signal,keepalive:!!options.keepalive});
    if(!response.ok)throw fail('network');
    const j=await response.json();if(!j.ok)throw Object.assign(fail(j.err||'network'),{data:j});return j;
  }finally{clearTimeout(timer)}
}
async function request(params,options={}){
  const captured=token,version=epoch;
  if(options.required&&identity()===null)throw fail(user?.changeRequired?'auth_change_required':'auth_required');
  try{
    const j=await raw({...params,...(identity()===null?{}:{auth:captured})},options);
    if(version!==epoch)throw fail('auth_changed');
    return j;
  }catch(e){
    if(captured&&captured===token&&['auth_required','auth_change_required'].includes(e.code)){
      clear();message(errorText(e),true);
    }
    throw e;
  }
}
function save(){storage.set(remember&&user?{api:API,auth:token,i:user.i,expiresAt:user.expiresAt}:null)}
function notify(){
  epoch++;render();
  bindings.forEach(({select,note})=>{select.value=identity()===null?'':String(identity());note.replaceChildren();
    if(identity()!==null)note.textContent=NAMES[identity()]+' · 참여 중';
    else{const b=document.createElement('button');b.type='button';b.className='btn ghosty';b.textContent=user?.changeRequired?'사이트 비밀번호 바꾸기':'로그인하고 참여하기';b.addEventListener('click',open);note.append(b)}
  });
  document.dispatchEvent(new CustomEvent('gj-auth-change',{detail:{i:identity()}}));
}
function accept(j){
  const old=identity();token=j.auth||token;user={i:j.i,expiresAt:j.expiresAt,changeRequired:!!j.changeRequired,revision:j.revision};
  if(old!==identity())summaries.clear();save();notify();
}
function clear(persist=true){user=null;token='';summaries.clear();if(persist)storage.set(null);$('auth-password').value='';$('auth-change-form').reset();notify()}
function open(){
  $('account').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  (user?.changeRequired?$('auth-current'):user?$('auth-heading'):$('auth-name')).focus({preventScroll:true});
}
function render(){
  const logged=!!user,changing=!!user?.changeRequired;
  $('auth-login-form').hidden=logged;
  $('auth-member').hidden=!logged;
  $('auth-heading').textContent=logged?NAMES[user.i]+'의 긍정의밤':'내 이름으로 참여하기';
  $('auth-summary').hidden=!logged||changing;
  $('auth-change').hidden=!logged;
  if(changing)$('auth-change').open=true;
  $('auth-change-title').textContent=changing?'새 사이트 비밀번호 정하기':'사이트 비밀번호 변경';
  $('auth-change-note').textContent=changing?'운영진이 알려준 임시 비밀번호로 들어왔어. 새 비밀번호를 정하면 참여할 수 있어.':'사이트 비밀번호만 바뀌어. 마니또 확인에는 기존 마니또 비밀번호를 사용해줘.';
  $('auth-login').disabled=busy||restoring;$('auth-name').disabled=busy||restoring;$('auth-password').disabled=busy||restoring;
  $('auth-login').textContent=busy?'확인 중…':restoring?'로그인 확인 중…':'로그인';
  $('auth-logout').disabled=busy;$('auth-change-save').disabled=busy;
  $('auth-jump').textContent=logged?NAMES[user.i]+' · 내 참여':'로그인 · 내 참여';
  const list=$('auth-summary');list.replaceChildren();
  if(logged&&!changing){
    const defaults=[['arrival','도착 시간 확인하기'],['todo','내 할 일 확인하기'],['bring','준비물 확인하기'],['third','내 질문 확인하기'],['vote','투표 참여하기'],['quiz','퀴즈 현황 확인하기'],['raffle','내 추첨권 확인하기'],['manito','내 마니또 확인하기']];
    defaults.forEach(([key,text])=>{const a=document.createElement('a');a.href='#'+key;a.textContent=summaries.get(key)||text;list.append(a)});
  }
}
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function verifier(password,salt){
  const c=crypto.subtle,base=await c.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=new Uint8Array(await c.deriveBits({name:'PBKDF2',salt:decode(salt),iterations:300000,hash:'SHA-256'},base,512));
  const ver=Array.from(new Uint8Array(await c.digest('SHA-256',bits.slice(32))),n=>n.toString(16).padStart(2,'0')).join('');bits.fill(0);return ver;
}
async function credentials(password){const salt=b64(crypto.getRandomValues(new Uint8Array(16)));return {salt,ver:await verifier(password,salt)}}
$('auth-name').append(new Option('내 이름 선택',''));NAMES.forEach((name,i)=>$('auth-name').append(new Option(name,String(i))));
$('auth-login-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||restoring)return;
  const i=Number($('auth-name').value),password=$('auth-password').value;
  if($('auth-name').value===''||password.length<4){message('이름과 비밀번호(4자 이상)를 입력해줘.',true);return}
  busy=true;render();message('로그인 정보를 확인하고 있어…');
  try{
    const s=await raw({a:'gift',op:'authSalt',i});
    const ver=await verifier(password,s.salt);
    const j=await raw({a:'gift',op:'authLogin',i,ver,revision:s.revision});
    remember=$('auth-remember').checked;accept(j);$('auth-password').value='';
    message(j.changeRequired?'새 사이트 비밀번호를 정해줘.':'로그인됐어! 이제 내 이름으로 바로 참여하면 돼.');
  }catch(err){message(errorText(err),true)}finally{busy=false;render()}
});
$('auth-logout').addEventListener('click',async()=>{
  if(busy)return;busy=true;render();message('로그아웃 중…');
  try{for(const hook of logoutHooks){if(!await hook()){message('참여 기록을 저장 중이야. 저장 완료 후 다시 로그아웃해줘.',true);return}}await raw({a:'gift',op:'authLogout',auth:token});clear();message('로그아웃했어. 참여 기록은 서버에 보관돼 있어.')}
  catch(e){if(e.code==='auth_required'){clear();message('로그아웃했어.')}else message('로그아웃을 완료하지 못했어. 연결 후 다시 눌러줘.',true)}
  finally{busy=false;render()}
});
$('auth-change-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!user)return;
  const current=$('auth-current').value,password=$('auth-new').value;
  if(current.length<4||password.length<4||password.length>128||password!==$('auth-new-confirm').value){message('현재 비밀번호와 새 비밀번호(4자 이상)를 확인해줘.',true);return}
  if(current===password){message('현재 비밀번호와 다른 새 비밀번호를 정해줘.',true);return}
  busy=true;render();message('사이트 비밀번호를 바꾸고 있어…');
  try{
    const s=await raw({a:'gift',op:'authSalt',i:user.i});
    const currentVer=await verifier(current,s.salt),next=await credentials(password);
    const j=await raw({a:'gift',op:'authChange',auth:token,currentVer,revision:s.revision,...next});
    accept(j);$('auth-change-form').reset();$('auth-change').open=false;message('사이트 비밀번호가 바뀌었어. 마니또 비밀번호와 참여 기록은 그대로야.');
  }catch(err){
    if(['auth_required','auth_stale'].includes(err.code))clear();
    message(errorText(err)+' 변경 중 연결이 끊겼다면 새 비밀번호로 로그인을 시도해줘.',true);
  }finally{busy=false;render()}
});
$('auth-jump').addEventListener('click',open);
$('auth-forgot').addEventListener('click',()=>message('운영진에게 “사이트 로그인 비밀번호만 초기화해줘”라고 알려줘. 임시 비밀번호를 받은 뒤 로그인하면 돼. 마니또 비밀번호는 바뀌지 않아.'));
function bindIdentity(select){
  select.hidden=true;select.disabled=true;document.querySelector('label[for="'+select.id+'"]')?.setAttribute('hidden','');
  const note=document.createElement('div');note.className='auth-identity';select.insertAdjacentElement('afterend',note);bindings.push({select,note});
  select.value=identity()===null?'':String(identity());
  if(identity()===null){const b=document.createElement('button');b.type='button';b.className='btn ghosty';b.textContent='로그인하고 참여하기';b.addEventListener('click',open);note.append(b)}else note.textContent=NAMES[identity()]+' · 참여 중';
}
function summary(key,text,i){if(identity()===null||i!==identity())return;summaries.set(key,text);render()}
function adminMessage(text,bad=false){$('auth-admin-status').textContent=text;$('auth-admin-status').className='msg'+(bad?' bad':'')}
async function adminLoad(){
  if(!adminPw||adminBusy)return;adminBusy=true;$('auth-admin-reset').disabled=true;
  try{const j=await raw({a:'gift',op:'authAdmin',pw:adminPw});accounts=j.accounts;adminMessage('초기화할 사람에게 임시 비밀번호를 따로 알려줘. 마니또는 초기화되지 않아.');adminSelection()}
  catch(e){accounts=[];adminMessage(errorText(e),true)}finally{adminBusy=false;$('auth-admin-reset').disabled=!accounts.length}
}
function adminSelection(){
  const a=accounts.find(a=>a.i===Number($('auth-admin-who').value));
  $('auth-admin-info').textContent=!a?'':a.locked?'로그인 잠김':a.changeRequired?'임시 비밀번호 사용 중':a.exists?'사이트 계정 사용 중':'첫 로그인 때 마니또 비밀번호를 복사해';
}
NAMES.forEach((name,i)=>$('auth-admin-who').append(new Option(name,String(i))));
$('auth-admin-who').addEventListener('change',adminSelection);
$('auth-admin-reset-form').addEventListener('submit',async e=>{
  e.preventDefault();if(adminBusy||!adminPw)return;
  const i=Number($('auth-admin-who').value),password=$('auth-admin-temp').value,a=accounts.find(a=>a.i===i);
  if(!a||password.length<4||password.length>128){adminMessage('임시 비밀번호를 4자 이상 입력해줘.',true);return}
  if(!$('auth-admin-confirm').checked){adminMessage('사이트 비밀번호만 초기화하는지 확인해줘.',true);return}
  adminBusy=true;$('auth-admin-reset').disabled=true;adminMessage('사이트 비밀번호 초기화 중…');
  try{
    const next=await credentials(password),j=await raw({a:'gift',op:'authReset',pw:adminPw,i,revision:a.revision,...next});
    accounts=j.accounts;$('auth-admin-temp').value='';$('auth-admin-confirm').checked=false;adminSelection();
    adminMessage(NAMES[i]+'의 사이트 비밀번호만 초기화했어. 임시 비밀번호를 알려줘. 기존 마니또와 참여 기록은 유지돼.');
    if(user?.i===i){clear();message('운영진이 사이트 비밀번호를 초기화했어. 임시 비밀번호로 다시 로그인해줘.')}
  }catch(err){accounts=[];adminMessage(errorText(err)+' 연결이 끊겼다면 계정 현황을 다시 확인해줘.',true)}
  finally{adminBusy=false;$('auth-admin-reset').disabled=!accounts.length}
});
$('auth-admin-refresh').addEventListener('click',adminLoad);
window.GJ_AUTH={identity,request,errorText,open,bindIdentity,summary,beforeLogout:fn=>logoutHooks.push(fn),get epoch(){return epoch},subscribe:fn=>document.addEventListener('gj-auth-change',fn)};
window.GJ_AUTH_ADMIN={connect(pw){adminPw=pw;$('auth-admin').hidden=false;adminLoad()},disconnect(){adminPw='';accounts=[];$('auth-admin').hidden=true;$('auth-admin-temp').value='';$('auth-admin-confirm').checked=false;adminMessage('')}};
async function restore(){
  const saved=storage.get();if(!saved||saved.api!==API||typeof saved.auth!=='string'||saved.expiresAt<=Date.now()){storage.set(null);render();return}
  restoring=true;render();message('저장된 로그인을 확인하고 있어…');
  try{const j=await raw({a:'gift',op:'authMe',auth:saved.auth});token=saved.auth;accept(j);message(j.changeRequired?'새 사이트 비밀번호를 정해줘.':'다시 왔구나! 내 기록을 불러오고 있어.')}
  catch(e){if(e.code==='auth_required')storage.set(null);message(e.code==='auth_required'?'로그인이 만료됐어. 다시 로그인하면 이어갈 수 있어.':'자동 로그인 연결이 늦어지고 있어. 이름과 비밀번호로 다시 로그인해줘.',true)}
  finally{restoring=false;render()}
}
window.addEventListener('storage',e=>{if(e.key===KEY){clear(false);message('다른 창에서 로그인 정보가 바뀌었어. 이 창에서도 다시 로그인해줘.')}});
render();restore();
})();
