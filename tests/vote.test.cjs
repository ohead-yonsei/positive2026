const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const DEADLINE=Date.parse('2026-10-31T21:00:00+09:00');
function setup(){
  let time=DEADLINE-1000;const data=new Map();
  const ctx=vm.createContext({Utilities:{getUuid:()=> 'test-revote-id'},isAdmin:q=>q.pw==='test-only-password',Date:class extends Date{static now(){return time}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>data.get(k)||null,setProperty:(k,v)=>data.set(k,v)})}});
  vm.runInContext(fs.readFileSync('server/Vote.gs','utf8')+'\n'+fs.readFileSync('server/Raffle.gs','utf8'),ctx);
  const call=q=>JSON.parse(JSON.stringify(ctx.raffleAction(q)));
  return{data,call,status:()=>call({op:'voteStatus'}),submit:(i,choices=[0,1,2])=>call({op:'voteSubmit',i,choices}),setTime:t=>time=t};
}
test('one ballot per person across browsers; retries never change it',()=>{
  const s=setup();assert.equal(s.submit(0).accepted,true);
  for(const choices of [[0,1,2],[10,10,10],undefined])assert.equal(s.submit(0,choices).alreadyVoted,true);
  assert.equal(s.status().total,1);s.setTime(DEADLINE);
  assert.deepEqual(s.status().results.map(row=>row.indexOf(1)),[0,1,2]);
});
test('before release neither status nor submission response leaks choices or counts',()=>{
  const s=setup();
  for(let i=0;i<11;i++){
    const r=s.submit(i,[i,i,i]);assert.deepEqual(Object.keys(r).sort(),['accepted','ok','phase','revealAt','revote','serverNow','submitted','total','version'].sort());
  }
  const r=s.status();assert.equal(r.phase,'open');assert.equal(r.total,11);assert.equal('results' in r,false);
  assert.equal(s.call({op:'voteResults',pw:'anything',revealAt:0}).ok,false);
});
test('exact KST boundary closes submissions and reveals results; client time cannot override',()=>{
  const s=setup();s.setTime(DEADLINE-1);assert.equal(s.submit(0).ok,true);
  s.setTime(DEADLINE);assert.equal(s.submit(1).err,'vote_closed');
  const r=s.status();assert.equal(r.phase,'revealed');assert.equal(r.results.length,3);
  s.setTime(DEADLINE-1);assert.equal(s.call({op:'voteStatus',now:DEADLINE+1,phase:'revealed'}).results,undefined);
});
test('rejects invalid voters and ballots without partial writes',()=>{
  const s=setup();
  for(const i of [-1,11,1.2,'0',null,'__proto__'])assert.equal(s.submit(i).err,'bad_identity');
  for(const choices of [[],[1],[1,2],[1,2,3,4],[-1,1,2],[11,1,2],['1',1,2],[null,1,2],{},'012'])assert.equal(s.submit(0,choices).err,'bad_choices');
  assert.equal(s.data.size,0);
});
test('all 11 ballots aggregate correctly, including ties and the same nominee across categories',()=>{
  const s=setup();for(let i=0;i<11;i++)s.submit(i,[i,i%2,10]);s.setTime(DEADLINE);
  const r=s.status();assert.deepEqual(r.results[0],Array(11).fill(1));
  assert.deepEqual(r.results[1],[6,5,...Array(9).fill(0)]);assert.equal(r.results[2][10],11);
  for(const row of r.results)assert.equal(row.reduce((a,b)=>a+b,0),11);
  assert.equal('ballots' in r,false);assert.equal('choices' in r,false);
});
test('empty results have no false winner; unrelated production properties remain intact',()=>{
  const s=setup();s.data.set('board','KEEP');s.data.set('gift','KEEP');s.setTime(DEADLINE);
  assert.deepEqual(s.status().results,Array.from({length:3},()=>Array(11).fill(0)));
  assert.equal(s.data.get('board'),'KEEP');assert.equal(s.data.get('gift'),'KEEP');
});

