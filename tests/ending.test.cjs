const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
test('ending is standalone and does not load participation scripts, credentials, forms, or polling',()=>{
 assert.doesNotMatch(html,/<script[^>]+src=|<form\b|type="password"|script\.google\.com|GJ_API|\bfetch\s*\(|XMLHttpRequest|\bsetInterval\s*\(/);
 for(const id of ['account','vote','revote','quiz','third','manito','raffle','event-admin','todo'])assert.ok(!html.includes('id="'+id+'"'),id);
 assert.match(html,/겹친 재료도 없었다/);
});
test('ending references complete local photo files and leaves a readable no-script goodbye',()=>{
 for(const name of ['front','back','cake','ingredients']){
  const file='ending-'+name+'.webp';assert.ok(html.includes(file));assert.ok(fs.statSync(file).size>10000);assert.ok(fs.statSync(file).size<800000);
 }
 assert.match(html,/<noscript>[\s\S]*좋은 밤이었어/);
 assert.match(html,/prefers-reduced-motion/);
 assert.match(html,/<dialog[^>]*aria-labelledby="photo-title"/);
});
