const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const source=fs.readFileSync('server/Raffle.gs','utf8');
const CLOSE=Date.parse('2026-10-31T00:00:00+09:00');
const TOKEN='a'.repeat(64), OTHER='b'.repeat(64);
function setup(){
  let time=CLOSE-1000,random=0;
  const data=new Map();
  const context=vm.createContext({
    Date:class extends Date{static now(){return time}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>data.get(k)||null,setProperty:(k,v)=>data.set(k,v)})},
    Utilities:{getUuid:()=>random.toString(16).padStart(8,'0')+'-0000-4000-8000-000000000000',DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(a,s)=>Array.from(crypto.createHash('sha256').update(s).digest())},
    GIFT_IMG:'data:image/png;base64,TEST_ONLY',isAdmin:q=>q.pw==='test-password'
  });
  vm.runInContext(source,context);
  const call=q=>JSON.parse(JSON.stringify(context.raffleAction(q)));
  return {call,data,setTime:t=>time=t,setRandom:n=>random=n,enroll:(i,count=100,token=TOKEN)=>call({op:'enroll',i,count,token}),draw:()=>call({op:'draw',pw:'test-password'})};
}
test('100-click threshold, whole tickets, cap at five, and validation',()=>{
  const s=setup();assert.equal(s.enroll(0,99).err,'bad_count');
  for(const [count,tickets] of [[100,1],[199,1],[200,2],[500,5],[900,5]])assert.equal(s.enroll(0,count).mine.tickets,tickets);
  for(const count of [-1,100.5,Infinity,1000001,'100'])assert.equal(s.enroll(1,count).ok,false);
  assert.equal(s.enroll(11).err,'bad_identity');
});
test('first sync includes old local count; retries and out-of-order requests cannot duplicate or reduce tickets',()=>{
  const s=setup();assert.equal(s.enroll(0,350).mine.tickets,3);
  assert.equal(s.enroll(0,350).totalTickets,3);
  assert.equal(s.call({op:'sync',i:0,token:TOKEN,count:100}).mine.count,350);
  assert.equal(s.enroll(0,500,OTHER).err,'entry_taken');
  assert.equal(s.call({op:'sync',i:1,token:OTHER,count:100}).err,'not_enrolled');
});
test('Korean deadline: before cutoff accepts, at cutoff rejects and freezes counts',()=>{
  const s=setup();s.enroll(0,100);s.setTime(CLOSE-1);assert.equal(s.enroll(0,200).ok,true);
  s.setTime(CLOSE);assert.equal(s.enroll(0,500).err,'closed');assert.equal(s.enroll(1).err,'closed');
  assert.equal(s.call({op:'status'}).entries[0].tickets,2);
});
test('draw requires admin, deadline, and at least one entrant',()=>{
  const s=setup();assert.equal(s.call({op:'draw',pw:'wrong'}).err,'badpw');assert.equal(s.draw().err,'not_closed');
  s.setTime(CLOSE);assert.equal(s.draw().err,'no_entries');assert.equal(s.data.has('ghost_raffle_2026_result'),false);
});
test('every ticket interval maps to its owner with exact weights',()=>{
  const expected=[0,1,1,2,2,2,2,2];
  for(let r=0;r<8;r++){const s=setup();s.enroll(0,100);s.enroll(1,200,OTHER);s.enroll(2,500,'c'.repeat(64));s.setTime(CLOSE);s.setRandom(r);assert.equal(s.draw().winner,expected[r]);}
});
test('a repeated draw returns the stored winner and snapshot',()=>{
  const s=setup();s.enroll(0);s.enroll(1,200,OTHER);s.setTime(CLOSE);s.setRandom(0);const first=s.draw();
  s.setRandom(2);s.setTime(CLOSE+9999);const next=s.draw();assert.equal(next.winner,first.winner);assert.equal(next.drawnAt,first.drawnAt);assert.deepEqual(next.entries,first.entries);
});
test('public status and draw do not expose tokens, hashes or gift image',()=>{
  const s=setup();s.enroll(0);s.setTime(CLOSE);
  for(const obj of [s.call({op:'status'}),s.draw(),s.call({op:'status'})]){
    const json=JSON.stringify(obj);assert.equal(/token|Hash|TEST_ONLY|img/.test(json),false);
  }
});
test('gift view requires winner token; nobody receives image before draw',()=>{
  const s=setup();s.enroll(0);s.enroll(1,100,OTHER);
  assert.equal(s.call({op:'view',i:0,token:TOKEN}).err,'not_drawn');
  s.setTime(CLOSE);s.draw();
  assert.equal(s.call({op:'view',i:0,token:OTHER}).err,'denied');
  assert.equal(s.call({op:'view',i:1,token:OTHER}).err,'not_winner');
  assert.equal(s.call({op:'view',i:0,token:TOKEN}).img,'data:image/png;base64,TEST_ONLY');
  assert.equal(s.call({op:'view',i:0,token:TOKEN}).ok,true);
});
test('old first-come claim endpoint is disabled',()=>{
  const s=setup();assert.equal(s.call({op:'claim',i:0}).err,'raffle_only');assert.equal(s.data.size,0);
});
test('an already-issued legacy prize is preserved and cannot be awarded again',()=>{
  const s=setup();s.data.set('gift',JSON.stringify({by:3,token:'legacy-private-token'}));
  assert.equal(s.call({op:'status'}).phase,'legacy-awarded');assert.equal(s.enroll(0).err,'already_awarded');
  s.setTime(CLOSE);assert.equal(s.draw().err,'already_awarded');
  assert.equal(s.call({op:'view',token:'wrong'}).ok,false);assert.equal(s.call({op:'view',token:'legacy-private-token'}).ok,true);
});
test('mine verifies the saved identity without exposing its token hash',()=>{
  const s=setup();s.enroll(0,222);
  assert.equal(s.call({op:'mine',i:0,token:OTHER}).err,'denied');
  const mine=s.call({op:'mine',i:0,token:TOKEN});assert.equal(mine.mine.tickets,2);assert.equal(JSON.stringify(mine).includes('tokenHash'),false);
});