test('early reveal requires admin, closes voting, and cannot be undone by the clock',()=>{
 const s=setup();s.submit(0);assert.equal(s.call({op:'voteReveal',pw:'wrong'}).err,'badpw');assert.equal(s.status().phase,'open');
 const opened=s.call({op:'voteReveal',pw:'test-only-password'});assert.equal(opened.phase,'revealed');assert.equal(opened.results[0][0],1);
 assert.equal(s.submit(1).err,'vote_closed');const saved=s.data.get('positive_awards_2026_opened_at');
 s.setTime(DEADLINE-5000);assert.equal(s.call({op:'voteReveal',pw:'test-only-password'}).phase,'revealed');assert.equal(s.data.get('positive_awards_2026_opened_at'),saved);
 assert.equal(s.submit(0).alreadyVoted,true);
});

function openRevote(s,prompt='다음 모임을 가장 기대하는 사람은?'){
 s.call({op:'voteReveal',pw:'test-only-password'});
 return s.call({op:'voteReveal',revoteAction:'open',pw:'test-only-password',revision:0,prompt});
}
test('third revote preserves original ballots/results and never leaks new choices before manual reveal',()=>{
 const s=setup();for(let i=0;i<11;i++)s.submit(i,[i,i%2,0]);
 const original=s.data.get('positive_awards_2026_ballots'),first=s.status();
 const opened=openRevote(s);assert.equal(opened.revote.phase,'open');assert.equal(opened.revote.total,0);
 for(let i=0;i<11;i++){
  const r=s.call({op:'voteSubmit',revoteId:opened.revote.id,i,choice:i%2});assert.equal(r.accepted,true);
  assert.equal('counts' in r.revote,false);assert.equal('ballots' in r.revote,false);
  assert.equal(s.call({op:'voteSubmit',revoteId:opened.revote.id,i,choice:10}).alreadyVoted,true);
 }
 s.setTime(DEADLINE+86400000);assert.equal(s.status().revote.phase,'open');
 const result=s.call({op:'voteReveal',revoteAction:'reveal',pw:'test-only-password',revision:1,revoteId:opened.revote.id});
 assert.deepEqual(result.revote.counts,[6,5,...Array(9).fill(0)]);assert.equal(result.revote.phase,'revealed');
 assert.equal(s.data.get('positive_awards_2026_ballots'),original);assert.equal(result.results[2][0],11);
 assert.deepEqual(result.results[0],Array(11).fill(1));assert.deepEqual(result.results[1],[6,5,...Array(9).fill(0)]);
 assert.equal(s.call({op:'voteSubmit',revoteId:opened.revote.id,i:0,choice:5}).alreadyVoted,true);
});
test('revote needs admin, a valid prompt, a fresh revision, and the correct run',()=>{
 const s=setup(),open={op:'voteReveal',revoteAction:'open',pw:'test-only-password',revision:0,prompt:'새 투표 질문입니다'};
 assert.equal(s.call({...open,pw:'wrong'}).err,'badpw');assert.equal(s.call(open).err,'revote_phase');
 s.setTime(DEADLINE);
 for(const prompt of ['',null,'짧음','가'.repeat(181)])assert.equal(s.call({...open,prompt}).err,'bad_prompt');
 assert.equal(s.call({...open,revision:1}).err,'revote_stale');assert.equal(s.call(open).ok,true);
 assert.equal(s.call(open).err,'revote_stale');assert.equal(s.call({...open,revision:1}).err,'revote_phase');
 const close={op:'voteReveal',revoteAction:'reveal',pw:'test-only-password',revision:1,revoteId:'test-revote-id'};
 assert.equal(s.call({...close,pw:'wrong'}).err,'badpw');assert.equal(s.call(close).err,'no_votes');
 for(const i of [-1,11,'0',null])assert.equal(s.call({op:'voteSubmit',revoteId:'test-revote-id',i,choice:1}).err,'bad_identity');
 assert.equal(s.call({op:'voteSubmit',revoteId:'old',i:0,choice:1}).err,'revote_stale');
 for(const choice of [-1,11,'0',null,[],{}])assert.equal(s.call({op:'voteSubmit',revoteId:'test-revote-id',i:0,choice}).err,'bad_choices');
 s.call({op:'voteSubmit',revoteId:'test-revote-id',i:0,choice:1});assert.equal(s.call(close).ok,true);
 assert.equal(s.call({op:'voteSubmit',revoteId:'test-revote-id',i:1,choice:1}).err,'vote_closed');
 assert.equal(s.call({...open,revision:2}).err,'revote_phase');
});
