/** 긍정의밤 유령 추첨. Code.gs의 handle() 잠금 안에서 호출한다.
 * 이름만으로 참여하고, 선물은 운영진이 현장에서 전달한다.
 * 비밀번호와 기프티콘 이미지는 이 파일에 넣지 않는다.
 */
const RAFFLE_CLOSE = Date.parse('2026-10-31T00:00:00+09:00');
const RAFFLE_PREFIX = 'ghost_raffle_2026_';
const RAFFLE_CLICKS = RAFFLE_PREFIX + 'clicks_';

function raffleCounts_() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const counts = Array.from({length:11}, (_,i) => ({i, base:0, added:0}));
  // Version 3 entries remain the baseline; no migration or deletion is needed.
  counts.forEach(e => { if (all[RAFFLE_PREFIX + e.i]) e.base = JSON.parse(all[RAFFLE_PREFIX + e.i]).count; });
  Object.keys(all).filter(k => k.indexOf(RAFFLE_CLICKS) === 0).forEach(k => {
    const s = JSON.parse(all[k]), e = counts[s.i];
    e.base = Math.max(e.base, s.floor);
    e.added += s.clicks;
  });
  return counts.map(e => ({i:e.i, count:e.base + e.added, tickets:Math.min(5, Math.floor((e.base + e.added) / 100))}));
}
function raffleEntries_() { return raffleCounts_().filter(e => e.tickets > 0); }
function raffleResult_() {
  const raw = PropertiesService.getScriptProperties().getProperty(RAFFLE_PREFIX + 'result');
  return raw ? JSON.parse(raw) : null;
}
function raffleLegacy_() {
  const raw = PropertiesService.getScriptProperties().getProperty('gift');
  return raw ? JSON.parse(raw) : null;
}
function rafflePublic_() {
  const result = raffleResult_(), legacy = raffleLegacy_(), now = Date.now();
  const entries = result ? result.entries : raffleEntries_();
  return {
    ok:true, version:4, serverNow:now, closeAt:RAFFLE_CLOSE, drawAt:RAFFLE_CLOSE,
    phase:result ? 'drawn' : legacy ? 'legacy-awarded' : now < RAFFLE_CLOSE ? 'open' : 'closed',
    entries, totalTickets:entries.reduce((n,e) => n + e.tickets, 0),
    winner:result ? result.winner : legacy ? legacy.by : null,
    drawnAt:result ? result.drawnAt : null,
    claimed:!!result || !!legacy, by:result ? result.winner : legacy ? legacy.by : null
  };
}
function raffleMine_(q) {
  const raw = q.session && PropertiesService.getScriptProperties().getProperty(RAFFLE_CLICKS + q.session);
  const saved = raw ? JSON.parse(raw) : null;
  return Object.assign(rafflePublic_(), {
    mine:raffleCounts_()[q.i],
    session:{id:q.session || null, clicks:saved && saved.i === q.i ? saved.clicks : 0}
  });
}
function raffleRandom_(total) {
  const limit = Math.floor(4294967296 / total) * total;
  let n;
  do { n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16); } while (n >= limit);
  return n % total;
}
function raffleAction(q) {
  // Reuse the existing locked event route without touching private Code.gs.
  if (['voteStatus','voteSubmit','voteReveal'].indexOf(q.op) >= 0) return voteAction(q);
  if (typeof q.op === 'string' && q.op.indexOf('quiz') === 0) return quizAction(q);
  const p = PropertiesService.getScriptProperties();
  if (q.op === 'status') return rafflePublic_();
  if (q.op === 'claim') return {ok:false, err:'raffle_only'};
  // No endpoint, including the former winner-token flow, returns the barcode.
  if (q.op === 'view') return {ok:false, err:'in_person'};
  if (q.op === 'draw') {
    if (!isAdmin(q)) return {ok:false, err:'badpw'};
    if (raffleResult_()) return rafflePublic_();
    if (raffleLegacy_()) return {ok:false, err:'already_awarded'};
    if (Date.now() < RAFFLE_CLOSE) return {ok:false, err:'not_closed'};
    const entries = raffleEntries_(), total = entries.reduce((n,e) => n + e.tickets, 0);
    if (!total) return {ok:false, err:'no_entries'};
    const ticket = raffleRandom_(total);
    let cursor = ticket, winner = null;
    for (const e of entries) { if (cursor < e.tickets) { winner = e.i; break; } cursor -= e.tickets; }
    p.setProperty(RAFFLE_PREFIX + 'result', JSON.stringify({winner, ticket, entries, drawnAt:Date.now()}));
    return rafflePublic_();
  }
  if (!Number.isInteger(q.i) || q.i < 0 || q.i >= 11) return {ok:false, err:'bad_identity'};
  if (q.session !== undefined && (typeof q.session !== 'string' || !/^[a-f0-9]{32}$/.test(q.session))) return {ok:false, err:'bad_session'};
  if (q.op === 'mine') return raffleMine_(q);
  // An outdated page cannot submit an absolute count over the new summed counts.
  if (q.op === 'enroll' || q.op === 'sync') return {ok:false, err:'refresh_required'};
  if (q.op !== 'progress') return {ok:false, err:'bad_op'};
  if (!q.session) return {ok:false, err:'bad_session'};
  if (raffleLegacy_() || raffleResult_()) return {ok:false, err:'already_awarded'};
  if (Date.now() >= RAFFLE_CLOSE) return {ok:false, err:'closed'};
  if (![q.clicks,q.floor].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000)) return {ok:false, err:'bad_count'};
  const key = RAFFLE_CLICKS + q.session, raw = p.getProperty(key), old = raw ? JSON.parse(raw) : null;
  if (old && (old.i !== q.i || old.floor !== q.floor)) return {ok:false, err:'session_conflict'};
  // One atomic property write; retries and simultaneous browsers never double-count.
  if (q.clicks || q.floor || old)
    p.setProperty(key, JSON.stringify({i:q.i, floor:q.floor, clicks:Math.max(old ? old.clicks : 0, q.clicks)}));
  return raffleMine_(q);
}
