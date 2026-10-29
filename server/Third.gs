/** Third-place challenge. Called under Code.gs's existing ScriptLock. */
const THIRD_PREFIX = 'positive_third_2026_';
let THIRD_CACHE = null;
function thirdRead_(key, fallback) {
  const raw = THIRD_CACHE ? THIRD_CACHE[THIRD_PREFIX + key] : PropertiesService.getScriptProperties().getProperty(THIRD_PREFIX + key);
  return raw ? JSON.parse(raw) : fallback;
}
function thirdWrite_(key, value) {
  const raw=JSON.stringify(value);PropertiesService.getScriptProperties().setProperty(THIRD_PREFIX + key,raw);
  if(THIRD_CACHE)THIRD_CACHE[THIRD_PREFIX + key]=raw;
}
function thirdMeta_() { return thirdRead_('meta', {revision:0,phase:'collecting',runId:null,round:-1,questions:[],history:[]}); }
function thirdIdentity_(i) { return Number.isInteger(i) && i >= 0 && i < 11; }
function thirdEntries_() { return Array.from({length:11}, (_,i) => thirdRead_('entry_'+i,null)).filter(Boolean); }
function thirdHistory_(m) { return m.history.map(key=>thirdRead_(key,null)); }
function thirdQuestion_(m) { return thirdRead_('run_'+m.runId+'_q_'+m.round,null); }
function thirdVoteKey_(m, stage, i) { return 'run_'+m.runId+'_vote_'+m.round+'_'+stage+'_'+i; }
function thirdBallots_(m, stage) {
  const author = thirdQuestion_(m).author;
  return Array.from({length:11}, (_,i) => i === author ? null : thirdRead_(thirdVoteKey_(m,stage,i),null)).filter(Boolean);
}
function thirdScores_(ballots, candidates) {
  return candidates.map(i => ({i,score:ballots.reduce((sum,choices) => {
    const at = choices.indexOf(i); return sum + (at < 0 ? 0 : choices.length-at);
  },0)})).sort((a,b) => b.score-a.score || a.i-b.i);
}
function thirdTies_(rows) {
  if (rows.length < 3) return [];
  const group = rows.filter(r => r.score === rows[2].score);
  return group.length > 1 ? group.map(r => r.i) : [];
}
function thirdRanking_(m, tieBallots) {
  const main = thirdScores_(thirdBallots_(m,'main'),Array.from({length:11},(_,i)=>i)).filter(r=>r.score>0);
  const ties = thirdTies_(main);
  const tieScores = tieBallots ? thirdScores_(tieBallots,ties) : [];
  const scoreFor = i => tieScores.find(r=>r.i===i)?.score || 0;
  const rows = main.map(r=>Object.assign({},r,{tieScore:scoreFor(r.i)})).sort((a,b)=>b.score-a.score || b.tieScore-a.tieScore || a.i-b.i);
  const same = (a,b) => a.score===b.score && a.tieScore===b.tieScore;
  rows.forEach((r,index)=>{r.rank=index && same(r,rows[index-1]) ? rows[index-1].rank : index+1;});
  // If the runoff still ties across the third seat, every tied contender shares third.
  if (rows.length >= 3) rows.filter(r=>same(r,rows[2])).forEach(r=>r.rank=3);
  return rows;
}
function thirdPublic_(m, i) {
  const entries = thirdEntries_();
  const out = {ok:true,version:1,serverNow:Date.now(),revision:m.revision,phase:m.phase,runId:m.runId,round:m.round,
    submittedCount:entries.length,totalQuestions:m.questions.length,history:thirdHistory_(m)};
  if (thirdIdentity_(i)) {
    out.mine = {i};
    if (m.phase==='collecting') {
      const entry=entries.find(e=>e.author===i);
      out.mine.entry=entry ? {prompt:entry.prompt,revision:entry.revision} : {prompt:'',revision:0};
    }
  }
  if (['voting','tiebreak','ranking','author'].includes(m.phase)) {
    const question=thirdQuestion_(m), stage=m.phase==='tiebreak'?'tie':'main';
    out.question={prompt:question.prompt};
    out.stage=stage; out.expectedVotes=10; out.votedCount=thirdBallots_(m,stage).length;
    if (m.phase==='tiebreak') out.candidates=m.ties.slice();
    else out.candidates=Array.from({length:11},(_,i)=>i);
    out.pickCount=Math.min(3,out.candidates.length);
    if (out.mine) {
      out.mine.isAuthor=question.author===i;
      const ballot=thirdRead_(thirdVoteKey_(m,stage,i),null);
      out.mine.voted=!!ballot; if(ballot)out.mine.choices=ballot;
    }
    if (m.phase==='ranking'||m.phase==='author') out.ranking=m.result;
    if (m.phase==='author') out.reveal=out.history[out.history.length-1];
  }
  return out;
}
function thirdAdmin_(m,i) {
  return Object.assign(thirdPublic_(m,i),{entries:thirdEntries_().map(e=>({id:e.id,prompt:e.prompt,enabled:e.enabled}))});
}
function thirdAction(q) {
  const publicOps=['thirdStatus','thirdSave','thirdVote'];
  const adminOps=['thirdAdmin','thirdReview','thirdStart','thirdClose','thirdAuthor','thirdNext','thirdFinish','thirdPrepare'];
  if(!publicOps.includes(q.op)&&!adminOps.includes(q.op))return {ok:false,err:'bad_op'};
  const admin=adminOps.includes(q.op);
  if(admin&&!isAdmin(q))return {ok:false,err:'badpw'};
  // Read storage once per locked request, including all eleven phones' ballots.
  THIRD_CACHE=PropertiesService.getScriptProperties().getProperties();
  const m=thirdMeta_();
  if(q.op==='thirdStatus')return thirdPublic_(m,q.i);
  if(q.op==='thirdAdmin')return thirdAdmin_(m,q.i);
  if(admin) {
    if(q.revision!==m.revision)return {ok:false,err:'third_stale'};
    if(q.op==='thirdReview') {
      if(m.phase!=='collecting')return {ok:false,err:'third_locked'};
      const entry=thirdEntries_().find(e=>e.id===q.id);
      if(!entry||typeof q.enabled!=='boolean')return {ok:false,err:'bad_entry'};
      entry.enabled=q.enabled; thirdWrite_('entry_'+entry.author,entry);
    } else if(q.op==='thirdStart') {
      if(m.phase!=='collecting')return {ok:false,err:'third_phase'};
      const entries=thirdEntries_().filter(e=>e.enabled);
      if(!entries.length)return {ok:false,err:'no_questions'};
      for(let k=entries.length-1;k>0;k--){const j=raffleRandom_(k+1);const e=entries[k];entries[k]=entries[j];entries[j]=e;}
      m.runId=Utilities.getUuid();m.questions=entries.map((e,k)=>{
        const key='run_'+m.runId+'_q_'+k;thirdWrite_(key,{prompt:e.prompt,author:e.author});return key;
      });
      m.round=0;m.phase='voting';m.history=[];m.ties=[];m.result=[];
    } else if(q.op==='thirdClose') {
      if(!['voting','tiebreak'].includes(m.phase))return {ok:false,err:'third_phase'};
      const stage=m.phase==='tiebreak'?'tie':'main',ballots=thirdBallots_(m,stage);
      if(!ballots.length)return {ok:false,err:'no_votes'};
      if(stage==='main') {
        const scores=thirdScores_(ballots,Array.from({length:11},(_,i)=>i)).filter(r=>r.score>0);
        m.ties=thirdTies_(scores);
        if(m.ties.length){m.phase='tiebreak';}
        else {m.result=thirdRanking_(m,null);m.phase='ranking';}
      } else {m.result=thirdRanking_(m,ballots);m.phase='ranking';}
    } else if(q.op==='thirdAuthor') {
      if(m.phase!=='ranking')return {ok:false,err:'third_phase'};
      const question=thirdQuestion_(m),row=m.result.find(r=>r.i===question.author);
      const key='run_'+m.runId+'_result_'+m.round;
      thirdWrite_(key,{round:m.round,prompt:question.prompt,author:question.author,rank:row?row.rank:null,success:!!row&&row.rank===3,third:m.result.filter(r=>r.rank===3).map(r=>r.i)});
      m.history.push(key);
      m.phase='author';
    } else if(q.op==='thirdNext') {
      if(m.phase!=='author'||m.round+1>=m.questions.length)return {ok:false,err:'third_phase'};
      m.round++;m.phase='voting';m.ties=[];m.result=[];
    } else if(q.op==='thirdFinish') {
      if(m.phase!=='author'||m.round+1!==m.questions.length)return {ok:false,err:'third_phase'};
      m.phase='finished';
    } else if(q.op==='thirdPrepare') {
      if(m.phase!=='finished')return {ok:false,err:'third_phase'};
      thirdWrite_('archive_'+m.runId,m);
      Object.assign(m,{phase:'collecting',runId:null,round:-1,questions:[],history:[],ties:[],result:[]});
    }
    m.revision++;thirdWrite_('meta',m);return thirdAdmin_(m,q.i);
  }
  if(!thirdIdentity_(q.i))return {ok:false,err:'bad_identity'};
  if(q.op==='thirdSave') {
    if(m.phase!=='collecting')return {ok:false,err:'third_locked'};
    if(typeof q.prompt!=='string'||q.prompt.trim().length<5||q.prompt.trim().length>180)return {ok:false,err:'bad_prompt'};
    const old=thirdRead_('entry_'+q.i,null),prompt=q.prompt.trim();
    if(old&&old.prompt===prompt)return thirdPublic_(m,q.i);
    if(q.entryRevision!==(old?old.revision:0))return {ok:false,err:'entry_stale'};
    thirdWrite_('entry_'+q.i,{id:old?old.id:Utilities.getUuid(),author:q.i,prompt,revision:(old?old.revision:0)+1,enabled:old?old.enabled:true});
    m.revision++;thirdWrite_('meta',m);return thirdPublic_(m,q.i);
  }
  if(q.runId!==m.runId||q.round!==m.round||!m.runId)return {ok:false,err:'third_stale'};
  if(!['main','tie'].includes(q.stage))return {ok:false,err:'bad_stage'};
  const question=thirdQuestion_(m);
  if(q.i===question.author)return {ok:false,err:'author_vote'};
  const key=thirdVoteKey_(m,q.stage,q.i);
  if(thirdRead_(key,null))return Object.assign(thirdPublic_(m,q.i),{alreadyVoted:true});
  if((q.stage==='main'&&m.phase!=='voting')||(q.stage==='tie'&&m.phase!=='tiebreak'))return {ok:false,err:'vote_closed'};
  const candidates=q.stage==='tie'?m.ties:Array.from({length:11},(_,i)=>i),n=Math.min(3,candidates.length);
  if(!Array.isArray(q.choices)||q.choices.length!==n||new Set(q.choices).size!==n||!q.choices.every(i=>thirdIdentity_(i)&&candidates.includes(i)))return {ok:false,err:'bad_choices'};
  thirdWrite_(key,q.choices);return Object.assign(thirdPublic_(m,q.i),{accepted:true});
}
