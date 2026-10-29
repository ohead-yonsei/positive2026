(function(){
'use strict';
const NAMES=['구세라','권경지','권순록','김강일','류원선','박재훈','서정윤','유세종','이대호','이수한','천수진'];
const A=window.GJ_AUTH;
const $=id=>document.getElementById(id), KEY='gj26-raffle-session-v4', NAME_KEY='gj26-raffle-name-v4';
const API=/^https:\/\/script\.google\.com\//.test(window.GJ_API||'')?window.GJ_API.trim():'';
const read=(k,session=false)=>{try{return (session?sessionStorage:localStorage).getItem(k)}catch(e){return null}};
const write=(k,v,session=false)=>{try{(session?sessionStorage:localStorage).setItem(k,v)}catch(e){}};
const validName=i=>Number.isInteger(i)&&i>=0&&i<11;
const newSession=()=>({id:Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join(''),i:null,clicks:0,floor:0});
let session;
try{const s=JSON.parse(read(KEY,true));if(s&&/^[a-f0-9]{32}$/.test(s.id)&&(s.i===null||validName(s.i))&&[s.clicks,s.floor].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000))session=s}catch(e){}
if(!session)session=newSession();
const persist=()=>{write(KEY,JSON.stringify(session),true);if(validName(session.i))write(KEY+'-'+session.i,JSON.stringify(session),true)};
const legacyCount=Math.min(1000000,Math.max(0,Math.floor(Number(read('gj26-boo'))||0)));
let legacyOwner=read('gj26-raffle-legacy-owner-v4');
try{const old=JSON.parse(read('gj26-raffle-v3'));if(legacyOwner===null&&validName(old?.i))legacyOwner=String(old.i)}catch(e){}
let state=null, mine=null, acknowledged=0, personalTime=0, ready=false, offset=0;
let toastTimer,syncTimer,syncBusy=false,loadBusy=false,joinBusy=false,spinning=false,modalFocus=null;
let wheelKey='',rotation=0,milestoneShown=false;
const selected=()=>validName(session.i)&&A.identity()===session.i;
const now=()=>Date.now()+offset;
const isOpen=()=>state&&state.phase==='open'&&now()<state.closeAt;
const pending=()=>Math.max(0,session.clicks-acknowledged);
const count=()=>selected()?Math.max(mine?.count||0,session.floor)+(isOpen()||!state?pending():0):0;
const setStatus=(text,bad=false)=>{$('rf-status').textContent=text;$('rf-status').className='raffle-status'+(bad?' bad':'')};
const errorText=e=>(e.code||e.message||'').startsWith('auth_')?A.errorText(e):({closed:'응모가 마감됐어. 마감 전에 저장된 응모권으로 추첨해.',badpw:'운영진 비밀번호가 맞지 않아.',not_closed:'10월 31일 0시부터 추첨할 수 있어.',no_entries:'응모자가 없어. 아직 추첨할 수 없어.',already_awarded:'이미 추첨이 완료됐어. 선물은 당일 직접 전달해!',refresh_required:'새 버전으로 바뀌었어. 새로고침해서 이름을 골라줘.',server_update:'이벤트를 업데이트 중이야. 잠시 후 새로고침해줘.',session_conflict:'참여 정보를 다시 불러와야 해. 새로고침해줘.'}[e.code]||'아직 저장하지 못했어. 이 화면에서 연결을 확인하고 다시 시도해줘.');
async function call(op,values={},keepalive=false){
  const j=await A.request({a:'gift',op,...values},{required:['mine','progress'].includes(op),keepalive});
  if(j.version!==4)throw Object.assign(new Error('server_update'),{code:'server_update'});return j;
}

function accept(j){
  if(!state||j.serverNow>=state.serverNow){state=j;offset=j.serverNow-Date.now()}
  if(selected()&&j.mine&&j.mine.i===session.i&&j.session.id===session.id&&j.serverNow>=personalTime){
    mine=j.mine;acknowledged=j.session.clicks;personalTime=j.serverNow;ready=true;A.summary('raffle','추첨권 '+mine.tickets+'장 · '+mine.count+'번',session.i);
  }
  render();
}
function savedStatus(){
  if(!selected())return setStatus('로그인하면 어느 브라우저에서든 내 횟수를 이어갈 수 있어.');
  if(!ready)return setStatus('내 횟수를 불러오는 중…');
  if(!isOpen())return setStatus('응모 마감! 저장된 응모권으로 추첨하고 선물은 당일 직접 전달해.');
  setStatus(pending()?`${NAMES[session.i]} · ${pending()}번 저장 대기 중…`:`${NAMES[session.i]} · ${mine.count}번 저장됨 ✓ · 100번마다 자동 응모!`);
}
function line(n){
  if(spinning)return '룰렛이 돌아가는 중… 유령의 선택은?';
  if(state&&(state.phase==='drawn'||state.phase==='legacy-awarded'))return '유령의 선물은 '+NAMES[state.winner]+'에게! 당일 직접 전달해 🎁';
  if(state&&!isOpen())return '응모 마감! 10월 31일 룰렛을 기다려줘.';
  if(selected()&&ready){const t=mine?.tickets||0;return t===5?'응모권 5장 모두 모았어! 31일에 만나 👻':`${NAMES[session.i]}의 응모권 ${t}장 · 100번마다 한 장 더!`}
  return '로그인하고 유령을 눌러줘! 100번마다 추첨권 1장 👻';
}
function toast(n){
  const t=$('bootoast');t.replaceChildren(document.createTextNode(`유령을 ${n}번 놀래켰어 👻`));
  const small=document.createElement('small');small.textContent=line(n);t.append(small);t.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true},2200);
}
function countdown(){
  const remaining=state?Math.max(0,state.closeAt-now()):null;
  if(!state)$('rf-clock').textContent='10.30 밤 11:59까지 응모 · 10.31 현장 추첨';
  else if(state.phase==='drawn'||state.phase==='legacy-awarded')$('rf-clock').textContent='당첨자를 발표했어! 선물은 당일 직접 전달해.';
  else if(!remaining)$('rf-clock').textContent='응모 마감 · 운영진의 룰렛을 기다리는 중';
  else{const s=Math.floor(remaining/1000);$('rf-clock').textContent=`마감까지 ${Math.floor(s/86400)}일 ${Math.floor(s/3600)%24}시간 ${Math.floor(s/60)%60}분`}
  $('rf-enroll').disabled=joinBusy||syncBusy||$('rf-name').value==='';
  $('rf-sync').disabled=!isOpen()||syncBusy||joinBusy||!ready;
  $('rf-name').disabled=true;
  $('rf-draw').disabled=!state||now()<state.drawAt||state.phase!=='closed'||!state.totalTickets||spinning;
}
function drawWheel(entries){
  const key=JSON.stringify(entries.map(e=>[e.i,e.tickets]));if(key===wheelKey||spinning)return;wheelKey=key;
  const c=$('rf-wheel'),ctx=c.getContext('2d'),total=entries.reduce((n,e)=>n+e.tickets,0);
  ctx.clearRect(0,0,600,600);const colors=['#FF9F45','#FFD447','#9BDB4D','#C9ACED','#FFB6C9','#9EDBD1'];
  if(!total){ctx.fillStyle='#FFD447';ctx.beginPath();ctx.arc(300,300,298,0,2*Math.PI);ctx.fill();return}
  let angle=-Math.PI/2;
  for(let n=0;n<entries.length;n++){
    const e=entries[n],span=e.tickets/total*2*Math.PI;
    ctx.beginPath();ctx.moveTo(300,300);ctx.arc(300,300,298,angle,angle+span);ctx.closePath();ctx.fillStyle=colors[n%colors.length];ctx.fill();ctx.strokeStyle='#1A1226';ctx.lineWidth=3;ctx.stroke();
    ctx.save();ctx.translate(300,300);ctx.rotate(angle+span/2);ctx.fillStyle='#1A1226';ctx.font='26px Jua, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(NAMES[e.i],190,0);ctx.restore();angle+=span;
  }
}
function render(){
  const n=count();
  $('rf-count').textContent=n.toLocaleString()+'번';$('rf-count-label').textContent=selected()?NAMES[session.i]+'의 누적 횟수':'로그인하면 내 횟수가 이어져';
  $('rf-tickets').textContent=(mine?.tickets||0)+' / 5장';
  $('boocount').textContent=n?`유령을 ${n}번 놀래켰어 👻 · ${line(n)}`:'';
  const toastLine=$('bootoast').querySelector('small');if(toastLine&&!$('bootoast').hidden)toastLine.textContent=line(n);
  $('rf-sync').hidden=!selected();
  $('rf-enroll').textContent=selected()&&$('rf-name').value===String(session.i)?'내 횟수 다시 불러오기':'로그인하고 이어가기';
  $('rf-winner').hidden=!(state&&(state.phase==='drawn'||state.phase==='legacy-awarded'))||spinning;
  if(state){
    $('rf-total').textContent=`${state.entries.length}명 응모 · 전체 응모권 ${state.totalTickets}장`;
    $('rf-winner').textContent='🎉 '+NAMES[state.winner]+' 당첨! 선물은 당일 직접 전달해.';
    const ul=$('rf-entries');ul.replaceChildren();
    for(const e of state.entries){const li=document.createElement('li'),span=document.createElement('span');li.append(document.createTextNode(NAMES[e.i]));span.textContent=`${e.tickets}장 · ${Math.round(e.tickets/state.totalTickets*1000)/10}%`;li.append(span);ul.append(li)}
    if(!state.entries.length){const li=document.createElement('li');li.className='empty';li.textContent='첫 응모자를 기다리는 중 👻';ul.append(li)}
    drawWheel(state.entries);
    if(state.phase==='drawn'&&!spinning){
      let before=0;for(const e of state.entries){if(e.i===state.winner)break;before+=e.tickets}
      const e=state.entries.find(e=>e.i===state.winner);
      if(e){$('rf-wheel').style.transition='none';$('rf-wheel').style.transform=`rotate(${(360-(before+e.tickets/2)/state.totalTickets*360)%360}deg)`}
    }
  }
  $('rf-enroll').hidden=A.identity()===null;
  countdown();
}
async function load(){
  if(loadBusy||joinBusy)return;loadBusy=true;
  try{
    accept(await call(selected()?'mine':'status',selected()?{i:session.i,session:session.id}:{}));
    savedStatus();
    if(selected()&&isOpen()&&(pending()||session.floor>(mine?.count||0)))scheduleSync();
  }catch(e){setStatus(errorText(e),true)}finally{loadBusy=false}
}
function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>sync(),700)}
async function sync(keepalive=false){
  if(syncBusy||!selected()||!isOpen()||!ready)return false;
  clearTimeout(syncTimer);syncBusy=true;countdown();setStatus(`${NAMES[session.i]}의 횟수 저장 중…`);
  const sent={i:session.i,session:session.id,clicks:session.clicks,floor:session.floor};
  let ok=false;
  try{accept(await call('progress',sent,keepalive));ok=true;savedStatus()}
  catch(e){setStatus(errorText(e),true);if(e.code==='closed'||e.code==='already_awarded')load()}
  finally{syncBusy=false;render();if(ok&&pending()&&isOpen())scheduleSync()}
  return ok;
}
const nameSelect=$('rf-name');nameSelect.append(new Option('이름 선택',''));
NAMES.forEach((n,i)=>nameSelect.append(new Option(n,String(i))));
A.bindIdentity(nameSelect);
nameSelect.addEventListener('change',render);
async function join(){
  if(A.identity()===null||joinBusy||syncBusy)return;
  const i=A.identity();
  joinBusy=true;countdown();setStatus('이름에 저장된 횟수를 불러오는 중…');
  try{
    if(session.i!==i){
      persist();let saved;try{saved=JSON.parse(read(KEY+'-'+i,true))}catch(_){}
      session=saved&&saved.i===i&&/^[a-f0-9]{32}$/.test(saved.id)&&[saved.clicks,saved.floor].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000)?saved:newSession();
    }
    session.i=i;
    if(legacyOwner===null){legacyOwner=String(i);write('gj26-raffle-legacy-owner-v4',legacyOwner)}
    session.floor=legacyOwner===String(i)?legacyCount:0;
    write(NAME_KEY,String(i));persist();mine=null;acknowledged=0;personalTime=0;ready=false;
    accept(await call('mine',{i,session:session.id}));milestoneShown=count()>=100;savedStatus();
    if(isOpen())await sync();
  }catch(e){setStatus(errorText(e),true)}finally{joinBusy=false;render();if(A.identity()!==null&&A.identity()!==session.i)join()}
}
$('rf-enroll').addEventListener('click',join);
$('rf-sync').addEventListener('click',()=>sync());$('rf-retry').addEventListener('click',load);
document.addEventListener('gj-boo',()=>{
  if(A.identity()===null){toast(0);return}
  if(state&&!isOpen()){toast(count());return}
  session.clicks=Math.min(1000000,session.clicks+1);persist();
  const n=count();toast(n);render();if(selected())savedStatus();
  if(selected()&&ready&&isOpen()){if(pending()>=20)sync();else scheduleSync()}
  if(n>=100&&!milestoneShown&&isOpen()){milestoneShown=true;openModal()}
});
function closeModal(){$('gift-modal').hidden=true;document.body.style.overflow='';modalFocus?.focus()}
function openModal(){modalFocus=document.activeElement;$('gift-modal').hidden=false;document.body.style.overflow='hidden';$('g-close').focus()}
$('g-close').addEventListener('click',closeModal);
$('gift-modal').addEventListener('click',e=>{if(e.target===$('gift-modal'))closeModal()});
$('gift-modal').addEventListener('keydown',e=>{
  if(e.key==='Escape')closeModal();
  if(e.key==='Tab'){
    const first=$('g-close'),last=$('g-enter');
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
});
$('g-enter').addEventListener('click',()=>{closeModal();$('raffle').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});A.identity()===null?A.open():$('rf-sync').focus({preventScroll:true})});
$('rf-draw').addEventListener('click',async()=>{
  const pw=$('rf-admin-pw').value;if(!pw){$('rf-admin-msg').textContent='운영진 비밀번호를 입력해줘.';return}
  if(spinning)return;spinning=true;countdown();$('rf-admin-msg').textContent='유령이 한 명을 고르는 중…';
  try{
    const j=await call('draw',{pw});accept(j);$('rf-admin-pw').value='';
    spinning=false;drawWheel(j.entries);spinning=true;
    const total=j.totalTickets;let before=0;for(const e of j.entries){if(e.i===j.winner)break;before+=e.tickets}
    const winner=j.entries.find(e=>e.i===j.winner),center=(before+winner.tickets/2)/total*360;
    rotation=Math.ceil(rotation/360)*360+1800+(360-center)%360;
    const canvas=$('rf-wheel');canvas.style.transition='';canvas.style.transform=`rotate(${rotation}deg)`;
    let done=false;const finish=()=>{if(done)return;done=true;spinning=false;render();$('rf-admin-msg').textContent='추첨 완료. 결과가 저장됐고 다시 뽑을 수 없어.';canvas.removeEventListener('transitionend',finish)};
    canvas.addEventListener('transitionend',finish);setTimeout(finish,matchMedia('(prefers-reduced-motion: reduce)').matches?0:5500);
  }catch(e){spinning=false;$('rf-admin-msg').textContent=errorText(e);render();load()}
});
function adminVisibility(){$('rf-admin').hidden=location.hash!=='#admin'}
window.addEventListener('hashchange',adminVisibility);adminVisibility();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load();else if(pending())sync(true)});
window.addEventListener('pagehide',()=>{if(pending())sync(true)});
setInterval(()=>{if(document.visibilityState==='visible'){if(pending()&&selected()&&ready)sync();else load()}},10000);
setInterval(countdown,1000);persist();render();
A.subscribe(()=>{mine=null;acknowledged=0;personalTime=0;ready=false;closeModal();
  clearTimeout(syncTimer);nameSelect.value=A.identity()===null?'':String(A.identity());render();
  if(A.identity()!==null)join();else{setStatus('로그인하면 내 횟수를 이어갈 수 있어.');load()}
});
A.beforeLogout(async()=>!pending()||!selected()||!isOpen()?true:syncBusy?false:sync());
if(A.identity()!==null)join();else load();
})();
