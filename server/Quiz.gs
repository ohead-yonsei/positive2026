/** Live quiz: called only inside Code.gs handle()'s shared ScriptLock. */
const QUIZ_PREFIX = 'positive_quiz_2026_';
const QUIZ_META = QUIZ_PREFIX + 'meta';
const QUIZ_POINTS = 10;
function quizDefault_() {
  return {revision:0, phase:'closed', runId:null, round:-1, joined:[], questions:[], orders:[], draft:null, demo:true};
}
function quizMeta_() {
  const raw = PropertiesService.getScriptProperties().getProperty(QUIZ_META);
  return raw ? JSON.parse(raw) : quizDefault_();
}
function quizExamples_() {
  return [
    {type:'ox', prompt:'긍정모임은 2017년에 시작했다.', options:['O','X'], answer:[0], explanation:'2017년부터 이어온 우리의 모임!'},
    {type:'choice', prompt:'2026년 긍정의밤이 시작되는 날은?', options:['10월 31일','10월 30일','11월 1일','12월 31일'], answer:[0], explanation:'2026년 10월 31일, 할로윈에 만나!'},
    {type:'order', prompt:'사이트에 안내된 그날 밤 순서대로 배치해줘.', options:['도착 & 단체사진','BBQ 파티','다이소 발표회','랜덤 떡볶이'], answer:[0,1,2,3], explanation:'이 순서는 연습용 예시야. 실제 문제로 바꿔도 돼.'}
  ];
}
function quizReadQuestion_(key, all) {
  return JSON.parse(all ? all[key] : PropertiesService.getScriptProperties().getProperty(key));
}
function quizDraft_(m) { return m.draft ? m.draft.map(k => quizReadQuestion_(k)) : quizExamples_(); }
function quizIdentity_(i) { return Number.isInteger(i) && i >= 0 && i < 11; }
function quizAnswerKey_(m, round, i) { return QUIZ_PREFIX + m.runId + '_answer_' + round + '_' + i; }
function quizValidAnswer_(question, answer) {
  if (!Array.isArray(answer) || !answer.every(i => Number.isInteger(i) && i >= 0 && i < question.options.length)) return false;
  return question.type === 'order' ? answer.length === question.options.length && new Set(answer).size === answer.length : answer.length === 1;
}
function quizQuestionsValid_(questions) {
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 20) return false;
  return questions.every(q => q && ['ox','choice','order'].includes(q.type) &&
    typeof q.prompt === 'string' && q.prompt.trim().length > 0 && q.prompt.length <= 200 &&
    typeof q.explanation === 'string' && q.explanation.length <= 500 &&
    Array.isArray(q.options) && q.options.every(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 100) &&
    new Set(q.options.map(s => s.trim())).size === q.options.length &&
    (q.type === 'ox' ? JSON.stringify(q.options) === '["O","X"]' : q.type === 'choice' ? q.options.length === 4 : q.options.length >= 3 && q.options.length <= 6) &&
    quizValidAnswer_(q, q.answer));
}
function quizCleanQuestions_(questions) {
  return questions.map(q => ({type:q.type,prompt:q.prompt.trim(),options:q.options.map(s => s.trim()),answer:q.answer.slice(),explanation:q.explanation.trim()}));
}
function quizStoreQuestions_(questions, prefix) {
  const p = PropertiesService.getScriptProperties();
  return questions.map((q,i) => { const key = QUIZ_PREFIX + prefix + '_q_' + i; p.setProperty(key, JSON.stringify(q)); return key; });
}
function quizOrder_(q) {
  const order = q.options.map((_,i) => i);
  if (q.type !== 'order') return order;
  for (let i = order.length-1; i > 0; i--) {
    const j = parseInt(Utilities.getUuid().replace(/-/g,'').slice(0,8),16) % (i+1);
    const temp = order[i]; order[i] = order[j]; order[j] = temp;
  }
  if (JSON.stringify(order) === JSON.stringify(q.answer)) order.push(order.shift());
  return order;
}
function quizPublic_(m, i) {
  const p = PropertiesService.getScriptProperties(), all = p.getProperties();
  const out = {ok:true,version:1,serverNow:Date.now(),revision:m.revision,phase:m.phase,runId:m.runId,round:m.round,
    totalQuestions:m.phase === 'closed' ? (m.draft ? m.draft.length : 3) : m.questions.length,
    joined:m.joined.slice(),pointsPerQuestion:QUIZ_POINTS,answeredCount:0};
  if (quizIdentity_(i)) out.mine = {i,joined:m.joined.includes(i),answered:false};
  if (m.phase === 'question' || m.phase === 'reveal') {
    const question = quizReadQuestion_(m.questions[m.round], all);
    // Public IDs follow the shuffled display order, so IDs cannot reveal the solution.
    const order = m.orders[m.round];
    out.question = {type:question.type,prompt:question.prompt,options:order.map((original,id) => ({id,text:question.options[original]}))};
    out.answeredCount = m.joined.filter(n => !!all[quizAnswerKey_(m,m.round,n)]).length;
    if (out.mine && out.mine.joined) {
      const raw = all[quizAnswerKey_(m,m.round,i)];
      if (raw) { out.mine.answered = true; out.mine.answer = JSON.parse(raw).map(id => order.indexOf(id)); }
    }
    // No correctness, explanation or future questions until the host reveals this round.
    if (m.phase === 'reveal') {
      out.question.answer = question.answer.map(id => order.indexOf(id)); out.question.explanation = question.explanation;
      if (out.mine) out.mine.correct = out.mine.answered && JSON.stringify(out.mine.answer) === JSON.stringify(out.question.answer);
    }
  }
  if (m.phase === 'finished') {
    out.playedQuestions = m.round + 1;
    out.ranking = m.joined.map(n => {
      let correct = 0, answered = 0;
      for (let k=0; k<=m.round; k++) {
        const raw = all[quizAnswerKey_(m,k,n)];
        if (raw) { answered++; if (raw === JSON.stringify(quizReadQuestion_(m.questions[k],all).answer)) correct++; }
      }
      return {i:n,score:correct*QUIZ_POINTS,correct,answered};
    }).sort((a,b) => b.score-a.score || a.i-b.i);
    out.ranking.forEach((row,index) => {row.rank = index && out.ranking[index-1].score === row.score ? out.ranking[index-1].rank : index+1;});
  }
  return out;
}
function quizAdminResult_(m, i) { return Object.assign(quizPublic_(m, i), {draft:quizDraft_(m),demo:m.demo}); }
function quizAction(q) {
  const allowed = ['quizStatus','quizJoin','quizAnswer','quizAdmin','quizSave','quizOpen','quizQuestion','quizReveal','quizNext','quizFinish','quizPrepare'];
  if (!allowed.includes(q.op)) return {ok:false,err:'bad_op'};
  const admin = !['quizStatus','quizJoin','quizAnswer'].includes(q.op);
  if (admin && !isAdmin(q)) return {ok:false,err:'badpw'};
  const m = quizMeta_(), p = PropertiesService.getScriptProperties();
  if (q.op === 'quizStatus') return quizPublic_(m,q.i);
  if (q.op === 'quizAdmin') return quizAdminResult_(m,q.i);
  if (admin) {
    // Compare-and-swap: a repeated click or a stale admin tab cannot skip a round.
    if (q.revision !== m.revision) return {ok:false,err:'quiz_stale'};
    if (q.op === 'quizSave') {
      if (!['closed','finished'].includes(m.phase)) return {ok:false,err:'quiz_running'};
      if (!quizQuestionsValid_(q.questions)) return {ok:false,err:'bad_questions'};
      const old = m.draft || [];
      m.draft = quizStoreQuestions_(quizCleanQuestions_(q.questions),'draft_'+Utilities.getUuid());
      m.demo = false; m.revision++; p.setProperty(QUIZ_META,JSON.stringify(m));
      // Running/archived games have separate immutable snapshots, so old drafts are unused.
      old.forEach(key => {try {p.deleteProperty(key);} catch(e) {}});
      return quizAdminResult_(m,q.i);
    }
    if (q.op === 'quizOpen') {
      if (m.phase !== 'closed') return {ok:false,err:'quiz_phase'};
      const questions = quizDraft_(m); if (!quizQuestionsValid_(questions)) return {ok:false,err:'bad_questions'};
      m.runId = Utilities.getUuid(); m.questions = quizStoreQuestions_(questions,'run_'+m.runId);
      m.orders = questions.map(quizOrder_); m.phase = 'lobby'; m.round = -1; m.joined = [];
    } else if (q.op === 'quizQuestion') {
      if (m.phase !== 'lobby') return {ok:false,err:'quiz_phase'};
      if (!m.joined.length) return {ok:false,err:'no_players'};
      m.round = 0; m.phase = 'question';
    } else if (q.op === 'quizReveal') {
      if (m.phase !== 'question') return {ok:false,err:'quiz_phase'};
      m.phase = 'reveal';
    } else if (q.op === 'quizNext') {
      if (m.phase !== 'reveal' || m.round+1 >= m.questions.length) return {ok:false,err:'quiz_phase'};
      m.round++; m.phase = 'question';
    } else if (q.op === 'quizFinish') {
      if (m.phase !== 'reveal') return {ok:false,err:'quiz_phase'};
      m.phase = 'finished';
    } else if (q.op === 'quizPrepare') {
      if (m.phase !== 'finished') return {ok:false,err:'quiz_phase'};
      p.setProperty(QUIZ_PREFIX+'archive_'+m.runId,JSON.stringify(m));
      Object.assign(m,{phase:'closed',runId:null,round:-1,joined:[],questions:[],orders:[]});
    }
    m.revision++; p.setProperty(QUIZ_META,JSON.stringify(m));
    return quizPublic_(m,q.i);
  }
  if (!quizIdentity_(q.i)) return {ok:false,err:'bad_identity'};
  if (!q.runId || q.runId !== m.runId) return {ok:false,err:'quiz_stale'};
  if (q.op === 'quizJoin') {
    if (!['lobby','question','reveal'].includes(m.phase)) return {ok:false,err:'quiz_closed'};
    if (!m.joined.includes(q.i)) {m.joined.push(q.i);m.joined.sort((a,b)=>a-b);p.setProperty(QUIZ_META,JSON.stringify(m));}
    return quizPublic_(m,q.i);
  }
  if (!m.joined.includes(q.i)) return {ok:false,err:'not_joined'};
  if (!Number.isInteger(q.round) || q.round !== m.round) return {ok:false,err:'quiz_stale'};
  const key = quizAnswerKey_(m,m.round,q.i);
  if (p.getProperty(key)) return Object.assign(quizPublic_(m,q.i),{alreadyAnswered:true});
  if (m.phase !== 'question') return {ok:false,err:'answer_closed'};
  const question = quizReadQuestion_(m.questions[m.round]);
  if (!quizValidAnswer_(question,q.answer)) return {ok:false,err:'bad_answer'};
  p.setProperty(key,JSON.stringify(q.answer.map(id => m.orders[m.round][id])));
  return Object.assign(quizPublic_(m,q.i),{accepted:true});
}
