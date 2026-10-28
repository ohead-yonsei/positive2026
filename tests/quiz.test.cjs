const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const data=new Map();let time=1000,uuid=0;
 const p={getProperty:k=>data.get(k)||null,getProperties:()=>Object.fromEntries(data),setProperty:(k,v)=>{assert.ok(Buffer.byteLength(v)<9000,'property fits Apps Script limit');data.set(k,v)},deleteProperty:k=>data.delete(k)};
 const ctx=vm.createContext({Date:class extends Date{static now(){return time++}},Utilities:{getUuid:()=>String(++uuid).padStart(8,'0')+'-1234-1234-1234-123456789abc'},PropertiesService:{getScriptProperties:()=>p},isAdmin:q=>q.pw==='test-only-password'});
 vm.runInContext(fs.readFileSync('server/Quiz.gs','utf8')+'\n'+fs.readFileSync('server/Raffle.gs','utf8'),ctx);
 const call=q=>JSON.parse(JSON.stringify(ctx.raffleAction(q))),status=i=>call({op:'quizStatus',i});
 const admin=(op,extra={})=>call({op,pw:'test-only-password',revision:status().revision,...extra});
 const join=i=>call({op:'quizJoin',runId:status().runId,i});
 const answer=(i,a,extra={})=>call({op:'quizAnswer',runId:status().runId,round:status().round,i,answer:a,...extra});
 return{data,call,status,admin,join,answer,start:()=>{admin('quizOpen');join(0);admin('quizQuestion')}};
}
test('closed by default, and public responses never include the draft or future answers',()=>{
 const s=setup(),r=s.status();assert.equal(r.phase,'closed');assert.equal('question' in r,false);assert.equal('draft' in r,false);assert.equal(s.data.size,0);
 s.admin('quizOpen');assert.equal('question' in s.status(),false);s.join(0);s.admin('quizQuestion');
 const j=s.status(0);assert.equal(j.question.type,'ox');assert.equal('answer' in j.question,false);assert.equal('explanation' in j.question,false);assert.equal('ranking' in j,false);assert.equal('draft' in j,false);
});
test('all admin reads/writes require the existing admin password',()=>{
 const s=setup();for(const op of ['quizAdmin','quizSave','quizOpen','quizQuestion','quizReveal','quizNext','quizFinish','quizPrepare'])assert.equal(s.call({op,pw:'wrong',revision:0}).err,'badpw');assert.equal(s.data.size,0);
});
test('host state transitions require valid phases and participants',()=>{
 const s=setup();assert.equal(s.admin('quizQuestion').err,'quiz_phase');s.admin('quizOpen');assert.equal(s.admin('quizQuestion').err,'no_players');s.join(0);s.admin('quizQuestion');
 assert.equal(s.admin('quizNext').err,'quiz_phase');assert.equal(s.admin('quizFinish').err,'quiz_phase');s.admin('quizReveal');assert.equal(s.admin('quizReveal').err,'quiz_phase');s.admin('quizNext');assert.equal(s.status().round,1);
});
test('repeated or stale admin commands cannot skip questions',()=>{
 const s=setup();s.start();const revision=s.status().revision;s.admin('quizReveal',{revision});assert.equal(s.admin('quizReveal',{revision}).err,'quiz_stale');
 const next=s.status().revision;s.admin('quizNext',{revision:next});assert.equal(s.admin('quizNext',{revision:next}).err,'quiz_stale');assert.equal(s.status().round,1);
});
test('a name joins once and resumes submitted answers in a fresh browser',()=>{
 const s=setup();s.start();s.join(0);assert.deepEqual(s.status().joined,[0]);s.answer(0,[0]);const j=s.status(0);assert.equal(j.mine.answered,true);assert.deepEqual(j.mine.answer,[0]);assert.equal('correct' in j.mine,false);
 assert.equal(s.answer(0,[1]).alreadyAnswered,true);assert.deepEqual(s.status(0).mine.answer,[0]);
});
test('outsiders, stale games, stale rounds and malformed answers are rejected',()=>{
 const s=setup();s.start();assert.equal(s.answer(1,[0]).err,'not_joined');assert.equal(s.answer(0,[0],{runId:'old'}).err,'quiz_stale');assert.equal(s.answer(0,[0],{round:1}).err,'quiz_stale');
 for(const i of [-1,11,'0',null])assert.equal(s.answer(i,[0]).err,'bad_identity');
 for(const a of [[],[0,1],[2],['0'],[null],0])assert.equal(s.answer(0,a).err,'bad_answer');
 assert.equal(s.status().answeredCount,0);
});
test('answer reveal closes submissions and only reveals the current answer',()=>{
 const s=setup();s.start();s.join(1);s.answer(0,[0]);s.admin('quizReveal');const j=s.status(0);assert.equal(j.mine.correct,true);assert.deepEqual(j.question.answer,[0]);assert.ok(j.question.explanation);assert.equal('ranking' in j,false);
 assert.equal(s.answer(1,[0]).err,'answer_closed');assert.equal(s.answer(0,[1]).alreadyAnswered,true);
 s.admin('quizNext');assert.equal('answer' in s.status(0).question,false);assert.equal('correct' in s.status(0).mine,false);
});
test('each of the 11 phones can answer once and counts are exact',()=>{
 const s=setup();s.start();for(let i=1;i<11;i++)s.join(i);for(let i=0;i<11;i++){s.answer(i,[i%2]);s.answer(i,[(i+1)%2]);}
 assert.equal(s.status().answeredCount,11);s.admin('quizReveal');s.admin('quizFinish');const rank=s.status().ranking;
 assert.equal(rank.length,11);assert.equal(rank.filter(r=>r.score===10).length,6);assert.equal(rank.filter(r=>r.rank===1).length,6);assert.equal(rank.filter(r=>r.rank===7).length,5);
});
test('mixed quiz types score on server with shared ranks and unanswered rounds worth zero',()=>{
 const s=setup();s.start();s.join(1);s.join(2);s.answer(0,[0],{score:999});s.answer(1,[0]);s.admin('quizReveal');s.admin('quizNext');
 s.answer(0,[0]);s.answer(1,[0]);s.answer(2,[1]);s.admin('quizReveal');s.admin('quizNext');
 const j=s.status();assert.equal(j.question.type,'order');assert.deepEqual(j.question.options.map(o=>o.id),[0,1,2,3]);assert.equal('answer' in j.question,false);
 const correct=['도착 & 단체사진','BBQ 파티','다이소 발표회','랜덤 떡볶이'].map(text=>j.question.options.find(o=>o.text===text).id);
 assert.notDeepEqual(correct,[0,1,2,3],'public option IDs must not encode the correct order');
 for(const a of [[0,0,1,2],[0,1,2],[0,1,2,4],['0',1,2,3]])assert.equal(s.answer(0,a).err,'bad_answer');
 s.answer(0,correct);s.answer(1,correct);s.answer(2,[...correct].reverse());assert.deepEqual(s.status(0).mine.answer,correct);s.admin('quizReveal');assert.equal(s.status(0).mine.correct,true);assert.deepEqual(s.status().question.answer,correct);s.admin('quizFinish');
 const result=s.status();assert.equal(result.playedQuestions,3);assert.deepEqual(result.ranking.map(r=>[r.i,r.score,r.rank]),[[0,30,1],[1,30,1],[2,0,3]]);assert.equal(s.answer(2,[0,1,2,3]).alreadyAnswered,true);
});
test('saving validates all types and creates an immutable run snapshot',()=>{
 const s=setup(),draft=s.admin('quizAdmin').draft;draft[0].prompt='Custom private question';draft[0].explanation='Private explanation';
 assert.equal(s.admin('quizSave',{questions:draft}).ok,true);s.start();assert.equal(s.status().question.prompt,'Custom private question');assert.equal(s.admin('quizSave',{questions:draft}).err,'quiz_running');
 s.answer(0,[0]);s.admin('quizReveal');s.admin('quizFinish');draft[0].answer=[1];s.admin('quizSave',{questions:draft});assert.equal(s.status().ranking[0].score,10);
});
test('invalid question banks never partially replace a saved draft',()=>{
 const s=setup(),draft=s.admin('quizAdmin').draft;
 for(const bank of [[],Array(21).fill(draft[0]),[{...draft[0],answer:[2]}],[{...draft[1],options:['a','a','b','c']}],[{...draft[2],answer:[0,0,1,2]}],[{...draft[0],prompt:''}],[{...draft[0],prompt:'x'.repeat(201)}]])assert.equal(s.admin('quizSave',{questions:bank}).err,'bad_questions');
 assert.equal(s.data.size,0);
});
test('20 large Korean questions fit individual property limits and old drafts are cleaned',()=>{
 const s=setup(),q={type:'order',prompt:'가'.repeat(200),options:Array.from({length:6},(_,i)=>i+'가'.repeat(99)),answer:[0,1,2,3,4,5],explanation:'나'.repeat(500)};
 assert.equal(s.admin('quizSave',{questions:Array(20).fill(q)}).ok,true);const keys=[...s.data.keys()];assert.equal(keys.length,21);
 assert.equal(s.admin('quizSave',{questions:[q]}).ok,true);assert.equal(s.data.size,2);
});
test('new games retain archived scores and reject requests from the old run',()=>{
 const s=setup();s.start();const old=s.status().runId;s.answer(0,[0]);s.admin('quizReveal');s.admin('quizFinish');s.admin('quizPrepare');
 assert.equal(s.status().phase,'closed');assert.deepEqual(s.status().joined,[]);assert.ok(s.data.has('positive_quiz_2026_archive_'+old));
 s.admin('quizOpen');assert.notEqual(s.status().runId,old);assert.equal(s.answer(0,[0],{runId:old}).err,'quiz_stale');
});
test('unknown operations are rejected and unrelated data is never changed',()=>{
 const s=setup();s.data.set('board','KEEP');s.data.set('positive_awards_2026_ballots','KEEP');assert.equal(s.call({op:'quizDeleteAll',pw:'test-only-password'}).err,'bad_op');s.start();s.answer(0,[0]);assert.equal(s.data.get('board'),'KEEP');assert.equal(s.data.get('positive_awards_2026_ballots'),'KEEP');
});
