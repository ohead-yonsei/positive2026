/**
 * 긍정의밤 2026 서버 (Google Apps Script)
 * 1) 아래 ADMIN_PASSWORD 를 운영진만 아는 비밀번호로 바꾸고 저장
 * 2) 배포 > 새 배포 > 웹 앱 / 실행: 나 / 액세스 권한: 모든 사용자
 */
const ADMIN_PASSWORD = 'test-only-password';

const N = 11;
const MAX_TASKS = 40;
const P = PropertiesService.getScriptProperties();

function doGet(e) { return handle((e && e.parameter) || {}); }
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (x) {}
  return handle(body);
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function getJ(k, d) { const v = P.getProperty(k); return v ? JSON.parse(v) : d; }
function setJ(k, v) { P.setProperty(k, JSON.stringify(v)); }
function defBoard() { return { tasks: [{ id: 'staff', title: '운영진', people: [] }] }; }
function regList() { const r = []; for (let i = 0; i < N; i++) if (P.getProperty('reg_' + i)) r.push(i); return r; }
function status() { return { ok: true, board: getJ('board', defBoard()), registered: regList(), started: !!P.getProperty('result') }; }
function fail(err, extra) { return Object.assign({ ok: false, err: err }, extra || {}); }

function idx(v) { const i = Number(v); if (!Number.isInteger(i) || i < 0 || i >= N) throw new Error('bad_index'); return i; }
function str(v, max) { if (typeof v !== 'string' || !v.length || v.length > max) throw new Error('bad_field'); return v; }
function isAdmin(q) { return typeof q.pw === 'string' && q.pw === ADMIN_PASSWORD && ADMIN_PASSWORD.indexOf('여기를') !== 0; }

function handle(q) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (x) { return out(fail('busy')); }
  try { return out(route(q)); }
  catch (x) { return out(fail(String((x && x.message) || x))); }
  finally { lock.releaseLock(); }
}

function route(q) {
  const guard = authGuard_(q); if (guard) return guard;
  switch (q.a) {
    case 'state': return status();

    case 'board': {
      const b = getJ('board', defBoard());
      const op = q.op || {};
      const t = op.tid ? b.tasks.find(function (x) { return x.id === op.tid; }) : null;
      if (op.type === 'add') { const i = idx(op.i); if (t && t.people.indexOf(i) < 0) t.people.push(i); }
      else if (op.type === 'remove') { const i = idx(op.i); if (t) t.people = t.people.filter(function (p) { return p !== i; }); }
      else if (op.type === 'addTask') {
        if (b.tasks.length >= MAX_TASKS) return fail('too_many');
        const title = str(String(op.title || '').trim(), 40);
        const id = str(String(op.id || ''), 40);
        if (!b.tasks.some(function (x) { return x.id === id; })) b.tasks.push({ id: id, title: title, people: [] });
      }
      else if (op.type === 'delTask') { if (op.tid !== 'staff') b.tasks = b.tasks.filter(function (x) { return x.id !== op.tid; }); }
      else if (op.type === 'setColor') {
        if (!t) return fail('not_found');
        if (['cream', 'yellow', 'mint', 'lavender'].indexOf(op.color) < 0) return fail('bad_color');
        t.color = op.color;
      }
      else if (op.type === 'setArrival' || op.type === 'removeArrival') {
        const i = idx(op.i);
        if (!Number.isInteger(op.hour) || op.hour < 13 || op.hour > 19) return fail('bad_hour');
        if (!Array.isArray(b.arrivals)) b.arrivals = Array(N).fill(null);
        if (op.type === 'setArrival') b.arrivals[i] = op.hour;
        else if (b.arrivals[i] === op.hour) b.arrivals[i] = null;
      }
      else return fail('bad_op');
      setJ('board', b);
      return status();
    }

    case 'register': {
      const i = idx(q.i);
      if (P.getProperty('reg_' + i)) return fail('taken');
      setJ('reg_' + i, { pub: str(q.pub, 200), salt: str(q.salt, 100), iv: str(q.iv, 100), enc: str(q.enc, 600), ver: str(q.ver, 100), fails: 0 });
      return status();
    }

    case 'salt': {
      const r = getJ('reg_' + idx(q.i), null);
      if (!r) return fail('notreg');
      return { ok: true, salt: r.salt };
    }

    case 'mine': {
      const i = idx(q.i);
      const r = getJ('reg_' + i, null);
      if (!r) return fail('notreg');
      if (r.fails >= 10) return fail('locked');
      if (q.v !== r.ver) { r.fails++; setJ('reg_' + i, r); return fail('badpin', { left: Math.max(0, 10 - r.fails) }); }
      if (r.fails) { r.fails = 0; setJ('reg_' + i, r); }
      const res = getJ('result', null);
      if (!res) return { ok: true, started: false };
      const it = res.items[i];
      return { ok: true, started: true, salt: r.salt, iv: r.iv, enc: r.enc, eph: res.eph, iv2: it.iv2, ct: it.ct };
    }

    case 'admin': return isAdmin(q) ? status() : fail('badpw');

    case 'pubs': {
      if (!isAdmin(q)) return fail('badpw');
      const pubs = [];
      for (let i = 0; i < N; i++) { const r = getJ('reg_' + i, null); if (!r) return fail('not_all'); pubs.push(r.pub); }
      return { ok: true, pubs: pubs };
    }

    case 'start': {
      if (!isAdmin(q)) return fail('badpw');
      if (regList().length !== N) return fail('not_all');
      const items = {};
      (q.items || []).forEach(function (it) { items[idx(it.i)] = { iv2: str(it.iv2, 100), ct: str(it.ct, 200) }; });
      if (Object.keys(items).length !== N) return fail('bad_items');
      setJ('result', { eph: str(q.eph, 200), items: items });
      return status();
    }

    case 'reset': {
      if (!isAdmin(q)) return fail('badpw');
      P.deleteProperty('reg_' + idx(q.i));
      P.deleteProperty('result');
      return status();
    }

    case 'gift': return giftAction(q);default: return fail('bad_action');
  }
}
