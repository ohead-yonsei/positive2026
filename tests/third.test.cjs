const test=require('node:test'),assert=require('node:assert/strict'),setup=require('./third-helper.cjs');
test('questions collect by default; public status hides other entries, authors and upcoming questions',()=>{
 const s=setup();assert.equal(s.status().phase,'collecting');assert.equal(s.data.size,0);s.save(1,'은근히 섬에서 잘 살 사람은?');s.save(2,'정말로 늦게 올 사람은?');
 const raw=JSON.stringify(s.status());assert.ok(!raw.includes('은근히'));assert.ok(!raw.includes('author'));assert.equal(s.status(0).mine.entry.prompt,'');assert.equal(s.status(1).mine.entry.prompt,'은근히 섬에서 잘 살 사람은?');
 s.admin('thirdStart');const j=s.status();assert.ok(j.question.prompt);assert.equal('author' in j.question,false);assert.equal('entries' in j,false);assert.equal('ranking' in j,false);assert.equal(j.history.length,0);
});
test('one question per name edits across browsers, rejects stale overwrites and handles lost responses',()=>{
 const s=setup();s.save(0,'첫 번째 질문입니다');const old=s.status(0).mine.entry.revision;
 s.save(0,'수정된 질문입니다');assert.equal(s.save(0,'오래된 수정 내용',{entryRevision:old}).err,'entry_stale');
 assert.equal(s.save(0,'수정된 질문입니다',{entryRevision:old}).ok,true);assert.equal(s.status().submittedCount,1);assert.equal(s.status(0).mine.entry.prompt,'수정된 질문입니다');
});
test('invalid identities and malformed questions are rejected without writes',()=>{
 const s=setup();for(const i of [-1,11,null,'0',1.2])assert.equal(s.call({op:'thirdSave',i,prompt:'충분히 긴 질문',entryRevision:0}).err,'bad_identity');
 for(const prompt of ['', '1234','가'.repeat(181),null,{}])assert.equal(s.save(0,prompt).err,'bad_prompt');assert.equal(s.data.size,0);
});
test('all administrative operations require the existing password and current revision',()=>{
 const s=setup();for(const op of ['thirdAdmin','thirdReview','thirdStart','thirdClose','thirdAuthor','thirdNext','thirdFinish','thirdPrepare'])assert.equal(s.call({op,pw:'wrong',revision:0}).err,'badpw');
 s.save(0);assert.equal(s.admin('thirdStart',{revision:0}).err,'third_stale');assert.equal(s.call({op:'thirdDeleteEverything',pw:'test-only-password'}).err,'bad_op');
});
test('host reviews anonymously, excludes questions, snapshots them and starts once in shuffled order',()=>{
 const s=setup();for(let i=0;i<11;i++)s.save(i);let a=s.admin('thirdAdmin');assert.ok(a.entries.every(e=>!('author' in e)));s.admin('thirdReview',{id:a.entries[0].id,enabled:false});
 const before=s.status().revision;const j=s.admin('thirdStart',{revision:before});assert.equal(j.totalQuestions,10);assert.equal(s.admin('thirdStart',{revision:before}).err,'third_stale');
 const m=JSON.parse(s.data.get('positive_third_2026_meta'));const qs=m.questions.map(k=>JSON.parse(s.data.get('positive_third_2026_'+k)));assert.equal(qs.length,10);assert.equal(new Set(qs.map(q=>q.author)).size,10);assert.ok(qs.every(q=>q.author!==0));assert.notDeepEqual(qs.map(q=>q.author),[1,2,3,4,5,6,7,8,9,10]);
 assert.equal(s.save(1,'게임 중에는 수정 안 돼').err,'third_locked');assert.equal(s.admin('thirdReview',{id:a.entries[1].id,enabled:false}).err,'third_locked');
});
test('empty start and out-of-order host actions are rejected',()=>{
 const s=setup();assert.equal(s.admin('thirdStart').err,'no_questions');for(const op of ['thirdClose','thirdAuthor','thirdNext','thirdFinish','thirdPrepare'])assert.equal(s.admin(op).err,'third_phase');s.start();assert.equal(s.admin('thirdClose').err,'no_votes');assert.equal(s.admin('thirdNext').err,'third_phase');
});
test('author cannot vote, others pick exactly three different names, and retries are idempotent',()=>{
 const s=setup();s.start(2);assert.equal(s.vote(2,[0,1,2]).err,'author_vote');
 for(const c of [[],[0,1],[0,0,1],[0,1,11],[null,1,2],['0',1,2]])assert.equal(s.vote(0,c).err,'bad_choices');
 assert.equal(s.vote(0,[0,1,2]).ok,true);assert.equal(s.vote(0,[3,4,5]).alreadyVoted,true);assert.deepEqual(s.status(0).mine.choices,[0,1,2]);assert.equal(s.status().votedCount,1);
 assert.equal(s.vote(1,[0,1,2],{runId:'old'}).err,'third_stale');assert.equal(s.vote(1,[0,1,2],{round:9}).err,'third_stale');assert.equal(s.vote(1,[0,1,2],{stage:'tie'}).err,'vote_closed');
});
test('3/2/1 scoring is server-side, rankings precede author reveal, and a third-place author succeeds',()=>{
 const s=setup();s.start(2);for(let i=0;i<11;i++)if(i!==2)s.vote(i,[0,1,2],{score:999});
 assert.equal(s.status().votedCount,10);assert.equal('ranking' in s.status(),false);s.admin('thirdClose');const r=s.status();assert.equal(r.phase,'ranking');assert.deepEqual(r.ranking.map(r=>[r.i,r.score,r.rank]),[[0,30,1],[1,20,2],[2,10,3]]);assert.equal('reveal' in r,false);assert.equal(r.history.length,0);
 assert.equal(s.vote(0,[2,1,0]).alreadyVoted,true);s.admin('thirdAuthor');assert.equal(s.status().reveal.author,2);assert.equal(s.status().reveal.success,true);s.admin('thirdFinish');assert.equal(s.status().phase,'finished');assert.equal(s.status().history[0].success,true);
});
test('main ballots close after ranking; zero-score author does not become a winner',()=>{
 const s=setup();s.start(10);s.vote(0,[0,1,2]);s.admin('thirdClose');assert.equal(s.vote(1,[0,1,2]).err,'vote_closed');s.admin('thirdAuthor');assert.equal(s.status().reveal.rank,null);assert.equal(s.status().reveal.success,false);
});
test('third-place ties trigger a separate runoff limited to tied candidates',()=>{
 const s=setup();s.start(2);s.vote(0,[0,1,2]);s.vote(1,[0,2,1]);s.admin('thirdClose');assert.equal(s.status().phase,'tiebreak');assert.deepEqual(s.status().candidates,[1,2]);assert.equal(s.status().votedCount,0);assert.equal(s.status(0).mine.voted,false);assert.equal('ranking' in s.status(),false);
 assert.equal(s.vote(0,[0,1]).err,'bad_choices');assert.equal(s.vote(2,[1,2]).err,'author_vote');s.vote(0,[1,2]);s.admin('thirdClose');assert.deepEqual(s.status().ranking.map(r=>[r.i,r.rank]),[[0,1],[1,2],[2,3]]);s.admin('thirdAuthor');assert.equal(s.status().reveal.success,true);
});
test('unresolved runoff tie across the third seat becomes shared third',()=>{
 const s=setup();s.start(2);s.vote(0,[0,1,2]);s.vote(1,[0,2,1]);s.admin('thirdClose');s.vote(0,[1,2]);s.vote(1,[2,1]);s.admin('thirdClose');assert.deepEqual(s.status().ranking.filter(r=>r.rank===3).map(r=>r.i),[1,2]);s.admin('thirdAuthor');assert.equal(s.status().reveal.success,true);
});
test('ties above third do not need a runoff when third is unambiguous',()=>{
 const s=setup();s.start(2);s.vote(0,[0,1,2]);s.vote(1,[1,0,2]);s.admin('thirdClose');assert.equal(s.status().phase,'ranking');assert.deepEqual(s.status().ranking.map(r=>r.rank),[1,1,3]);
});
test('full 11-question game fits property limits, never repeats questions, and preserves archives',()=>{
 const s=setup();for(let i=0;i<11;i++)s.save(i,'가'.repeat(178)+String(i).padStart(2,'0'));s.admin('thirdStart');const run=s.status().runId,seen=[];
 for(let k=0;k<11;k++){
   const j=s.status(),author=Number(j.question.prompt.slice(-2));seen.push(author);for(let i=0;i<11;i++)if(i!==author)s.vote(i,[0,1,2]);s.admin('thirdClose');s.admin('thirdAuthor');if(k<10)s.admin('thirdNext');else s.admin('thirdFinish');
 }
 assert.equal(new Set(seen).size,11);assert.equal(s.status().history.length,11);assert.equal(s.status().history.filter(r=>r.success).length,1);s.admin('thirdPrepare');assert.equal(s.status().phase,'collecting');assert.equal(s.status().submittedCount,11);assert.ok(s.data.has('positive_third_2026_archive_'+run));assert.equal(s.vote(0,[0,1,2],{runId:run,round:0}).err,'third_stale');
});
test('other site data stays untouched and public metadata never exposes private question storage keys',()=>{
 const s=setup();for(const key of ['board','gift','positive_quiz_2026_meta','positive_awards_2026_ballots'])s.data.set(key,'KEEP');s.start();s.vote(0,[0,1,2]);s.admin('thirdClose');s.admin('thirdAuthor');s.admin('thirdFinish');
 for(const key of ['board','gift','positive_quiz_2026_meta','positive_awards_2026_ballots'])assert.equal(s.data.get(key),'KEEP');assert.ok(!JSON.stringify(s.status()).includes('run_'));
});
