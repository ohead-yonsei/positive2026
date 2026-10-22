(function(){
'use strict';
const NAMES=['구세라','권경지','권순록','김강일','류원선','박재훈','서정윤','유세종','이대호','이수한','천수진'];
const $=id=>document.getElementById(id), KEY='gj26-raffle-v3';
const API=/^https:\/\/script\.google\.com\//.test(window.GJ_API||'')?window.GJ_API.trim():'';
const read=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const write=(k,v)=>{try{localStorage.setItem(k,v);return localStorage.getItem(k)===v}catch(e){return false}};
const count=()=>Math.min(1000000,Math.max(0,Math.floor(Number(read('gj26-boo'))||0)));
let identity=null;
try{const v=JSON.parse(read(KEY));if(v&&Number.isInteger(v.i)&&v.i>=0&&v.i<11&&/^[a-f0-9]{64}$/.test(v.token))identity=v}catch(e){}
let state=null, offset=0, toastTimer, syncBusy=false, loadBusy=false, spinning=false, modalFocus=null;
let lastCount=-1, wheelKey='', rotation=0, milestoneShown=false;
const localMine=()=>identity&&state&&state.entries.find(e=>e.i===identity.i);
const now=()=>Date.now()+offset;
const isOpen=()=>state&&state.phase==='open'&&now()<state.closeAt;
const setStatus=(text,bad=false)=>{ $('rf-status').textContent=text; $('rf-status').className='raffle-status'+(bad?' bad':''); };
const errorText=e=>({closed:'응모가 마감됐어. 마감 전에 서버에 저장된 응모권으로 추첨해.',entry_taken:'이 이름은 다른 브라우저에서 응모했어. 처음 응모한 폰·브라우저에서 열어줘.',denied:'응모 정보를 확인하지 못했어. 처음 응모한 폰·브라우저에서 열어줘.',badpw:'운영진 비밀번호가 맞지 않아.',not_closed:'10월 31일 0시부터 추첨할 수 있어.',no_entries:'응모자가 없어. 아직 추첨할 수 없어.',not_drawn:'아직 추첨 전이야.',not_winner:'기프티콘은 당첨자만 열 수 있어.',already_awarded:'이미 선물 지급 또는 추첨이 완료됐어.',bad_count:'유령을 100번 이상 놀래킨 다음 응모해줘.',server_update:'추첨 이벤트를 준비 중이야. 잠시 후 새로고침해줘.'}[e.code]||'연결하지 못했어. 횟수는 이 브라우저에 남아 있어. 다시 시도해줘.');
async function call(op,values={},keepalive=false){
  if(!API)throw Object.assign(new Error(),{code:'server_update'});
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
  try{
    const params={a:'gift',op,...values};
    const res=await fetch(op==='status'?API+'?'+new URLSearchParams(params):API,op==='status'?{signal:controller.signal,cache:'no-store'}:{method:'POST',body:JSON.stringify(params),signal:controller.signal,keepalive});
    if(!res.ok)throw new Error('network');
    const j=await res.json();if(!j.ok)throw Object.assign(new Error(j.err),{code:j.err});
    if(op!=='view'&&j.version!==3)throw Object.assign(new Error(),{code:'server_update'});
    return j;
  }finally{clearTimeout(timer)}
}
function accept(j){
  if(!state||j.serverNow>=state.serverNow){state=j;offset=j.serverNow-Date.now()}
  if(j.mine&&identity&&j.mine.i===identity.i){identity.confirmed=true;lastCount=j.mine.count;write(KEY,JSON.stringify(identity))}
  render();
}
function line(n){
  if(spinning)return '룰렛이 돌아가는 중… 유령의 선택은?';
  if(state&&state.phase==='drawn')return '유령의 선물은 '+NAMES[state.winner]+'에게 🎉';
  if(state&&state.phase==='legacy-awarded')return '선물은 이미 '+NAMES[state.winner]+'에게 갔어';
  if(state&&!isOpen())return '응모 마감! 10월 31일 룰렛을 기다려줘.';
  if(identity&&identity.confirmed){const t=localMine()?.tickets||0;return t===5?'응모권 5장 모두 모았어! 31일에 만나 👻':`서버에 저장된 응모권 ${t}장 · 100번마다 한 장 더!`}
  return n>=100?'추첨권을 받으려면 이름을 골라 응모해줘!':'100번 놀래키면 추첨권 1장! 최대 5장 👻';
}
function toast(n){
  const t=$('bootoast');t.replaceChildren(document.createTextNode(`유령을 ${n}번 놀래켰어 👻`));
  const small=document.createElement('small');small.textContent=line(n);t.append(small);t.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true},2200);
}
function countdown(){
  if(!state){$('rf-clock').textContent='10.30 밤 11:59까지 응모 · 10.31 현장 추첨';return}
  const remaining=Math.max(0,state.closeAt-now());
  if(state.phase==='drawn'||state.phase==='legacy-awarded')$('rf-clock').textContent='이벤트가 종료됐어. 함께 놀래켜줘서 고마워!';
  else if(!remaining)$('rf-clock').textContent='응모 마감 · 운영진의 룰렛을 기다리는 중';
  else {const s=Math.floor(remaining/1000);$('rf-clock').textContent=`마감까지 ${Math.floor(s/86400)}일 ${Math.floor(s/3600)%24}시간 ${Math.floor(s/60)%60}분`}
  $('rf-enroll').disabled=!isOpen()||count()<100||syncBusy||!!identity?.confirmed;
  $('rf-sync').disabled=!isOpen()||syncBusy;
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
  const n=count(),mine=localMine(),confirmed=identity?.confirmed;
  $('rf-count').textContent=n.toLocaleString()+'번';$('rf-tickets').textContent=(confirmed&&mine?mine.tickets:0)+' / 5장';
  $('boocount').textContent=n?`유령을 ${n}번 놀래켰어 👻 · ${line(n)}`:'';
  const toastLine=$('bootoast').querySelector('small');if(toastLine&&!$('bootoast').hidden)toastLine.textContent=line(n);
  $('rf-name').disabled=!!confirmed;if(identity)$('rf-name').value=String(identity.i);
  $('rf-enroll').hidden=!!confirmed;$('rf-sync').hidden=!confirmed;
  $('rf-enroll').textContent=n<100?`${100-n}번 더 놀래키면 응모 가능`:'이 횟수로 응모하기';
  const won=state&&state.phase==='drawn'&&confirmed&&state.winner===identity.i&&!spinning;
  const legacyWon=state&&state.phase==='legacy-awarded'&&!!read('gj26-gift-token');
  $('g-again').hidden=!(won||legacyWon);$('rf-prize').hidden=!(won||legacyWon);
  $('rf-winner').hidden=!(state&&(state.phase==='drawn'||state.phase==='legacy-awarded'))||spinning;
  if(state){
    $('rf-total').textContent=`${state.entries.length}명 참여 · 전체 응모권 ${state.totalTickets}장`;
    $('rf-winner').textContent='🎉 '+NAMES[state.winner]+' 당첨!';
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
  countdown();
}
async function load(){
  if(loadBusy)return;loadBusy=true;
  try{
    const j=await call(identity?.confirmed?'mine':'status',identity?.confirmed?{i:identity.i,token:identity.token}:{});accept(j);
    if(!identity?.confirmed)setStatus(isOpen()?'100번부터 응모할 수 있어. 기존에 누른 횟수도 포함돼.':'마감 전에 저장된 응모권으로 추첨해.');
    else if(lastCount>=count())setStatus('응모권이 서버에 저장됐어 ✓');
    if(identity?.confirmed&&isOpen()&&count()>lastCount)sync();
  }catch(e){setStatus(errorText(e),true);if(e.code==='denied')try{accept(await call('status'))}catch(_){} }
  finally{loadBusy=false}
}
async function sync(keepalive=false){
  if(syncBusy||!identity||!isOpen()||count()<100)return;
  syncBusy=true;countdown();setStatus('응모권 저장 중…');
  const sent=count();
  try{accept(await call(identity.confirmed?'sync':'enroll',{i:identity.i,token:identity.token,count:sent},keepalive));setStatus(count()>sent?'추가 횟수를 저장하는 중…':'응모권이 서버에 저장됐어 ✓')}
  catch(e){setStatus(errorText(e),true);if(e.code==='closed'||e.code==='already_awarded')load()}
  finally{syncBusy=false;render();if(identity?.confirmed&&isOpen()&&count()>sent)setTimeout(()=>sync(),500)}
}
const nameSelect=$('rf-name');nameSelect.append(new Option('이름 선택',''));
NAMES.forEach((n,i)=>nameSelect.append(new Option(n,String(i))));
if(!identity&&read('gj26-name')!==null)nameSelect.value=read('gj26-name');
$('rf-enroll').addEventListener('click',()=>{
  if(nameSelect.value===''){setStatus('응모할 이름을 골라줘.',true);nameSelect.focus();return}
  if(!isOpen())return;
  try{
    const token=identity?.token||Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
    const v={i:Number(nameSelect.value),token,confirmed:false};
    if(!write(KEY,JSON.stringify(v))){setStatus('응모 확인을 저장할 수 없어. 일반 브라우저에서 저장을 허용한 뒤 응모해줘.',true);return}
    identity=v;sync();
  }catch(e){setStatus('이 브라우저에서는 응모 정보를 만들지 못했어. 크롬이나 사파리로 열어줘.',true)}
});
$('rf-sync').addEventListener('click',()=>sync());
$('rf-retry').addEventListener('click',load);
document.addEventListener('gj-boo',e=>{
  const n=e.detail;toast(n);render();
  if(identity?.confirmed&&isOpen()&&(n%20===0||Math.floor(n/100)>Math.floor(Math.max(lastCount,0)/100)))sync();
  if(n>=100&&!identity?.confirmed&&!milestoneShown&&isOpen()){
    milestoneShown=true;openModal('g-ask');
  }
});
function closeModal(){ $('gift-modal').hidden=true;$('g-img').removeAttribute('src');document.body.style.overflow='';modalFocus?.focus(); }
function openModal(pane){
  modalFocus=document.activeElement;
  for(const id of ['g-ask','g-win'])$(id).hidden=id!==pane;
  $('g-title').textContent=pane==='g-win'?'🎉 유령의 선물 당첨!':'👻 100번 놀래킴 달성!';
  $('gift-modal').hidden=false;document.body.style.overflow='hidden';$('g-close').focus();
}
$('g-close').addEventListener('click',closeModal);
$('gift-modal').addEventListener('click',e=>{if(e.target===$('gift-modal'))closeModal()});
$('gift-modal').addEventListener('keydown',e=>{
  if(e.key==='Escape')closeModal();
  if(e.key==='Tab'){
    const items=Array.from($('gift-modal').querySelectorAll('button')).filter(e=>!e.closest('[hidden]')&&!e.disabled);
    const first=items[0],last=items[items.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
});
$('g-enter').addEventListener('click',()=>{closeModal();$('raffle').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});nameSelect.focus({preventScroll:true})});
async function viewPrize(){
  setStatus('선물을 불러오는 중…');
  try{const legacy=state?.phase==='legacy-awarded';const j=await call('view',legacy?{token:read('gj26-gift-token')}:{i:identity.i,token:identity.token});$('g-img').src=j.img;openModal('g-win');setStatus('기프티콘을 캡처해서 보관해줘.')}catch(e){setStatus(errorText(e),true)}
}
$('g-again').addEventListener('click',viewPrize);$('rf-prize').addEventListener('click',viewPrize);
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
window.addEventListener('storage',e=>{if(e.key==='gj26-boo'){render();if(identity?.confirmed)sync()}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load();else if(identity?.confirmed&&count()>lastCount)sync(true)});
window.addEventListener('pagehide',()=>{if(identity?.confirmed&&count()>lastCount)sync(true)});
setInterval(()=>{if(document.visibilityState==='visible')load()},20000);
setInterval(countdown,1000);render();load();
})();
