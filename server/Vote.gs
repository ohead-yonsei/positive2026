/** 10주년 긍정 시상식. 기존 handle()의 ScriptLock 안에서 호출한다. */
const VOTE_REVEAL_AT = Date.parse('2026-10-31T21:00:00+09:00');
const VOTE_KEY = 'positive_awards_2026_ballots';
const VOTE_EARLY_KEY = 'positive_awards_2026_opened_at';
const VOTE_PEOPLE = 11;

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
    phase:revealed ? 'revealed' : 'open', submitted, total:submitted.length};
  // Before the deadline no counts, winners or individual choices leave the server.
  if (revealed) {
    out.results = Array.from({length:3}, () => Array(VOTE_PEOPLE).fill(0));
    submitted.forEach(i => ballots[i].forEach((person,category) => out.results[category][person]++));
  }
  return out;
}
function voteAction(q) {
  if (!['voteStatus','voteSubmit','voteReveal'].includes(q.op)) return {ok:false, err:'bad_op'};
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
