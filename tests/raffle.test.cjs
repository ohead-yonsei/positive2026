const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('server/Raffle.gs','utf8');
const CLOSE=Date.parse('2026-10-31T00:00:00+09:00');
const ID='a'.repeat(32), OTHER='b'.repeat(32);
function setup(){
  let time=CLOSE-1000,random=0;
  const data=new Map();
  const context=vm.createContext({
    Date:class extends Date{static now(){return time}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>data.get(k)||null,getProperties:()=>Object.fromEntries(data),setProperty:(k,v)=>data.set(k,v)})},
    Utilities:{getUuid:()=>random.toString(16).padStart(8,'0')+'-0000-4000-8000-000000000000'},
    GIFT_IMG:'data:image/png;base64,TEST_ONLY',isAdmin:q=>q.pw==='test-password'
  });
  vm.runInContext(source,context);
  const call=q=>JSON.parse(JSON.stringify(context.raffleAction(q)));
  return {call,data,setTime:t=>time=t,setRandom:n=>random=n,
    progress:(i,clicks=100,session=ID,floor=0)=>call({op:'progress',i,clicks,session,floor}),
    mine:i=>call({op:'mine',i}),draw:()=>call({op:'draw',pw:'test-password'})};
}
test('progress below 100 is saved; only whole tickets enter the draw, capped at five',()=>{
  const s=setup();assert.equal(s.progress(0,99).mine.count,99);assert.equal(s.call({op:'status'}).entries.length,0);
  for(const [count,tickets] of [[100,1],[199,1],[200,2],[500,5],[900,5]])assert.equal(s.progress(0,count).mine.tickets,tickets);
  for(const count of [-1,100.5,Infinity,1000001,'100'])assert.equal(s.progress(1,count,OTHER).ok,false);
  assert.equal(s.progress(11).err,'bad_identity');
  assert.equal(s.progress(0,100,'__proto__').err,'bad_session');
});
test('a fresh browser needs only a name, and its new clicks add to existing progress',()=>{
  const s=setup();s.progress(0,123);
  assert.equal(s.mine(0).mine.count,123);
  assert.equal(s.progress(0,77,OTHER).mine.count,200);
  assert.equal(s.mine(0).mine.tickets,2);
  assert.deepEqual(s.mine(1).mine,{i:1,count:0,tickets:0});
});
test('retries and out-of-order requests do not duplicate; interleaved browsers do not lose clicks',()=>{
  const s=setup();s.progress(0,100);s.progress(0,50,OTHER);
  assert.equal(s.progress(0,100).mine.count,150);
  assert.equal(s.progress(0,20,OTHER).mine.count,150);
  assert.equal(s.progress(0,110).mine.count,160);
  assert.equal(s.progress(0,90,OTHER).mine.count,200);
  assert.equal(s.progress(1,110).err,'session_conflict');
});
test('existing token-based entries are preserved, with legacy local counts imported once as a maximum',()=>{
  const s=setup();const old=JSON.stringify({i:0,tokenHash:'private-old-hash',count:200,tickets:2});
  s.data.set('ghost_raffle_2026_0',old);
  assert.equal(s.mine(0).mine.count,200);
  assert.equal(s.progress(0,10,ID,250).mine.count,260);
  assert.equal(s.progress(0,20,OTHER,250).mine.count,280);
  assert.equal(s.progress(0,10,ID,250).mine.count,280);
  assert.equal(s.data.get('ghost_raffle_2026_0'),old);
});
test('Korean cutoff accepts before, rejects at cutoff and freezes counts',()=>{
  const s=setup();s.progress(0,100);s.setTime(CLOSE-1);assert.equal(s.progress(0,200).ok,true);
  s.setTime(CLOSE);assert.equal(s.progress(0,500).err,'closed');assert.equal(s.progress(1,100,OTHER).err,'closed');
  assert.equal(s.mine(0).mine.count,200);
});
test('draw requires admin, deadline, and at least one eligible entrant',()=>{
  const s=setup();s.progress(0,99);assert.equal(s.call({op:'draw',pw:'wrong'}).err,'badpw');assert.equal(s.draw().err,'not_closed');
  s.setTime(CLOSE);assert.equal(s.draw().err,'no_entries');assert.equal(s.data.has('ghost_raffle_2026_result'),false);
});
test('every ticket interval maps to its owner with exact weights',()=>{
  const expected=[0,1,1,2,2,2,2,2];
  for(let r=0;r<8;r++){const s=setup();s.progress(0,100);s.progress(1,200,OTHER);s.progress(2,500,'c'.repeat(32));s.setTime(CLOSE);s.setRandom(r);assert.equal(s.draw().winner,expected[r]);}
});
test('a repeated draw returns the stored winner and snapshot',()=>{
  const s=setup();s.progress(0);s.progress(1,200,OTHER);s.setTime(CLOSE);s.setRandom(0);const first=s.draw();
  s.setRandom(2);s.setTime(CLOSE+9999);const next=s.draw();assert.equal(next.winner,first.winner);assert.equal(next.drawnAt,first.drawnAt);assert.deepEqual(next.entries,first.entries);
});
test('no API returns the gift image, including old valid token and winner requests',()=>{
  const s=setup();s.progress(0);s.setTime(CLOSE);s.draw();
  const responses=[s.call({op:'status'}),s.mine(0),s.draw(),s.call({op:'view',i:0,token:'a'.repeat(64)})];
  s.data.set('gift',JSON.stringify({by:0,token:'old-secret'}));
  responses.push(s.call({op:'view',token:'old-secret'}));
  for(const obj of responses)assert.equal(/token|Hash|TEST_ONLY|img/.test(JSON.stringify(obj)),false);
  assert.equal(responses.at(-1).err,'in_person');
});
test('obsolete first-come and absolute-count APIs are disabled',()=>{
  const s=setup();assert.equal(s.call({op:'claim',i:0}).err,'raffle_only');
  assert.equal(s.call({op:'enroll',i:0,count:100,token:'a'.repeat(64)}).err,'refresh_required');
  assert.equal(s.call({op:'sync',i:0,count:100}).err,'refresh_required');assert.equal(s.data.size,0);
});
test('an already-issued prize is preserved and cannot be awarded again',()=>{
  const s=setup();s.data.set('gift',JSON.stringify({by:3,token:'legacy-private-token'}));
  assert.equal(s.call({op:'status'}).phase,'legacy-awarded');assert.equal(s.progress(0).err,'already_awarded');
  s.setTime(CLOSE);assert.equal(s.draw().err,'already_awarded');
  assert.equal(s.call({op:'view',token:'legacy-private-token'}).err,'in_person');
});
test('empty visits do not allocate stored sessions; current-session receipt is available for retries',()=>{
  const s=setup();s.progress(0,0);assert.equal(s.data.size,0);
  s.progress(0,33);assert.deepEqual(s.call({op:'mine',i:0,session:ID}).session,{id:ID,clicks:33});
  assert.equal(s.call({op:'mine',i:0,session:OTHER}).session.clicks,0);
});
