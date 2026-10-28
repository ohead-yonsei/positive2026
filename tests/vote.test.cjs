const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const DEADLINE=Date.parse('2026-10-31T21:00:00+09:00');
function setup(){
  let time=DEADLINE-1000;const data=new Map();
  const ctx=vm.createContext({isAdmin:q=>q.pw==='test-only-password',Date:class extends Date{static now(){return time}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>data.get(k)||null,setProperty:(k,v)=>data.set(k,v)})}});
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
    const r=s.submit(i,[i,i,i]);assert.deepEqual(Object.keys(r).sort(),['accepted','ok','phase','revealAt','serverNow','submitted','total','version'].sort());
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
