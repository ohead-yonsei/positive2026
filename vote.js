(() => {
'use strict';
const NAMES=['구세라','권경지','권순록','김강일','류원선','박재훈','서정윤','유세종','이대호','이수한','천수진'];
const QUESTIONS=['10년 동안 가장 긍정적이었던 사람은?','10년 동안 긍정모임을 가장 아껴준 사람은?','앞으로의 긍정이 더 기대되는 사람은?'];
const AWARDS=['긍정왕','긍정 지킴이','내일의 긍정왕'];
const API=/^https:\/\/script\.google\.com\//.test((window.GJ_API||'').trim())?window.GJ_API.trim():'';
const $=id=>document.getElementById(id), voter=$('vote-name');
const choices=[0,1,2].map(i=>$('vote-choice-'+i));
let state=null, online=false, loading=false, sending=false, review=null, anchor=0, retryAt=0, visible=true;
const now=()=>state?state.serverNow+Math.max(0,performance.now()-anchor):Date.now();
const identity=()=>voter.value===''?null:Number(voter.value);
const hasVoted=()=>state&&state.submitted.includes(identity());
const open=()=>online&&state&&state.phase==='open'&&now()<state.revealAt;
function message(text,bad=false){$('vote-status').textContent=text;$('vote-status').className='msg'+(bad?' bad':'')}
function clearChoices(){choices.forEach(s=>s.value='');review=null}
function apply(j){
  if(!Number.isFinite(j.serverNow)||!Number.isFinite(j.revealAt)||!Array.isArray(j.submitted)||!['open','revealed'].includes(j.phase))throw Error('bad_response');
  if(state&&(j.serverNow<state.serverNow||j.total<state.total))return;
  state=j;anchor=performance.now();online=true;
  if(hasVoted()||j.phase==='revealed')clearChoices();
  render();
}
async function call(op,values={}){
  if(!API)throw Error('noapi');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const params={a:'gift',op,...values};
    const r=await fetch(op==='voteStatus'?API+'?'+new URLSearchParams({...params,t:Date.now()}):API,
      op==='voteStatus'?{cache:'no-store',signal:controller.signal}:{method:'POST',body:JSON.stringify(params),signal:controller.signal});
    if(!r.ok)throw Error('network');
    const j=await r.json();if(!j.ok)throw Error(j.err||'network');return j;
  }finally{clearTimeout(timer)}
}
function results(){
  const root=$('vote-results');root.replaceChildren();
  if(state?.phase!=='revealed')return;
  QUESTIONS.forEach((question,k)=>{
    const card=document.createElement('div');card.className='vote-question';
    const title=document.createElement('h3');title.textContent=question;card.append(title);
    const counts=state.results[k],max=Math.max(...counts),winner=document.createElement('p');winner.className='vote-winner';
    const winners=NAMES.filter((_,i)=>counts[i]===max);
    winner.textContent=max?'🏆 '+winners.join(' · ')+(winners.length>1?' 공동 1위!':'!'):'아직 받은 표가 없어';card.append(winner);
    if(max){
      const list=document.createElement('ul');list.className='vote-ranking';
      NAMES.map((name,i)=>({name,count:counts[i],i})).sort((a,b)=>b.count-a.count||a.i-b.i).forEach(e=>{
        const li=document.createElement('li'),name=document.createElement('span'),bar=document.createElement('span'),fill=document.createElement('span'),count=document.createElement('b');
        name.textContent=e.name;bar.className='vote-bar';bar.setAttribute('aria-hidden','true');fill.style.width=e.count/max*100+'%';bar.append(fill);count.textContent=e.count+'표';li.append(name,bar,count);list.append(li);
      });card.append(list);
    }root.append(card);
  });
}
function render(){
  const done=hasVoted(),revealed=state?.phase==='revealed',can=open()&&!done&&identity()!==null&&!sending;
  $('vote-total').textContent=state?`${state.total} / 11명 참여`:'연결 중…';
  $('vote-date').textContent=revealed?'함께 만든 10년, 결과 공개!':'10.31 토요일 밤 9시 공개';
  $('vote-entry').hidden=!!revealed;
  $('vote-results').hidden=!revealed;
  $('vote-done').hidden=!done||!!revealed;
  $('vote-done').textContent=done?NAMES[identity()]+'의 투표가 완료됐어! 공개 시간에 다시 만나 🏆':'';
  $('vote-fields').hidden=!!done||!!review;
  $('vote-confirm').hidden=!review||!!done;
  voter.disabled=!online||sending||!!review;
  choices.forEach(s=>s.disabled=!can);
  $('vote-review').disabled=!can||choices.some(s=>s.value==='');
  $('vote-send').disabled=!can||!review;
  $('vote-edit').disabled=sending;
  $('vote-send').textContent=sending?'투표를 저장하는 중…':'이대로 투표하기';
  $('vote-retry').disabled=loading||sending;
  $('vote-retry').textContent=loading?'불러오는 중…':'현황 새로고침';
  $('vote-form').setAttribute('aria-busy',String(sending));
  if(revealed)results();
  clock();
}
function clock(){
  const target=$('vote-clock');
  if(!state){target.textContent='한국 시간 기준 · 투표 마감과 함께 결과 공개';return}
  if(state.phase==='revealed'){target.textContent='투표 마감 · 각 부문 득표수만 공개해';return}
  const left=Math.max(0,Math.ceil((state.revealAt-now())/1000));
  if(!left){
    target.textContent='투표가 마감됐어. 공개된 결과를 확인하는 중…';
    choices.forEach(s=>s.disabled=true);$('vote-review').disabled=true;$('vote-send').disabled=true;
    if(!loading&&!sending&&Date.now()>=retryAt&&document.visibilityState==='visible'){retryAt=Date.now()+15000;load()}
    return;
  }
  const days=Math.floor(left/86400),hours=Math.floor(left%86400/3600),minutes=Math.floor(left%3600/60),seconds=left%60;
  target.textContent=`공개까지 ${days?days+'일 ':''}${hours}시간 ${minutes}분 ${seconds}초 · 한국 시간`;
}
async function load(){
  if(loading||sending)return;
  loading=true;$('vote-retry').disabled=true;$('vote-retry').textContent='불러오는 중…';
  if(!state)message('투표함을 불러오는 중이야…');
  try{apply(await call('voteStatus'));message(state.phase==='revealed'?'10년의 긍정을 함께 축하해!':hasVoted()?'이미 제출한 이름이야. 브라우저가 바뀌어도 투표는 잘 보관돼 있어.':'내 이름을 고르고, 세 질문에 한 명씩 골라줘.')}
  catch(e){online=false;message(API?'연결이 늦어지고 있어. 현황 새로고침을 눌러 다시 확인해줘.':'아직 서버가 연결되지 않았어.',true)}
  finally{loading=false;render()}
}
[voter,...choices].forEach(s=>{s.append(new Option(s===voter?'투표하는 내 이름':'한 명 선택',''));NAMES.forEach((name,i)=>s.append(new Option(name,String(i))))});
voter.addEventListener('change',()=>{clearChoices();message(hasVoted()?'이미 제출한 이름이야. 결과 공개를 기다려줘.':'본인 이름으로만 투표해줘.');render()});
choices.forEach(s=>s.addEventListener('change',()=>{review=null;render()}));
$('vote-form').addEventListener('submit',e=>{
  e.preventDefault();if(!open()||hasVoted()||identity()===null||choices.some(s=>s.value===''))return;
  review={i:identity(),choices:choices.map(s=>Number(s.value))};
  $('vote-review-name').textContent=NAMES[review.i]+'의 선택을 확인해줘';
  const list=$('vote-review-list');list.replaceChildren();
  review.choices.forEach((i,k)=>{const li=document.createElement('li'),strong=document.createElement('strong');li.textContent=AWARDS[k];strong.textContent=NAMES[i];li.append(strong);list.append(li)});
  render();$('vote-send').focus();
});
$('vote-edit').addEventListener('click',()=>{review=null;render();choices[0].focus()});
$('vote-send').addEventListener('click',async()=>{
  if(sending||!review||!open()||hasVoted())return;
  const ballot={i:review.i,choices:review.choices.slice()};
  sending=true;render();message('투표를 안전하게 저장하고 있어…');
  try{
    const j=await call('voteSubmit',ballot);apply(j);
    message(j.alreadyVoted?'이미 제출한 투표가 보관돼 있어. 중복으로 집계하지 않았어.':'투표 완료! 10월 31일 밤 9시에 결과를 확인해줘.');
  }catch(e){
    online=false;
    message(e.message==='vote_closed'?'투표가 마감됐어. 현황 새로고침을 눌러 결과를 확인해줘.':'저장 여부를 확인하지 못했어. 현황 새로고침으로 확인해줘. 이미 저장됐다면 다시 집계하지 않아.',true);
  }finally{sending=false;render()}
});
$('vote-retry').addEventListener('click',()=>load());
document.addEventListener('gj-vote-revealed',e=>{apply(e.detail);message('투표가 마감됐어. 공개된 결과를 확인해봐!')});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()});
if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting},{rootMargin:'200px'}).observe($('vote'));
setInterval(clock,1000);
setInterval(()=>{if(visible&&document.visibilityState==='visible'&&state?.phase!=='revealed')load()},30000);
load();
})();
