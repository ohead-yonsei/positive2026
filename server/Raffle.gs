/** 긍정의밤 유령 추첨. Code.gs의 handle() 잠금 안에서 호출한다.
 * Gift.gs의 GIFT_IMG와 Code.gs의 isAdmin(q)를 재사용한다.
 * 공개 가능한 코드만 보관한다. 비밀번호와 기프티콘은 이 파일에 넣지 않는다.
 */
const RAFFLE_CLOSE = Date.parse('2026-10-31T00:00:00+09:00');
const RAFFLE_PREFIX = 'ghost_raffle_2026_';

function raffleEntries_() {
  const p = PropertiesService.getScriptProperties();
  const entries = [];
  for (let i = 0; i < 11; i++) {
    const raw = p.getProperty(RAFFLE_PREFIX + i);
    if (raw) entries.push(JSON.parse(raw));
  }
  return entries;
}
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
  const entries = result ? result.entries : raffleEntries_().map(e => ({i:e.i, count:e.count, tickets:e.tickets}));
  return {
    ok:true, version:3, serverNow:now, closeAt:RAFFLE_CLOSE, drawAt:RAFFLE_CLOSE,
    phase:result ? 'drawn' : legacy ? 'legacy-awarded' : now < RAFFLE_CLOSE ? 'open' : 'closed',
    entries, totalTickets:entries.reduce((n,e) => n + e.tickets, 0),
    winner:result ? result.winner : legacy ? legacy.by : null,
    drawnAt:result ? result.drawnAt : null,
    claimed:!!result || !!legacy, by:result ? result.winner : legacy ? legacy.by : null
  };
}
function raffleHash_(token) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function raffleIdentity_(q) {
  return Number.isInteger(q.i) && q.i >= 0 && q.i < 11 &&
    typeof q.token === 'string' && /^[a-f0-9]{64}$/.test(q.token);
}
function raffleRandom_(total) {
  const limit = Math.floor(4294967296 / total) * total;
  let n;
  do { n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16); } while (n >= limit);
  return n % total;
}
function raffleAction(q) {
  const p = PropertiesService.getScriptProperties();
  if (q.op === 'status') return rafflePublic_();
  // Old pages must never award the gift using the former first-come API.
  if (q.op === 'claim') return {ok:false, err:'raffle_only'};
  if (q.op === 'draw') {
    if (!isAdmin(q)) return {ok:false, err:'badpw'};
    if (raffleResult_()) return rafflePublic_();
    if (raffleLegacy_()) return {ok:false, err:'already_awarded'};
    if (Date.now() < RAFFLE_CLOSE) return {ok:false, err:'not_closed'};
    const entries = raffleEntries_().map(e => ({i:e.i, count:e.count, tickets:e.tickets}));
    const total = entries.reduce((n,e) => n + e.tickets, 0);
    if (!total) return {ok:false, err:'no_entries'};
    const ticket = raffleRandom_(total);
    let cursor = ticket, winner = null;
    for (const e of entries) { if (cursor < e.tickets) { winner = e.i; break; } cursor -= e.tickets; }
    p.setProperty(RAFFLE_PREFIX + 'result', JSON.stringify({winner, ticket, entries, drawnAt:Date.now()}));
    return rafflePublic_();
  }
  if (q.op === 'view') {
    const old = raffleLegacy_();
    if (!raffleResult_() && old && typeof q.token === 'string' && q.token === old.token)
      return {ok:true, img:GIFT_IMG, by:old.by};
  }
  if (!raffleIdentity_(q)) return {ok:false, err:'bad_identity'};
  const key = RAFFLE_PREFIX + q.i, raw = p.getProperty(key);
  const entry = raw ? JSON.parse(raw) : null;
  const hash = raffleHash_(q.token);
  if (q.op === 'mine' || q.op === 'view') {
    if (!entry || entry.tokenHash !== hash) return {ok:false, err:'denied'};
    if (q.op === 'mine') return Object.assign(rafflePublic_(), {mine:{i:entry.i, count:entry.count, tickets:entry.tickets}});
    const result = raffleResult_();
    if (!result) return {ok:false, err:'not_drawn'};
    if (result.winner !== q.i) return {ok:false, err:'not_winner'};
    return {ok:true, img:GIFT_IMG, by:q.i};
  }
  if (q.op !== 'enroll' && q.op !== 'sync') return {ok:false, err:'bad_op'};
  if (raffleLegacy_() || raffleResult_()) return {ok:false, err:'already_awarded'};
  if (Date.now() >= RAFFLE_CLOSE) return {ok:false, err:'closed'};
  if (!Number.isSafeInteger(q.count) || q.count < 100 || q.count > 1000000) return {ok:false, err:'bad_count'};
  if (entry && entry.tokenHash !== hash) return {ok:false, err:'entry_taken'};
  if (!entry && q.op === 'sync') return {ok:false, err:'not_enrolled'};
  const count = Math.max(entry ? entry.count : 0, q.count);
  const next = {i:q.i, tokenHash:hash, count, tickets:Math.min(5, Math.floor(count / 100))};
  p.setProperty(key, JSON.stringify(next));
  return Object.assign(rafflePublic_(), {mine:{i:next.i, count, tickets:next.tickets}});
}
