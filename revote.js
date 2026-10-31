(() => {
'use strict';
const NAMES=['구세라','권경지','권순록','김강일','류원선','박재훈','서정윤','유세종','이대호','이수한','천수진'];
const $=id=>document.getElementById(id),A=window.GJ_AUTH,choice=$('rv-choice');
let state=null,stamp=0,online=false,loading=false,sending=false,review=null,adminPw='',confirmation=null,adminEpoch=0;
const done=()=>state?.submitted.includes(A.identity());
const canVote=()=>online&&state?.phase==='open'&&A.identity()!==null&&!done()&&!sending;
function message(id,text,bad=false){$(id).textContent=text;$(id).className='msg'+(bad?' bad':'')}
function clear(){review=null;choice.value=''}
function accept(j){
  const r=j.revote;
  if(!r){online=false;render();return}
  if(!['none','open','revealed'].includes(r.phase)||!Array.isArray(r.submitted)||!Number.isInteger(r.revision))throw Error('bad_response');
  if(state&&(j.serverNow<stamp||r.revision<state.revision||(r.revision===state.revision&&r.total<state.total)))return;
  if(!state||state.id!==r.id||state.phase!==r.phase){clear();confirmation=null}
  state=r;stamp=j.serverNow;online=true;
  if(done())clear();
  render();
}
function apply(j){if(window.GJ_VOTE)window.GJ_VOTE.accept(j);else accept(j)}
function render(){
  const phase=state?.phase||'none',voted=done(),who=A.identity();
  $('revote').hidden=false;
  $('rv-total').textContent=state?phase==='none'?'준비 중':`${state.total}명 투표 완료`:'연결 중…';
  $('rv-prompt').textContent=state?.prompt||'새 질문을 기다리고 있어!';
  $('rv-info').textContent=phase==='none'?'새 질문이 정해지면 운영진이 재투표를 열어줄게.':phase==='open'?'새 질문에 한 명만 골라줘. 운영진이 마감하면 결과가 공개돼.':'재투표가 마감됐어. 새 질문으로 함께 고른 결과야!';
  $('rv-login').hidden=phase!=='open'||who!==null;
  $('rv-form').hidden=phase!=='open'||who===null||!!voted;
  $('rv-who').textContent=who===null?'한 명 선택':NAMES[who]+'의 선택';
  choice.disabled=!canVote()||!!review;
  $('rv-review').hidden=!!review;$('rv-review').disabled=!canVote()||choice.value==='';
  $('rv-confirm').hidden=!review;$('rv-send').disabled=!canVote()||!review;
  $('rv-send').textContent=sending?'재투표 저장 중…':'이대로 재투표하기';$('rv-edit').disabled=sending;
  $('rv-done').hidden=!voted||phase!=='open';$('rv-done').textContent=voted?'재투표 완료! 브라우저가 바뀌어도 내 이름으로 잘 보관돼 있어.':'';
  const result=$('rv-results');result.hidden=phase!=='revealed';result.replaceChildren();
  if(phase==='revealed'){
    const max=Math.max(...state.counts),winners=NAMES.filter((_,i)=>state.counts[i]===max),title=document.createElement('p');title.className='vote-winner';
    title.textContent=max?'🏆 '+winners.join(' · ')+(winners.length>1?' 공동 1위!':'!'):'아직 받은 표가 없어';result.append(title);
    const list=document.createElement('ul');list.className='vote-ranking';
    NAMES.map((name,i)=>({name,i,count:state.counts[i]})).sort((a,b)=>b.count-a.count||a.i-b.i).forEach(e=>{
      const li=document.createElement('li'),name=document.createElement('span'),bar=document.createElement('span'),fill=document.createElement('span'),count=document.createElement('b');
      name.textContent=e.name;bar.className='vote-bar';bar.setAttribute('aria-hidden','true');fill.style.width=(max?e.count/max*100:0)+'%';bar.append(fill);count.textContent=e.count+'표';li.append(name,bar,count);list.append(li);
    });result.append(list);
  }
  $('rv-refresh').disabled=loading||sending;$('rv-refresh').textContent=loading?'불러오는 중…':'재투표 현황 새로고침';
  $('rv-admin-summary').textContent=!state?'서버 연결을 확인해줘.':phase==='none'?'아직 열지 않았어. 새 질문을 입력해줘.':`${phase==='open'?'재투표 진행 중':'재투표 결과 공개'} · ${state.total}명 투표 완료\n${state.prompt}`;
  $('rv-admin-fields').hidden=phase!=='none';$('rv-admin-prompt').disabled=sending||!!confirmation;
  const prompt=$('rv-admin-prompt').value.trim();
  $('rv-admin-open').disabled=!adminPw||!online||sending||!!confirmation||prompt.length<5||prompt.length>180;
  $('rv-admin-reveal').hidden=phase!=='open';$('rv-admin-reveal').disabled=!adminPw||!online||sending||!state?.total||!!confirmation;
  $('rv-admin-confirm').hidden=!confirmation;$('rv-admin-go').disabled=!adminPw||!online||sending;
  $('rv-admin-cancel').disabled=sending;$('rv-admin-refresh').disabled=loading||sending;
}
async function load(){
  if(loading||sending)return;
  loading=true;render();
  try{apply(await A.request({a:'gift',op:'voteStatus'}));message('rv-status','');if(adminPw)message('rv-admin-status','')}
  catch(e){online=false;message('rv-status','연결이 늦어지고 있어. 현황 새로고침으로 다시 확인해줘.',true);if(adminPw)message('rv-admin-status','진행 상황을 확인하지 못했어. 새로고침해줘.',true)}
  finally{loading=false;render()}
}
function error(e){return {badpw:'운영진 비밀번호가 맞지 않아.',bad_prompt:'질문은 5~180자로 입력해줘.',revote_stale:'진행 상황이 바뀌었어. 새로고침한 뒤 다시 확인해줘.',revote_phase:'지금 단계에서는 진행할 수 없어. 현황을 새로고침해줘.',no_votes:'먼저 한 명 이상 투표해야 해.',vote_closed:'재투표가 마감됐어. 현황을 새로고침해줘.'}[e.code||e.message]||((e.code||e.message).startsWith('auth_')?A.errorText(e):'저장 여부를 확인하지 못했어. 현황을 새로고침해줘. 저장됐다면 다시 집계하지 않아.')}
choice.append(new Option('한 명 선택',''));NAMES.forEach((name,i)=>choice.append(new Option(name,String(i))));
choice.addEventListener('change',()=>{review=null;render()});
$('rv-login').addEventListener('click',()=>A.open());
$('rv-form').addEventListener('submit',e=>{
  e.preventDefault();if(!canVote()||choice.value==='')return;
  review={i:A.identity(),choice:Number(choice.value),revoteId:state.id};
  $('rv-review-text').textContent=NAMES[review.i]+'의 선택은 '+NAMES[review.choice]+'!';render();$('rv-send').focus();
});
$('rv-edit').addEventListener('click',()=>{review=null;render();choice.focus()});
$('rv-send').addEventListener('click',async()=>{
  if(!canVote()||!review||review.i!==A.identity())return;
  const ballot={...review},epoch=A.epoch;sending=true;render();message('rv-status','재투표를 저장하는 중…');
  try{const j=await A.request({a:'gift',op:'voteSubmit',...ballot},{required:true});apply(j);if(epoch===A.epoch)message('rv-status',j.alreadyVoted?'이미 제출한 재투표가 보관돼 있어.':'재투표 완료! 운영진이 마감하면 결과를 확인해줘.')}
  catch(e){online=false;message('rv-status',error(e),true)}
  finally{sending=false;render()}
});
$('rv-admin-prompt').addEventListener('input',()=>{confirmation=null;render()});
$('rv-admin-open').addEventListener('click',()=>{
  const prompt=$('rv-admin-prompt').value.trim();
  if(!adminPw||!online||state?.phase!=='none'||prompt.length<5||prompt.length>180||sending)return;
  confirmation={revoteAction:'open',revision:state.revision,prompt};
  $('rv-admin-confirm-text').textContent='이 질문으로 3번 재투표를 열까?\n\n'+prompt+'\n\n열면 질문을 수정할 수 없어. 1·2번 결과와 기존 투표 기록은 보관돼.';render();
});
$('rv-admin-reveal').addEventListener('click',()=>{
  if(!adminPw||!online||state?.phase!=='open'||!state.total||sending)return;
  confirmation={revoteAction:'reveal',revision:state.revision,revoteId:state.id};
  $('rv-admin-confirm-text').textContent=`현재 ${state.total}명이 재투표했어. 지금 마감하고 결과를 공개할까? 공개하면 다시 투표할 수 없어.`;render();
});
$('rv-admin-cancel').addEventListener('click',()=>{confirmation=null;render()});
$('rv-admin-go').addEventListener('click',async()=>{
  if(!adminPw||!online||!confirmation||sending)return;
  const action={...confirmation},epoch=adminEpoch;sending=true;render();
  try{const j=await A.request({a:'gift',op:'voteReveal',pw:adminPw,...action});apply(j);if(epoch===adminEpoch){confirmation=null;message('rv-admin-status',action.revoteAction==='open'?'새 질문으로 재투표를 열었어.':'재투표를 마감하고 결과를 공개했어.')}}
  catch(e){online=false;if(epoch===adminEpoch)message('rv-admin-status',error(e),true)}
  finally{sending=false;render()}
});
$('rv-refresh').addEventListener('click',load);$('rv-admin-refresh').addEventListener('click',load);
A.subscribe(()=>{clear();message('rv-status','');render()});
window.GJ_REVOTE={accept};
window.GJ_REVOTE_ADMIN={connect(pw){adminPw=pw;adminEpoch++;confirmation=null;load()},disconnect(){adminPw='';adminEpoch++;confirmation=null;$('rv-admin-prompt').value='';render()}};
setInterval(()=>{if(adminPw&&state?.phase==='open'&&document.visibilityState==='visible')load()},10000);
// vote.js supplies the initial state and refreshes it while the vote section is visible.
})();
