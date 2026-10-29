(() => {
'use strict';
const NAMES=['구세라','권경지','권순록','김강일','류원선','박재훈','서정윤','유세종','이대호','이수한','천수진'];
const PHASES={collecting:'질문 모집 중',voting:'투표 중',tiebreak:'동점 추가 투표',ranking:'순위 공개',author:'작성자 공개',finished:'게임 끝'};
const $=id=>document.getElementById(id),API=(window.GJ_API||'').trim(),name=$('third-name'),prompt=$('third-prompt');
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
let state=null,online=false,loading=false,busy=false,timer=null,visible=true,dirty=false,entryRevision=0,entryWho=null,choices=[],ballotKey='',paintKey='';
let adminPw='',adminEntries=null,adminRevision=-1,confirmation=null;
const A=window.GJ_AUTH;
const identity=()=>A.identity();
const mine=()=>state?.mine?.i===identity()?state.mine:null;
const playing=()=>state&&['voting','tiebreak'].includes(state.phase);
const canVote=()=>online&&!busy&&playing()&&mine()&&!mine().isAuthor&&!mine().voted;
const canEdit=()=>online&&!busy&&state?.phase==='collecting'&&!!mine()?.entry&&entryWho===identity();
function message(id,text,bad=false){$(id).textContent=text;$(id).className='msg'+(bad?' bad':'')}
function errorText(e){if((e.code||e.message).startsWith('auth_'))return A.errorText(e);return {badpw:'운영진 비밀번호가 맞지 않아.',third_stale:'진행 상황이 바뀌었어. 최신 내용을 확인한 뒤 다시 눌러줘.',entry_stale:'다른 창에서 질문이 수정됐어. 내 질문을 다시 불러온 뒤 수정해줘.',third_locked:'게임이 시작돼서 질문 수정은 마감됐어.',third_phase:'지금 단계에서는 진행할 수 없어.',no_questions:'진행할 질문이 하나 이상 필요해.',no_votes:'투표가 한 표 이상 들어와야 마감할 수 있어.',bad_prompt:'질문을 5~180자로 적어줘.',bad_identity:'내 이름을 먼저 골라줘.',bad_choices:'서로 다른 사람을 순위별로 골라줘.',author_vote:'내가 만든 질문이야. 이번에는 친구들의 투표를 기다려줘.',vote_closed:'이번 투표가 마감됐어.',bad_op:'서버 연결을 준비하고 있어. 잠시 후 다시 연결해줘.'}[e.message]||'연결을 확인하지 못했어. 다시 연결하면 서버에 저장된 내용을 확인할 수 있어.'}
async function call(op,values={}){
  return A.request({a:'gift',op,...(identity()===null?{}:{i:identity()}),...values},{required:['thirdSave','thirdVote'].includes(op)});
}

function accept(j){
  if(j.version!==1||!Object.hasOwn(PHASES,j.phase)||!Array.isArray(j.history))throw Error('bad_response');
  if(state&&(j.revision<state.revision||(j.revision===state.revision&&j.serverNow<state.serverNow)))return false;
  state=j;online=true;
  if(identity()!==null)A.summary('third',j.phase==='collecting'?(mine()?.entry?.prompt?'내 질문 수정하기':'3등 질문 작성하기'):'3등 게임 '+PHASES[j.phase],identity());
  if(mine()?.entry&&!dirty){prompt.value=mine().entry.prompt;entryRevision=mine().entry.revision;entryWho=identity();}
  const key=[j.runId,j.round,j.stage,identity()].join('/');
  if(key!==ballotKey){ballotKey=key;choices=[];paintKey='';}
  if(mine()?.voted)choices=mine().choices.slice();
  if(j.entries){adminEntries=j.entries;adminRevision=j.revision;renderReview();}
  render();return true;
}
function normalStatus(){
  if(!state)return;
  const m=mine();
  const text=state.phase==='collecting'?identity()===null?'로그인하고 질문을 하나 적어줘.':!m?.entry?'내 질문을 불러오는 중…':m.entry.prompt?'질문이 저장돼 있어. 시작 전까지 수정할 수 있어.':'본인이 3등 할 것 같은 질문을 적어줘.':playing()?identity()===null?'로그인하고 투표에 참여해줘.':!m?'참여 정보를 확인하고 있어…':m.isAuthor?'내가 만든 질문이야! 투표하지 않고 친구들의 선택을 기다려줘.':m.voted?'투표 완료! 운영진이 결과를 공개할 때까지 기다려줘.':state.phase==='tiebreak'?'3등이 걸린 동점이야. 표시된 후보들 중에서 다시 순위를 골라줘.':'질문에 어울리는 사람을 1·2·3순위로 골라줘.':state.phase==='ranking'?'순위가 공개됐어. 누가 만든 질문인지는 곧 공개할게!':state.phase==='author'?'다음 진행을 기다려줘.':'모든 질문이 끝났어. 우리의 3등 예측 결과를 확인해봐!';
  message('third-status',text);
}
function renderBallot(){
  const m=mine(),key=JSON.stringify([ballotKey,choices,m?.voted,m?.isAuthor]);
  if(paintKey!==key){
    paintKey=key;const root=$('third-picks');root.replaceChildren();
    for(let k=0;k<state.pickCount;k++){
      const row=node('div','third-pick'),label=node('label',null,(k+1)+'순위'),select=node('select');select.id='third-pick-'+k;label.htmlFor=select.id;
      select.append(new Option('한 명 선택',''));
      state.candidates.forEach(i=>{const o=new Option(NAMES[i],String(i));o.disabled=choices.includes(i)&&choices[k]!==i;select.append(o)});
      select.value=choices[k]===undefined?'':String(choices[k]);
      select.addEventListener('change',()=>{choices[k]=select.value===''?undefined:Number(select.value);paintKey='';render();$('third-pick-'+k)?.focus()});
      row.append(label,select);root.append(row);
    }
  }
  for(let k=0;k<state.pickCount;k++)$('third-pick-'+k).disabled=!canVote();
  $('third-vote-help').textContent=state.phase==='tiebreak'?`동점 후보 ${state.candidates.length}명 중 ${state.pickCount}명을 순서대로 골라줘. 순서대로 ${Array.from({length:state.pickCount},(_,k)=>state.pickCount-k).join('·')}점. 제출 후에는 바꿀 수 없어.`:'1순위 3점 · 2순위 2점 · 3순위 1점. 서로 다른 사람을 골라줘. 제출 후에는 바꿀 수 없어.';
  $('third-vote').disabled=!canVote()||choices.length!==state.pickCount||!Array.from({length:state.pickCount},(_,k)=>Number.isInteger(choices[k])).every(Boolean)||new Set(choices).size!==state.pickCount;
  $('third-vote').hidden=!!m?.voted;$('third-vote').textContent=busy?'투표 저장 중…':'선택한 순서로 투표';
}
function render(){
  const phase=state?.phase||'collecting',m=mine();
  $('third-phase').textContent=state?PHASES[phase]:'연결 중…';
  $('third-count').textContent=!state?'':phase==='collecting'?`${state.submittedCount} / 11명 질문 제출`:phase==='finished'?`${state.totalQuestions}개 질문 완료`:`${state.round+1} / ${state.totalQuestions}번째 질문`;
  $('third-title').textContent=state?.question?.prompt||(phase==='finished'?'딱 3등, 얼마나 맞혔을까?':'본인이 3등 할 질문은?');
  name.disabled=true; $('third-identity').hidden=phase==='finished';
  $('third-entry').hidden=phase!=='collecting'||identity()===null;
  prompt.disabled=!canEdit();$('third-save').disabled=!canEdit()||prompt.value.trim().length<5||prompt.value.trim().length>180||(!dirty&&!!m?.entry?.prompt);
  $('third-save').textContent=busy?'질문 저장 중…':m?.entry?.prompt?'질문 수정 저장':'질문 저장';
  $('third-saved').textContent=dirty?'아직 저장하지 않은 내용이 있어. 저장 버튼을 눌러줘.':'한 사람당 하나. 운영진이 시작하기 전까지 수정할 수 있어.';
  $('third-ballot').hidden=!playing()||!m||m.isAuthor;
  if(!$('third-ballot').hidden)renderBallot();
  $('third-results').hidden=!['ranking','author'].includes(phase);
  if(!$('third-results').hidden){
    const list=$('third-ranking');list.replaceChildren();
    state.ranking.forEach(r=>{const li=node('li',r.rank===3?'mine':''),person=node('div',null,NAMES[r.i]);if(state.ranking.some(x=>x.tieScore))person.append(node('small',null,'추가 투표 '+r.tieScore+'점'));li.append(node('span',null,r.rank+'위'),person,node('strong',null,r.score+'점'));list.append(li)});
  }
  const reveal=$('third-reveal');reveal.hidden=phase!=='author';
  if(!reveal.hidden){const r=state.reveal;reveal.replaceChildren();reveal.className='third-reveal'+(r.success?' success':'');reveal.append(node('h4',null,'이 질문의 작성자는 '+NAMES[r.author]+'!'),node('p',null,r.success?'딱 3등 예측 성공! 🥉':r.rank?`${r.rank}위! 아쉽지만 3등 예측은 실패 😆`:'받은 표가 없어서 이번 예측은 실패 😆'));}
  $('third-finish').hidden=phase!=='finished';
  if(phase==='finished'){
    const wins=state.history.filter(r=>r.success);$('third-winners').textContent=wins.length?wins.map(r=>NAMES[r.author]).join(' · '):'이번에는 3등을 맞힌 사람이 없어!';
    const list=$('third-history');list.replaceChildren();state.history.forEach(r=>list.append(node('li',null,`${NAMES[r.author]} · ${r.success?'성공 🥉':r.rank?r.rank+'위':'득표 없음'} — ${r.prompt}`)));
  }
  $('third-retry').disabled=busy||loading;$('third-retry').textContent=loading?'불러오는 중…':'다시 연결';renderAdmin();
}
function schedule(){clearTimeout(timer);timer=setTimeout(load,playing()&&(visible||adminPw||identity()!==null)?3000:20000)}
async function load(){
  if(loading||busy||document.visibilityState!=='visible'){schedule();return}
  loading=true;render();const who=identity(),authEpoch=A.epoch;
  try{accept(await call('thirdStatus'));normalStatus()}catch(e){online=false;message('third-status',errorText(e),true)}
  finally{loading=false;render();if(who!==identity()||authEpoch!==A.epoch)load();else schedule()}
}
async function mutate(op,values){
  if(busy)return;busy=true;render();message('third-status',op==='thirdSave'?'질문을 저장하고 있어…':'투표를 저장하고 있어…');
  try{const j=await call(op,values);if(op==='thirdSave')dirty=false;accept(j);normalStatus();}
  catch(e){
    if(e.message==='entry_stale'){dirty=false;entryWho=null;}
    try{accept(await call('thirdStatus'));}catch(_){online=false;}
    message('third-status',errorText(e),true);
  }finally{busy=false;render();schedule();}
}
name.append(new Option('내 이름 선택',''));NAMES.forEach((n,i)=>name.append(new Option(n,String(i))));
A.bindIdentity(name);
name.addEventListener('change',()=>{dirty=false;prompt.value='';entryWho=null;choices=[];paintKey='';render();message('third-status','내 정보를 불러오는 중…');load()});
prompt.addEventListener('input',()=>{dirty=true;render()});
$('third-entry').addEventListener('submit',e=>{e.preventDefault();if(canEdit()&&!$('third-save').disabled)mutate('thirdSave',{prompt:prompt.value.trim(),entryRevision})});
$('third-vote').addEventListener('click',()=>{if(canVote()&&!$('third-vote').disabled)mutate('thirdVote',{runId:state.runId,round:state.round,stage:state.stage,choices:choices.slice()})});
$('third-retry').addEventListener('click',load);
function renderReview(){
  const list=$('third-admin-list');list.replaceChildren();
  (adminEntries||[]).forEach(e=>{const li=node('li',e.enabled?'':'excluded');li.append(node('p',null,e.prompt));const b=node('button',null,e.enabled?'이번 게임에서 제외':'다시 포함');b.type='button';b.addEventListener('click',()=>adminAction('thirdReview',{id:e.id,enabled:!e.enabled},adminRevision));li.append(b);list.append(li)});
  if(adminEntries&&!adminEntries.length)list.append(node('li',null,'아직 제출된 질문이 없어.'));
}
function renderAdmin(){
  const phase=state?.phase,enabled=(adminEntries||[]).filter(e=>e.enabled).length;
  $('third-admin-summary').textContent=!state?'연결 확인 중…':phase==='collecting'?`${state.submittedCount}명 제출 · 검토 목록 ${enabled}개 포함${adminRevision!==state.revision?' · 새로고침 필요':''}`:`${state.round+1} / ${state.totalQuestions}번 · ${PHASES[phase]}${playing()?` · ${state.votedCount} / 10명 투표`:''}`;
  $('third-review').hidden=phase!=='collecting';
  for(const [id,show] of [['third-start',phase==='collecting'],['third-close',playing()],['third-author',phase==='ranking'],['third-next',phase==='author'&&state.round+1<state.totalQuestions],['third-end',phase==='author'&&state.round+1===state.totalQuestions],['third-prepare',phase==='finished']]){$(id).hidden=!show;$(id).disabled=busy||!adminPw||!online;}
  $('third-start').disabled=busy||!adminPw||!online||!enabled||adminRevision!==state?.revision;
  $('third-close').disabled=busy||!adminPw||!online||!state?.votedCount;
  $('third-close').textContent=phase==='tiebreak'?'추가 투표 마감 · 순위 공개':'투표 마감 · 순위 확인';
  $('third-admin-refresh').disabled=busy||!adminPw;
  $('third-admin-list').querySelectorAll('button').forEach(b=>b.disabled=busy||!adminPw||!online||phase!=='collecting'||adminRevision!==state?.revision);
  $('third-confirm-go').disabled=busy||!adminPw;$('third-confirm-cancel').disabled=busy;
}
async function adminLoad(){
  if(!adminPw||busy)return;const pw=adminPw;busy=true;render();message('third-admin-status','질문과 진행 상황을 확인하고 있어…');
  try{const j=await call('thirdAdmin',{pw});if(adminPw===pw){accept(j);message('third-admin-status','연결됐어. 질문을 검토한 뒤 시작해줘.');}}
  catch(e){message('third-admin-status',errorText(e),true)}finally{busy=false;render();schedule();}
}
function clearConfirm(){confirmation=null;$('third-confirm').hidden=true;}
function confirmAction(op,text){if(busy||!adminPw)return;confirmation={op,revision:state.revision};$('third-confirm-text').textContent=text;$('third-confirm').hidden=false;$('third-confirm-go').focus();}
async function adminAction(op,extra={},revision=state.revision){
  if(busy||!adminPw)return;const pw=adminPw;busy=true;render();message('third-admin-status','진행 내용을 저장하고 있어…');
  try{const j=await call(op,{pw,revision,...extra});if(adminPw===pw){accept(j);normalStatus();message('third-admin-status',op==='thirdStart'?'질문을 마감하고 무작위 첫 질문을 시작했어.':j.phase==='tiebreak'?'3등이 걸린 동점이라 추가 투표를 열었어.':'진행 상황을 반영했어.');}}
  catch(e){message('third-admin-status',errorText(e),true);try{const j=await call('thirdAdmin',{pw});if(adminPw===pw)accept(j)}catch(_){online=false;}}
  finally{clearConfirm();busy=false;render();schedule();}
}
window.GJ_THIRD_ADMIN={connect(password){adminPw=password;adminLoad();},disconnect(){adminPw='';adminEntries=null;adminRevision=-1;clearConfirm();$('third-admin-list').replaceChildren();render();}};
$('third-admin-refresh').addEventListener('click',adminLoad);
$('third-start').addEventListener('click',()=>confirmAction('thirdStart',`${(adminEntries||[]).filter(e=>e.enabled).length}개 질문으로 시작할까? 질문 수정이 마감되고 무작위 순서가 확정돼.`));
$('third-close').addEventListener('click',()=>confirmAction('thirdClose',`${state.votedCount} / 10명이 투표했어. 지금 투표를 마감할까? 3등이 걸린 동점이면 추가 투표로 이어져.`));
$('third-author').addEventListener('click',()=>adminAction('thirdAuthor'));
$('third-next').addEventListener('click',()=>adminAction('thirdNext'));
$('third-end').addEventListener('click',()=>adminAction('thirdFinish'));
$('third-prepare').addEventListener('click',()=>confirmAction('thirdPrepare','지난 결과를 보관하고 질문을 다시 모을까? 기존 질문은 유지되고 다시 수정할 수 있어.'));
$('third-confirm-go').addEventListener('click',()=>{if(confirmation)adminAction(confirmation.op,{},confirmation.revision)});
$('third-confirm-cancel').addEventListener('click',clearConfirm);
A.subscribe(()=>{if(state)delete state.mine;dirty=false;prompt.value='';entryWho=null;entryRevision=0;choices=[];paintKey='';render();load()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()});
if('IntersectionObserver' in window)new IntersectionObserver(entries=>{const was=visible;visible=entries[0].isIntersecting;if(visible&&!was)load()},{rootMargin:'300px'}).observe($('third'));
load();
})();
