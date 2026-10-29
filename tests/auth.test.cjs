const test=require('node:test'),assert=require('node:assert/strict'),setup=require('./auth-helper.cjs');
const credential=(n=5)=>({salt:Buffer.alloc(16,n).toString('base64'),ver:String(n).repeat(64)});
const account=(s,i)=>JSON.parse(s.data.get('positive_auth_2026_'+i));
test('first login copies only salt and verifier; no manito keys, fail counter or results are copied',()=>{
 const s=setup(),original=s.data.get('reg_0');s.data.set('reg_0',JSON.stringify({...JSON.parse(original),fails:9}));
 const j=s.login(0);assert.equal(j.ok,true);assert.equal(j.i,0);assert.equal(j.changeRequired,false);
 const a=account(s,0);assert.equal(a.salt,JSON.parse(original).salt);assert.equal(a.ver,'a'.repeat(64));
 for(const field of ['pub','enc','iv','fails'])assert.equal(a[field],undefined);
 assert.equal(JSON.parse(s.data.get('reg_0')).fails,9);assert.equal(a.failures,0);
 assert.ok(!s.data.get('positive_auth_2026_0').includes(j.auth));
});
test('anonymous requests cannot change board, arrive, vote, quiz, question, raffle or reveal manito',()=>{
 const s=setup(),before=[...s.data];
 for(const q of [{a:'board',op:{type:'setArrival',i:0,hour:15}},{a:'mine',i:0,v:'a'.repeat(64)},{a:'register',i:0},...['voteSubmit','quizJoin','quizAnswer','thirdSave','thirdVote','progress','mine'].map(op=>({a:'gift',op,i:0}))])assert.equal(s.call(q).err,'auth_required');
 assert.deepEqual([...s.data],before);assert.equal(s.call({a:'state'}).ok,true);
});
test('private status cannot be obtained by supplying another name; forged tokens fail',()=>{
 const s=setup(),a=s.login(0),b=s.login(1);
 s.op('thirdSave',{auth:a.auth,i:0,prompt:'비공개로 모으는 내 질문',entryRevision:0});
 assert.equal(s.op('thirdStatus',{i:0}).mine,undefined);
 assert.equal(s.op('quizStatus',{i:0}).mine,undefined);
 assert.equal(s.op('thirdStatus',{auth:b.auth,i:0}).err,'auth_identity');
 assert.equal(s.op('thirdStatus',{auth:'0.'+'f'.repeat(64),i:0}).err,'auth_required');
 assert.equal(s.op('thirdStatus',{auth:a.auth}).mine.entry.prompt,'비공개로 모으는 내 질문');
});
test('authenticated requests bind identity and reject attempts to edit another member',()=>{
 const s=setup(),a=s.login(0);
 assert.equal(s.call({a:'board',auth:a.auth,op:{type:'setArrival',i:1,hour:15}}).err,'auth_identity');
 assert.equal(s.call({a:'board',auth:a.auth,op:{type:'setArrival',hour:15}}).board.arrivals[0],15);
 assert.equal(s.op('voteSubmit',{auth:a.auth,i:1,choices:[0,0,0]}).err,'auth_identity');
 assert.equal(s.op('voteSubmit',{auth:a.auth,choices:[1,2,3]}).total,1);
 assert.equal(s.call({a:'mine',auth:a.auth,i:1,v:'a'.repeat(64)}).err,'auth_identity');
});
test('reset preserves all participation and manito bytes, revokes only that person, and never reimports legacy password',()=>{
 const s=setup(),a=s.login(0),a2=s.login(0),b=s.login(1);
 s.call({a:'board',auth:a.auth,op:{type:'setArrival',hour:17}});s.op('voteSubmit',{auth:a.auth,choices:[1,2,3]});
 s.op('thirdSave',{auth:a.auth,prompt:'내가 세 번째일 질문은?',entryRevision:0});s.op('progress',{auth:a.auth,session:'b'.repeat(32),clicks:50,floor:0});
 s.data.set('result','{"eph":"private-matching","items":{"0":{"ct":"encrypted-result"}}}');
 const baseline=[...s.data].filter(([k])=>!k.startsWith('positive_auth_2026_'));
 assert.equal(s.admin('authReset',{i:0,revision:1,...credential()}).ok,true);
 assert.deepEqual([...s.data].filter(([k])=>!k.startsWith('positive_auth_2026_')),baseline);
 for(const token of [a.auth,a2.auth])assert.equal(s.op('authMe',{auth:token}).err,'auth_required');
 assert.equal(s.op('authMe',{auth:b.auth}).ok,true);assert.equal(s.login(0).err,'auth_bad_password');
 const temporary=s.login(0,credential().ver);assert.equal(temporary.changeRequired,true);
 assert.equal(s.op('thirdSave',{auth:temporary.auth,prompt:'changed',entryRevision:1}).err,'auth_change_required');
 const changed=s.op('authChange',{auth:temporary.auth,revision:2,currentVer:credential().ver,...credential(6)});
 assert.equal(changed.ok,true);assert.equal(changed.changeRequired,false);
 assert.equal(s.op('authMe',{auth:temporary.auth}).err,'auth_required');
 assert.equal(s.login(0,credential(6).ver).ok,true);
 assert.equal(s.op('thirdStatus',{auth:changed.auth}).mine.entry.prompt,'내가 세 번째일 질문은?');
 assert.deepEqual([...s.data].filter(([k])=>!k.startsWith('positive_auth_2026_')),baseline);
 assert.equal(account(s,0).salt,credential(6).salt);
});
test('wrong password lock is independent of manito and expires after 15 minutes',()=>{
 const s=setup(),original=s.data.get('reg_0');
 for(let n=0;n<9;n++)assert.equal(s.login(0,'b'.repeat(64)).err,'auth_bad_password');
 assert.equal(s.login(0,'b'.repeat(64)).err,'auth_locked');assert.equal(s.login(0).err,'auth_locked');
 assert.equal(s.data.get('reg_0'),original);s.setTime(s.time()+15*60000);assert.equal(s.login(0).ok,true);
});
test('reset requires admin and current revision; change requires current password',()=>{
 const s=setup(),a=s.login(0);
 assert.equal(s.op('authReset',{i:0,revision:1,...credential()}).err,'badpw');
 assert.equal(s.admin('authReset',{i:0,revision:0,...credential()}).err,'auth_stale');
 assert.equal(s.op('authChange',{auth:a.auth,revision:1,currentVer:'b'.repeat(64),...credential()}).err,'auth_bad_password');
 assert.equal(s.op('authChange',{auth:a.auth,revision:0,currentVer:'a'.repeat(64),...credential()}).err,'auth_stale');
 assert.equal(s.login(0).ok,true);
});
test('session expiration, logout, eight-session bound and per-browser independence',()=>{
 const s=setup(),a=s.login(0),b=s.login(0);assert.equal(s.op('authLogout',{auth:a.auth}).ok,true);
 assert.equal(s.op('authMe',{auth:a.auth}).err,'auth_required');assert.equal(s.op('authMe',{auth:b.auth}).ok,true);
 for(let n=0;n<8;n++)s.login(0);assert.equal(account(s,0).sessions.length,8);assert.equal(s.op('authMe',{auth:b.auth}).err,'auth_required');
 const c=s.login(0);s.setTime(c.expiresAt);assert.equal(s.op('authMe',{auth:c.auth}).err,'auth_required');
});
test('shared task color and creation remain available, but another person cannot be removed through task deletion',()=>{
 const s=setup(),a=s.login(0);s.data.set('board',JSON.stringify({tasks:[{id:'shared',title:'함께할 일',people:[0,1]},{id:'empty',title:'빈 할 일',people:[]},{id:'ack-ttk',title:'떡볶이 확인',people:[]}]}));
 assert.equal(s.call({a:'board',auth:a.auth,op:{type:'delTask',tid:'shared'}}).err,'auth_task_shared');
 assert.equal(s.call({a:'board',auth:a.auth,op:{type:'remove',tid:'shared',i:1}}).err,'auth_identity');
 assert.equal(s.call({a:'board',auth:a.auth,op:{type:'setColor',tid:'shared',color:'mint'}}).ok,true);
 assert.equal(s.call({a:'board',auth:a.auth,op:{type:'delTask',tid:'empty'}}).ok,true);
 assert.equal(s.call({a:'board',auth:a.auth,op:{type:'delTask',tid:'ack-ttk'}}).err,'auth_task_shared');
});
test('missing registrations fail safely and can be provisioned independently by admin',()=>{
 const s=setup();s.data.delete('reg_10');assert.equal(s.login(10).err,'auth_not_registered');
 assert.equal(s.admin('authReset',{i:10,revision:0,...credential()}).ok,true);
 assert.equal(s.login(10,credential().ver).changeRequired,true);assert.equal(s.data.has('reg_10'),false);
});
