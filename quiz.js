(() => {
'use strict';
const NAMES=['구세라','권경지','권순록','김강일','류원선','박재훈','서정윤','유세종','이대호','이수한','천수진'];
const TYPES={ox:'O/X',choice:'4지선다',order:'순서 맞히기'},PHASES={closed:'시작 전',lobby:'입장 중',question:'문제 진행 중',reveal:'정답 공개',finished:'최종 결과'};
const $=id=>document.getElementById(id),API=(window.GJ_API||'').trim();
const name=$('quiz-name'),STATUS='quiz-status';
let state=null,online=false,loading=false,busy=false,timer=null,visible=true,answer=[],questionKey='',paintKey='';
let adminPw='',draft=[],dirty=false,editing=-1,demo=true,confirmation=null,voteState=null;
const A=window.GJ_AUTH;
const identity=()=>A.identity();
const mine=()=>state?.mine?.i===identity()?state.mine:null;
const adminMode=()=>location.hash==='#admin';
const editable=()=>!!adminPw&&state&&['closed','finished'].includes(state.phase)&&!busy;
const canAnswer=()=>online&&!busy&&state?.phase==='question'&&mine()?.joined&&!mine()?.answered;
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
function message(id,text,bad=false){$(id).textContent=text;$(id).className='msg'+(bad?' bad':'')}
function errorText(e){if((e.code||e.message).startsWith('auth_'))return A.errorText(e);return {badpw:'운영진 비밀번호가 맞지 않아.',quiz_stale:'진행 상황이 바뀌었어. 최신 내용을 확인한 뒤 다시 눌러줘.',quiz_running:'게임 중에는 문제를 바꿀 수 없어.',quiz_phase:'지금 단계에서는 진행할 수 없어. 새로고침해서 확인해줘.',no_players:'먼저 참가자가 한 명 이상 입장해야 해.',bad_questions:'문제와 정답을 확인해줘. 빈 보기·중복 보기 없이 최대 20문제까지 저장할 수 있어.',not_joined:'내 이름으로 먼저 입장해줘.',answer_closed:'답안 제출이 마감됐어. 다음 문제를 기다려줘.',quiz_closed:'지금은 입장할 수 없어.',bad_answer:'답안을 모두 골라줘.',bad_identity:'내 이름을 다시 골라줘.'}[e.message]||'연결을 확인하지 못했어. 다시 연결해줘. 이미 저장된 답안은 중복 처리하지 않아.'}
async function call(op,values={}){
  return A.request({a:'gift',op,...(identity()===null?{}:{i:identity()}),...values},{required:['quizJoin','quizAnswer'].includes(op)});
}

function accept(j){
  if(j.version!==1||!Object.hasOwn(PHASES,j.phase)||!Array.isArray(j.joined))throw Error('bad_response');
  if(state&&(j.revision<state.revision||(j.revision===state.revision&&j.serverNow<state.serverNow)))return;
  state=j;online=true;
  const key=[j.runId,j.round,identity()].join('/');
  if(questionKey!==key){questionKey=key;answer=j.question?.type==='order'?j.question.options.map(o=>o.id):[];paintKey=''}
  if(mine()?.answered)answer=mine().answer.slice();
  if(identity()!==null)A.summary('quiz',j.phase==='finished'?(j.ranking.find(r=>r.i===identity())?.score??0)+'점 · 퀴즈 결과':mine()?.joined?'퀴즈 참여 중':'퀴즈 '+PHASES[j.phase],identity());
  render();
}
function renderQuestion(){
  const q=state.question,m=mine(),key=JSON.stringify([questionKey,state.phase,m?.answered,answer]);
  if(paintKey===key)return;paintKey=key;
  const root=$('quiz-answers');root.replaceChildren();
  if(q.type==='order'){
    const list=node('ol','quiz-order');
    answer.forEach((id,index)=>{
      const li=node('li'),text=node('span',null,q.options.find(o=>o.id===id).text);li.append(text);
      [-1,1].forEach(direction=>{
        const button=node('button','quiz-move',direction<0?'↑':'↓');button.type='button';button.dataset.move=id+':'+direction;button.setAttribute('aria-label',text.textContent+(direction<0?' 위로':' 아래로'));
        button.disabled=!canAnswer()||index+direction<0||index+direction>=answer.length;
        button.addEventListener('click',()=>{if(!canAnswer())return;const next=index+direction;[answer[index],answer[next]]=[answer[next],answer[index]];paintKey='';render();$('quiz-answers').querySelector('[data-move="'+id+':'+direction+'"]')?.focus()});li.append(button);
      });list.append(li);
    });root.append(list);
  }else{
    const options=node('div','quiz-options');
    q.options.forEach(o=>{const b=node('button','quiz-option',o.text);b.type='button';b.setAttribute('aria-pressed',String(answer[0]===o.id));b.disabled=!canAnswer();b.addEventListener('click',()=>{if(!canAnswer())return;answer=[o.id];paintKey='';render()});options.append(b)});root.append(options);
  }
  $('quiz-help').textContent=q.type==='order'?'↑↓ 버튼으로 순서를 맞춘 다음 제출해줘. 제출 후에는 바꿀 수 없어.':'정답 하나를 고르고 제출해줘. 제출 후에는 바꿀 수 없어.';
}
function renderFeedback(){
  const root=$('quiz-feedback');root.hidden=state.phase!=='reveal';if(root.hidden)return;
  root.replaceChildren();const m=mine(),q=state.question;
  root.className='quiz-feedback'+(m?.correct?'':' wrong');
  root.append(node('h4',null,m?.correct?'정답! +10점 🎉':m?.answered?'아쉽지만 다음 문제가 있어!':'이번 문제에는 답안을 내지 않았어.'));
  root.append(node('p',null,'정답: '+q.answer.map(id=>q.options.find(o=>o.id===id).text).join(q.type==='order'?' → ':' ')));
  if(q.explanation)root.append(node('p',null,q.explanation));
  root.append(node('p',null,'운영진이 다음 단계로 진행하면 화면이 바뀌어.'));
}
function render(){
  const phase=state?.phase||'closed',m=mine(),joined=!!m?.joined;
  $('quiz-phase').textContent=state?PHASES[phase]:'연결 중…';
  $('quiz-count').textContent=state?phase==='question'||phase==='reveal'?`${state.answeredCount} / ${state.joined.length}명 제출`:`${state.joined.length} / 11명 입장`:'';
  $('quiz-title').textContent=phase==='closed'?'운영진이 시작하면 열려!':phase==='lobby'?'로그인하고 입장해줘':phase==='finished'?'우리의 퀴즈왕은? 🏆':joined?`${state.round+1}. ${state.question.prompt}`:'내 이름으로 입장하고 함께 풀어봐!';
  $('quiz-intro').hidden=['question','reveal','finished'].includes(phase);
  $('quiz-entry').hidden=['closed','finished'].includes(phase);
  name.disabled=true;
  $('quiz-join').hidden=joined;$('quiz-join').disabled=busy||!online||identity()===null;
  const people=$('quiz-people');people.replaceChildren();people.hidden=phase!=='lobby';
  if(state&&phase==='lobby')state.joined.forEach(i=>people.append(node('li',null,NAMES[i])));
  $('quiz-play').hidden=!joined||!['question','reveal'].includes(phase);
  if(!$('quiz-play').hidden){
    renderQuestion();renderFeedback();$('quiz-submit').hidden=phase!=='question'||!!m.answered;
    $('quiz-submit').disabled=!canAnswer()||!answer.length;
    $('quiz-submit').textContent=busy?'답안 저장 중…':'답안 제출';
    // Disabled state can change without changing the question/selection.
    $('quiz-answers').querySelectorAll('button').forEach(b=>{
      if(b.dataset.move){const [id,d]=b.dataset.move.split(':').map(Number),index=answer.indexOf(id);b.disabled=!canAnswer()||index+d<0||index+d>=answer.length}
      else b.disabled=!canAnswer();
    });
  }
  $('quiz-results').hidden=phase!=='finished';
  if(phase==='finished'){
    $('quiz-final-note').textContent=`${state.playedQuestions}문제 · 총 ${state.playedQuestions*10}점 만점 · 동점은 공동 순위`;
    const list=$('quiz-ranking');list.replaceChildren();
    state.ranking.forEach(row=>{const li=node('li',row.i===identity()?'mine':''),person=node('div',null,NAMES[row.i]);person.append(node('small',null,`${row.correct}문제 정답 · ${row.answered}문제 제출`));li.append(node('span',null,row.rank+'위'),person,node('strong',null,row.score+'점'));list.append(li)});
  }
  $('quiz-retry').disabled=loading||busy;
  $('quiz-retry').textContent=loading?'연결 확인 중…':'다시 연결';
  renderAdmin();
}
function normalStatus(){
  if(!state)return;
  message(STATUS,state.phase==='closed'?'아직 시작 전이야. 운영진이 퀴즈를 열면 여기에서 참여할 수 있어.':state.phase==='lobby'?mine()?.joined?'입장 완료! 첫 문제가 시작되면 자동으로 보여줄게.':'내 로그인하고 입장해줘.':state.phase==='question'?mine()?.answered?'답안을 제출했어! 운영진의 정답 공개를 기다려줘.':mine()?.joined?'문제 진행 중! 답안을 골라 제출해줘.':'내 이름으로 입장하면 현재 문제부터 풀 수 있어.':state.phase==='reveal'?'정답 공개! 다음 단계도 자동으로 이어져.':'퀴즈 끝! 함께해줘서 고마워 🎉');
}
function schedule(){clearTimeout(timer);const active=state&&['lobby','question','reveal'].includes(state.phase);timer=setTimeout(()=>load(),active&&(visible||adminMode()||mine()?.joined)?2500:15000)}
async function load(){
  if(loading||busy){schedule();return}
  if(document.visibilityState!=='visible'){schedule();return}
  loading=true;render();const who=identity(),authEpoch=A.epoch;
  try{accept(await call('quizStatus'));normalStatus()}
  catch(e){online=false;message(STATUS,errorText(e),true)}
  finally{loading=false;render();if(who!==identity()||authEpoch!==A.epoch)load();else schedule()}
}
async function mutate(op,values){
  if(busy)return;busy=true;render();message(STATUS,'저장 중이야. 잠깐만 기다려줘.');
  try{accept(await call(op,values));normalStatus()}
  catch(e){message(STATUS,errorText(e),true);if(['quiz_stale','answer_closed','quiz_closed'].includes(e.message)){try{accept(await call('quizStatus'))}catch(_){online=false}}else online=false}
  finally{busy=false;render();schedule()}
}
name.append(new Option('내 이름 선택',''));NAMES.forEach((n,i)=>name.append(new Option(n,String(i))));
A.bindIdentity(name);

name.addEventListener('change',()=>{answer=[];questionKey='';paintKey='';try{localStorage.setItem('gj26-quiz-name',name.value)}catch(e){}render();load()});
$('quiz-join').addEventListener('click',()=>{if(identity()!==null&&state&&!busy)mutate('quizJoin',{i:identity(),runId:state.runId})});
$('quiz-submit').addEventListener('click',()=>{if(canAnswer()&&answer.length)mutate('quizAnswer',{i:identity(),runId:state.runId,round:state.round,answer:answer.slice()})});
$('quiz-retry').addEventListener('click',load);

function renderAdmin(){
  $('qa-body').hidden=!adminPw;$('qa-login').hidden=!!adminPw;$('qa-auth').disabled=busy;
  if(!adminPw||!state)return;
  $('qa-summary').textContent=`${PHASES[state.phase]} · ${state.joined.length}명 입장`+(['question','reveal'].includes(state.phase)?` · ${state.round+1}/${state.totalQuestions}문제 · ${state.answeredCount}명 제출`:'');
  const phases={open:'closed',question:'lobby',reveal:'question',next:'reveal',finish:'reveal',prepare:'finished'};
  Object.entries(phases).forEach(([button,phase])=>{const b=$('qa-'+button);b.hidden=state.phase!==phase||(button==='next'&&state.round+1>=state.totalQuestions);b.disabled=busy||!online||(button==='open'&&dirty)||(button==='question'&&!state.joined.length)});
  $('qa-vote-open').disabled=busy||!voteState||voteState.phase==='revealed';
  $('qa-vote-state').textContent=voteState?voteState.phase==='revealed'?'이미 결과가 공개됐어.':`${voteState.total} / 11명 투표 · 아직 비공개`:'투표 현황을 확인하는 중…';
  $('qa-refresh').disabled=busy;
  $('qa-editor').querySelectorAll('input,select,textarea,button').forEach(e=>e.disabled=!editable());
  $('qa-list').querySelectorAll('button').forEach(e=>e.disabled=!editable());
  $('qa-save').disabled=!editable()||!dirty||!draft.length;
  $('qa-unsaved').textContent=dirty?'아직 저장하지 않은 변경이 있어. 목록 저장 후 시작해줘.':'문제 목록이 저장된 상태야.';
  $('qa-draft-note').textContent=(demo?'연습용 예시 3문제가 들어 있어. 실제 문제로 바꿔서 저장해줘. ':`${draft.length}개 문제. `)+(!['closed','finished'].includes(state.phase)?'게임을 마친 뒤 수정할 수 있어.':'');
  if(confirmation){$('qa-confirm-go').disabled=busy;$('qa-confirm-cancel').disabled=busy}
}
function renderDraft(){
  const list=$('qa-list');list.replaceChildren();
  draft.forEach((q,index)=>{
    const li=node('li');li.append(node('p',null,`${index+1}. [${TYPES[q.type]}] ${q.prompt}`));li.append(node('small',null,'정답: '+q.answer.map(i=>q.options[i]).join(' → ')));
    [['수정',()=>editQuestion(index)],['↑',()=>moveQuestion(index,-1)],['↓',()=>moveQuestion(index,1)],['삭제',()=>{draft.splice(index,1);dirty=true;resetEditor();renderDraft();renderAdmin()}]].forEach(([text,fn])=>{const b=node('button',null,text);b.type='button';b.setAttribute('aria-label',`${index+1}번 문제 ${text}`);b.addEventListener('click',()=>{if(editable())fn()});li.append(b)});list.append(li);
  });renderAdmin();
}
function moveQuestion(index,d){if(index+d<0||index+d>=draft.length)return;[draft[index],draft[index+d]]=[draft[index+d],draft[index]];dirty=true;resetEditor();renderDraft()}
function optionsFromEditor(){return $('qa-type').value==='ox'?['O','X']:$('qa-options').value.split('\n').map(s=>s.trim()).filter(Boolean)}
function editorType(){
  const type=$('qa-type').value,old=$('qa-answer').value;
  $('qa-options-wrap').hidden=type==='ox';$('qa-answer-wrap').hidden=type==='order';
  $('qa-options-label').textContent=type==='order'?'정답 순서대로 보기 입력 · 한 줄에 하나 (3~6개)':'보기 입력 · 한 줄에 하나 (정확히 4개)';
  const select=$('qa-answer');select.replaceChildren();optionsFromEditor().forEach((s,i)=>select.append(new Option(s,String(i))));if([...select.options].some(o=>o.value===old))select.value=old;
}
function resetEditor(){editing=-1;$('qa-type').value='ox';$('qa-prompt').value='';$('qa-options').value='';$('qa-explanation').value='';$('qa-editor-title').textContent='새 문제 추가';$('qa-add').textContent='목록에 추가';$('qa-cancel-edit').hidden=true;editorType()}
function editQuestion(index){
  const q=draft[index];editing=index;$('qa-type').value=q.type;$('qa-prompt').value=q.prompt;$('qa-options').value=(q.type==='order'?q.answer.map(i=>q.options[i]):q.options).join('\n');$('qa-explanation').value=q.explanation;editorType();$('qa-answer').value=String(q.answer[0]);$('qa-editor-title').textContent=(index+1)+'번 문제 수정';$('qa-add').textContent='수정 반영';$('qa-cancel-edit').hidden=false;$('qa-prompt').focus();
}
$('qa-type').addEventListener('change',editorType);$('qa-options').addEventListener('input',editorType);$('qa-cancel-edit').addEventListener('click',resetEditor);
$('qa-add').addEventListener('click',()=>{
  if(!editable())return;const type=$('qa-type').value,options=optionsFromEditor(),prompt=$('qa-prompt').value.trim(),explanation=$('qa-explanation').value.trim();
  if(!prompt||prompt.length>200||explanation.length>500||options.some(s=>s.length>100)||new Set(options).size!==options.length||(type==='choice'&&options.length!==4)||(type==='order'&&(options.length<3||options.length>6))){message('qa-status','문제와 보기를 확인해줘. 4지선다는 보기 4개, 순서 문제는 서로 다른 보기 3~6개가 필요해.',true);return}
  if(editing<0&&draft.length>=20){message('qa-status','최대 20문제까지 추가할 수 있어.',true);return}
  const q={type,prompt,options,answer:type==='order'?options.map((_,i)=>i):[Number($('qa-answer').value)],explanation};
  if(editing<0)draft.push(q);else draft[editing]=q;
  dirty=true;resetEditor();renderDraft();message('qa-status','목록에 반영했어. 마지막에 문제 목록 저장을 눌러줘.');
});
async function adminLoad(password=adminPw){
  if(busy)return;if(!password){message('qa-status','운영진 비밀번호를 입력해줘.',true);return}
  busy=true;render();message('qa-status','운영진 정보를 불러오는 중…');
  try{
    const j=await call('quizAdmin',{pw:password});adminPw=password;$('qa-pw').value='';window.GJ_THIRD_ADMIN?.connect(password);window.GJ_AUTH_ADMIN.connect(password);window.GJ_REVOTE_ADMIN?.connect(password);
    if(!dirty){draft=j.draft;demo=j.demo;resetEditor()}
    accept(j);renderDraft();
    try{voteState=await call('voteStatus')}catch(e){voteState=null}
    message('qa-status','연결됐어. 문제를 확인하고 퀴즈를 시작해줘.');
  }catch(e){message('qa-status',errorText(e),true)}finally{busy=false;render();schedule()}
}
function confirmAction(op,text){if(busy||!adminPw)return;confirmation={op,revision:state.revision};$('qa-confirm-text').textContent=text;$('qa-confirm').hidden=false;$('qa-confirm-go').focus();renderAdmin()}
function clearConfirmation(){confirmation=null;$('qa-confirm').hidden=true}
async function adminAction(op,revision=state.revision){
  if(busy||!adminPw)return;busy=true;render();message('qa-status','진행 내용을 저장하고 있어…');
  try{
    const j=await call(op,{pw:adminPw,revision,...(op==='quizSave'?{questions:draft}:{})});
    if(op==='voteReveal'){voteState=j;document.dispatchEvent(new CustomEvent('gj-vote-revealed',{detail:j}));message('qa-status','투표가 마감됐고 결과가 공개됐어.')}
    else{if(op==='quizSave'){dirty=false;draft=j.draft;demo=j.demo;renderDraft()}accept(j);normalStatus();message('qa-status',op==='quizSave'?'문제 목록을 저장했어.':op==='quizOpen'?'입장을 열었어. 친구들이 들어오면 첫 문제를 시작해줘.':'진행 상황을 반영했어.')}
    clearConfirmation();
  }catch(e){message('qa-status',errorText(e),true);try{accept(await call('quizStatus'))}catch(_){}clearConfirmation()}
  finally{busy=false;render();schedule()}
}
$('qa-auth').addEventListener('click',()=>adminLoad($('qa-pw').value));
$('qa-pw').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();adminLoad($('qa-pw').value)}});
$('qa-refresh').addEventListener('click',()=>adminLoad());
function logout(){adminPw='';draft=[];dirty=false;voteState=null;clearConfirmation();$('qa-list').replaceChildren();resetEditor();$('qa-pw').value='';window.GJ_THIRD_ADMIN?.disconnect();window.GJ_AUTH_ADMIN.disconnect();window.GJ_REVOTE_ADMIN?.disconnect();render();message('qa-status','운영진 연결을 해제했어.')}
$('qa-logout').addEventListener('click',logout);
$('qa-save').addEventListener('click',()=>adminAction('quizSave'));
$('qa-vote-open').addEventListener('click',()=>confirmAction('voteReveal','지금 투표를 마감하고 결과를 공개할까? 공개 후에는 다시 숨기거나 투표할 수 없어.'));
$('qa-open').addEventListener('click',()=>confirmAction('quizOpen',`${demo?'연습용 예시 ':''}${draft.length}문제로 입장을 열까? 시작한 게임의 문제는 수정할 수 없어.`));
$('qa-question').addEventListener('click',()=>adminAction('quizQuestion'));
$('qa-reveal').addEventListener('click',()=>state.answeredCount<state.joined.length?confirmAction('quizReveal',`${state.joined.length}명 중 ${state.answeredCount}명이 제출했어. 지금 답안을 마감하고 정답을 공개할까?`):adminAction('quizReveal'));
$('qa-next').addEventListener('click',()=>adminAction('quizNext'));
$('qa-finish').addEventListener('click',()=>confirmAction('quizFinish',`${state.round+1}문제로 퀴즈를 마치고 최종 순위를 공개할까?`));
$('qa-prepare').addEventListener('click',()=>confirmAction('quizPrepare','현재 게임 기록을 보관하고 새 게임을 준비할까? 참가자는 다시 이름을 골라 입장하게 돼.'));
$('qa-confirm-go').addEventListener('click',()=>{if(confirmation)adminAction(confirmation.op,confirmation.revision)});
$('qa-confirm-cancel').addEventListener('click',clearConfirmation);
function hash(){ $('event-admin').hidden=!adminMode();if(!adminMode()&&adminPw)logout();if(adminMode())requestAnimationFrame(()=>$('event-admin').scrollIntoView({block:'start'})); }
window.addEventListener('hashchange',hash);hash();resetEditor();
A.subscribe(()=>{if(state)delete state.mine;answer=[];questionKey='';paintKey='';render();load()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()});
if('IntersectionObserver' in window)new IntersectionObserver(entries=>{const was=visible;visible=entries[0].isIntersecting;if(visible&&!was)load()},{rootMargin:'300px'}).observe($('quiz'));
load();
})();
