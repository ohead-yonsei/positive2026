/** Site accounts are independent copies of the existing manito credentials.
 * Called under Code.gs's ScriptLock. Never stores passwords or manito keys.
 * Reads the legacy reg_<index> only for a first copy; never writes it.
 */
const AUTH_PREFIX = 'positive_auth_2026_';
const AUTH_TTL = 14 * 86400000;
const AUTH_LOCK = 15 * 60000;
function siteAuthLegacyAccount_(i) {
  const raw=PropertiesService.getScriptProperties().getProperty('reg_'+i);
  if(!raw)return null;
  const r=JSON.parse(raw);return {salt:r.salt,ver:r.ver};
}
function siteAuthBoard_() {
  const raw=PropertiesService.getScriptProperties().getProperty('board');
  return raw?JSON.parse(raw):{tasks:[]};
}
function authIdentity_(i) { return Number.isInteger(i) && i >= 0 && i < 11; }
function authRead_(i) {
  const raw = PropertiesService.getScriptProperties().getProperty(AUTH_PREFIX+i);
  return raw ? JSON.parse(raw) : null;
}
function authWrite_(i, a) { PropertiesService.getScriptProperties().setProperty(AUTH_PREFIX+i,JSON.stringify(a)); }
function authCredentialsValid_(salt, ver) {
  return typeof salt==='string' && /^[A-Za-z0-9+/]{22}==$/.test(salt) && typeof ver==='string' && /^[a-f0-9]{64}$/.test(ver);
}
function authAccount_(i) {
  let a = authRead_(i);
  if (a) return a; // Never re-import after a site password reset/change.
  const legacy = siteAuthLegacyAccount_(i);
  if (!legacy || !authCredentialsValid_(legacy.salt,legacy.ver)) return null;
  a = {salt:legacy.salt,ver:legacy.ver,revision:1,failures:0,lockedUntil:0,changeRequired:false,sessions:[],copiedAt:Date.now()};
  authWrite_(i,a);
  return a;
}
function authEqual_(a,b) {
  if (typeof a!=='string'||typeof b!=='string'||a.length!==b.length) return false;
  let diff=0; for(let k=0;k<a.length;k++) diff|=a.charCodeAt(k)^b.charCodeAt(k);
  return diff===0;
}
function authHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8)
    .map(n=>((n+256)%256).toString(16).padStart(2,'0')).join('');
}
function authSession_(q, allowChange) {
  if (typeof q.auth!=='string'||!/^(?:[0-9]|10)\.[a-f0-9]{64}$/.test(q.auth)) return null;
  const i=Number(q.auth.split('.')[0]),a=authRead_(i),hash=authHash_(q.auth);
  if (!a) return null;
  const s=a.sessions.find(s=>s.expiresAt>Date.now()&&authEqual_(s.hash,hash));
  if (!s || (a.changeRequired&&!allowChange)) return null;
  return {i,a,s,hash};
}
function authIssue_(i,a) {
  const token=i+'.'+Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  const expiresAt=Date.now()+AUTH_TTL;
  a.sessions=a.sessions.filter(s=>s.expiresAt>Date.now()).slice(-7);
  a.sessions.push({hash:authHash_(token),expiresAt});
  authWrite_(i,a);
  return {ok:true,auth:token,i,expiresAt,changeRequired:a.changeRequired,revision:a.revision};
}
function authVerify_(i,a,ver) {
  if (a.lockedUntil>Date.now()) return {ok:false,err:'auth_locked',retryAt:a.lockedUntil};
  if (a.lockedUntil) {a.failures=0;a.lockedUntil=0;}
  if (!authEqual_(a.ver,ver)) {
    a.failures++; if(a.failures>=10)a.lockedUntil=Date.now()+AUTH_LOCK;
    authWrite_(i,a);
    return {ok:false,err:a.lockedUntil?'auth_locked':'auth_bad_password',retryAt:a.lockedUntil};
  }
  a.failures=0;a.lockedUntil=0;return null;
}
function authAdmin_() {
  return {ok:true,accounts:Array.from({length:11},(_,i)=>{
    const a=authRead_(i);
    return {i,exists:!!a,revision:a?a.revision:0,changeRequired:!!(a&&a.changeRequired),locked:!!(a&&a.lockedUntil>Date.now())};
  })};
}
function authAction(q) {
  if (q.op==='authAdmin'||q.op==='authReset') {
    if(!isAdmin(q))return {ok:false,err:'badpw'};
    if(q.op==='authAdmin')return authAdmin_();
    if(!authIdentity_(q.i)||!authCredentialsValid_(q.salt,q.ver))return {ok:false,err:'auth_bad_input'};
    const old=authRead_(q.i),revision=old?old.revision:0;
    if(q.revision!==revision)return {ok:false,err:'auth_stale'};
    // Only this account key changes. No manito registration, encrypted result or participation data is touched.
    authWrite_(q.i,{salt:q.salt,ver:q.ver,revision:revision+1,failures:0,lockedUntil:0,changeRequired:true,sessions:[],resetAt:Date.now()});
    return authAdmin_();
  }
  if(q.op==='authSalt'||q.op==='authLogin') {
    if(!authIdentity_(q.i))return {ok:false,err:'bad_identity'};
    const a=authAccount_(q.i);if(!a)return {ok:false,err:'auth_not_registered'};
    if(q.op==='authSalt')return {ok:true,salt:a.salt,revision:a.revision};
    if(q.revision!==a.revision)return {ok:false,err:'auth_stale'};
    const failure=authVerify_(q.i,a,q.ver);if(failure)return failure;
    return authIssue_(q.i,a);
  }
  if(!['authMe','authLogout','authChange'].includes(q.op))return {ok:false,err:'bad_op'};
  const s=authSession_(q,true);if(!s)return {ok:false,err:'auth_required'};
  if(q.op==='authMe')return {ok:true,i:s.i,expiresAt:s.s.expiresAt,changeRequired:s.a.changeRequired,revision:s.a.revision};
  if(q.op==='authLogout') {
    s.a.sessions=s.a.sessions.filter(t=>t.hash!==s.hash);authWrite_(s.i,s.a);return {ok:true};
  }
  if(q.revision!==s.a.revision)return {ok:false,err:'auth_stale'};
  const failure=authVerify_(s.i,s.a,q.currentVer);if(failure)return failure;
  if(!authCredentialsValid_(q.salt,q.ver)||q.salt===s.a.salt)return {ok:false,err:'auth_bad_input'};
  Object.assign(s.a,{salt:q.salt,ver:q.ver,revision:s.a.revision+1,changeRequired:false,sessions:[],changedAt:Date.now()});
  return authIssue_(s.i,s.a);
}

