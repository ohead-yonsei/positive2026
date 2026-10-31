/** 10주년 긍정 시상식. 기존 handle()의 ScriptLock 안에서 호출한다. */
const VOTE_REVEAL_AT = Date.parse('2026-10-31T21:00:00+09:00');
const VOTE_KEY = 'positive_awards_2026_ballots';
const VOTE_EARLY_KEY = 'positive_awards_2026_opened_at';
const VOTE_PEOPLE = 11;
const VOTE_REVOTE_KEY = 'positive_awards_2026_third_revote';

function voteRevoteRead_() {
  const raw=PropertiesService.getScriptProperties().getProperty(VOTE_REVOTE_KEY);
  return raw ? JSON.parse(raw) : {revision:0,phase:'none',id:null,prompt:'',ballots:{}};
}
function voteRevotePublic_() {
  const r=voteRevoteRead_(),submitted=Object.keys(r.ballots).map(Number).sort((a,b)=>a-b);
  const out={revision:r.revision,phase:r.phase,id:r.id,prompt:r.prompt,submitted,total:submitted.length};
  if(r.phase==='revealed') {
    out.counts=Array(VOTE_PEOPLE).fill(0);
    submitted.forEach(i=>out.counts[r.ballots[i]]++);
  }
  return out;
}
function voteRevoteAction_(q) {
  const r=voteRevoteRead_();
  if(q.op==='voteReveal') {
    if(!isAdmin(q))return {ok:false,err:'badpw'};
    if(q.revision!==r.revision)return {ok:false,err:'revote_stale'};
    if(q.revoteAction==='open') {
      if(r.phase!=='none'||!voteRevealed_())return {ok:false,err:'revote_phase'};
      if(typeof q.prompt!=='string'||q.prompt.trim().length<5||q.prompt.trim().length>180)return {ok:false,err:'bad_prompt'};
      Object.assign(r,{id:Utilities.getUuid(),prompt:q.prompt.trim(),phase:'open',openedAt:Date.now()});
    } else if(q.revoteAction==='reveal') {
      if(q.revoteId!==r.id)return {ok:false,err:'revote_stale'};
      if(r.phase!=='open')return {ok:false,err:'revote_phase'};
      if(!Object.keys(r.ballots).length)return {ok:false,err:'no_votes'};
      r.phase='revealed';r.closedAt=Date.now();
    } else return {ok:false,err:'bad_op'};
    r.revision++;
  } else {
    if(!Number.isInteger(q.i)||q.i<0||q.i>=VOTE_PEOPLE)return {ok:false,err:'bad_identity'};
    if(!r.id||q.revoteId!==r.id)return {ok:false,err:'revote_stale'};
    if(Object.prototype.hasOwnProperty.call(r.ballots,q.i))return Object.assign(votePublic_(voteBallots_()),{alreadyVoted:true});
    if(r.phase!=='open')return {ok:false,err:'vote_closed'};
    if(!Number.isInteger(q.choice)||q.choice<0||q.choice>=VOTE_PEOPLE)return {ok:false,err:'bad_choices'};
    r.ballots[q.i]=q.choice;
  }
  // A separate property preserves every original ballot and all three old results.
  PropertiesService.getScriptProperties().setProperty(VOTE_REVOTE_KEY,JSON.stringify(r));
  return Object.assign(votePublic_(voteBallots_()),{accepted:true});
}

function voteRevealed_() {
  return Date.now() >= VOTE_REVEAL_AT || !!PropertiesService.getScriptProperties().getProperty(VOTE_EARLY_KEY);
}

function voteBallots_() {
  const raw = PropertiesService.getScriptProperties().getProperty(VOTE_KEY);
  return raw ? JSON.parse(raw) : {};
}
function votePublic_(ballots) {
  const serverNow = Date.now(), revealed = voteRevealed_();
  const submitted = Object.keys(ballots).map(Number).sort((a,b) => a-b);
  const out = {ok:true, version:1, serverNow, revealAt:VOTE_REVEAL_AT,
    phase:revealed ? 'revealed' : 'open', submitted, total:submitted.length,revote:voteRevotePublic_()};
  // Before the deadline no counts, winners or individual choices leave the server.
  if (revealed) {
    out.results = Array.from({length:3}, () => Array(VOTE_PEOPLE).fill(0));
    submitted.forEach(i => ballots[i].forEach((person,category) => out.results[category][person]++));
  }
  return out;
}
function voteAction(q) {
  if (!['voteStatus','voteSubmit','voteReveal'].includes(q.op)) return {ok:false, err:'bad_op'};
  if((q.op==='voteReveal'&&q.revoteAction!==undefined)||(q.op==='voteSubmit'&&q.revoteId!==undefined))return voteRevoteAction_(q);
  const ballots = voteBallots_();
  if (q.op === 'voteReveal') {
    if (!isAdmin(q)) return {ok:false, err:'badpw'};
    if (!voteRevealed_()) PropertiesService.getScriptProperties().setProperty(VOTE_EARLY_KEY, String(Date.now()));
    return votePublic_(ballots);
  }
  if (q.op === 'voteStatus') return votePublic_(ballots);
  if (!Number.isInteger(q.i) || q.i < 0 || q.i >= VOTE_PEOPLE) return {ok:false, err:'bad_identity'};
  // Idempotent acknowledgement handles lost responses and a fresh browser.
  // Never echo the old choices or overwrite an existing ballot.
  if (Object.prototype.hasOwnProperty.call(ballots, q.i))
    return Object.assign(votePublic_(ballots), {alreadyVoted:true});
  if (voteRevealed_()) return {ok:false, err:'vote_closed'};
  if (!Array.isArray(q.choices) || q.choices.length !== 3 ||
      !q.choices.every(i => Number.isInteger(i) && i >= 0 && i < VOTE_PEOPLE))
    return {ok:false, err:'bad_choices'};
  ballots[q.i] = q.choices.slice();
  // A single write under the shared ScriptLock prevents duplicate/lost ballots.
  PropertiesService.getScriptProperties().setProperty(VOTE_KEY, JSON.stringify(ballots));
  return Object.assign(votePublic_(ballots), {accepted:true});
}