/** Return an error or null; bind all personal operations to the authenticated member.
 * Insert before Code.gs dispatches any action, inside its existing lock.
 */
function authGuard_(q) {
  const publicActions=['state','salt'];
  const adminActions=['admin','pubs','start','reset'];
  if(publicActions.includes(q.a)||adminActions.includes(q.a))return null;
  if(q.a==='gift') {
    if(typeof q.op==='string'&&q.op.indexOf('auth')===0)return null;
    const publicOps=['status','voteStatus','quizStatus','thirdStatus'];
    const adminOps=['draw','voteReveal','quizAdmin','quizSave','quizOpen','quizQuestion','quizReveal','quizNext','quizFinish','quizPrepare','thirdAdmin','thirdReview','thirdStart','thirdClose','thirdAuthor','thirdNext','thirdFinish','thirdPrepare'];
    if(adminOps.includes(q.op)) { delete q.i; return null; }
    if(publicOps.includes(q.op)&&!q.auth) {delete q.i;return null;}
  }
  const s=authSession_(q,true);
  if(!s)return {ok:false,err:'auth_required'};
  if(s.a.changeRequired)return {ok:false,err:'auth_change_required'};
  if(q.a==='board') {
    if(!q.op||typeof q.op!=='object')return {ok:false,err:'bad_op'};
    if(['add','remove','setArrival','removeArrival'].includes(q.op.type)) {
      if(q.op.i!==undefined&&q.op.i!==s.i)return {ok:false,err:'auth_identity'};
      q.op.i=s.i;
    }
    if(q.op.type==='delTask') {
      if(typeof q.op.tid!=='string'||q.op.tid.indexOf('ack-')===0)return {ok:false,err:'auth_task_shared'};
      const board=siteAuthBoard_(),t=board.tasks.find(t=>t.id===q.op.tid);
      if(t&&t.people.some(i=>i!==s.i))return {ok:false,err:'auth_task_shared'};
    }
  } else {
    if(q.i!==undefined&&q.i!==s.i)return {ok:false,err:'auth_identity'};
    q.i=s.i;
  }
  return null;
}
