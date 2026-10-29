const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const names=['구세라','권경지','권순록','김강일','류원선','박재훈','서정윤','유세종','이대호','이수한','천수진'];
function client(random=crypto.webcrypto){
  const elements={};
  class Element{
    constructor(tag='div'){this.tag=tag;this.value='';this.textContent='';this.children=[];this.events={};this.hidden=false;this.checked=false;this.disabled=false}
    set id(v){this._id=v;elements[v]=this}get id(){return this._id}
    append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}
    addEventListener(type,fn){this.events[type]=fn}fire(type){this.events[type]?.({preventDefault(){}})}
  }
  for(const [,id]of fs.readFileSync('index.html','utf8').matchAll(/id="(picker[^"]*)"/g))elements[id]=new Element();
  const document={getElementById:id=>elements[id],createElement:tag=>new Element(tag)};
  // No login, fetch, storage or server globals: drawing must work independently.
  vm.runInNewContext(fs.readFileSync('picker.js','utf8'),{document,crypto:random,Uint32Array,Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value}}});
  const e=id=>elements['picker-'+id];
  return{e,mode(value){e('mode-'+value).checked=true;e('mode-'+value).fire('change')},
    count(n){e('count').value=String(n);e('count').fire('change')},
    select(ids){e('none').fire('click');for(const id of ids){e('person-'+id).checked=true;e('person-'+id).fire('change')}},
    draw(){e('form').fire('submit')},
    picked(){return e('result-list').children[0].children.map(x=>x.textContent)},
    teams(){return e('result-list').children[0].children.map(card=>card.children[1].children.map(x=>x.textContent))}};
}
test('every allowed draw size contains distinct selected people and runs without login or server',()=>{
  const c=client();
  for(let n=1;n<=11;n++){
    const ids=Array.from({length:n},(_,i)=>10-i);c.select(ids);
    for(let count=1;count<=n;count++){
      c.count(count);c.draw();const picked=c.picked();
      assert.equal(picked.length,count);assert.equal(new Set(picked).size,count);
      assert.ok(picked.every(name=>ids.some(i=>names[i]===name)));
    }
  }
});
test('all team sizes allocate everyone exactly once with at most one person difference',()=>{
  const c=client();c.mode('teams');
  for(let n=1;n<=11;n++){
    const ids=Array.from({length:n},(_,i)=>10-i);c.select(ids);
    for(let count=1;count<=n;count++){
      c.count(count);c.draw();const teams=c.teams(),people=teams.flat(),sizes=teams.map(t=>t.length);
      assert.equal(teams.length,count);assert.ok(sizes.every(n=>n>0));
      assert.ok(Math.max(...sizes)-Math.min(...sizes)<=1);
      assert.deepEqual(people.slice().sort(),ids.map(i=>names[i]).sort());
    }
  }
});
test('empty selection disables drawing, selection changes clear stale results, and counts are bounded',()=>{
  const c=client();c.count(10);c.draw();assert.equal(c.e('result').hidden,false);
  c.select([2,5]);assert.equal(c.e('result').hidden,true);assert.equal(c.e('count').value,'2');
  c.draw();assert.deepEqual(c.picked().sort(),[names[2],names[5]].sort());
  c.e('none').fire('click');assert.equal(c.e('go').disabled,true);assert.equal(c.e('count').disabled,true);
  c.draw();assert.equal(c.e('result').hidden,true);
  c.e('all').fire('click');assert.equal(c.e('count').value,'10');assert.equal(c.e('go').disabled,false);
  c.mode('teams');assert.equal(c.e('count').value,'2');assert.equal(c.e('result').hidden,true);
});
test('successive draws keep the selected pool and actually draw again',()=>{
  let word=0;const c=client({getRandomValues(a){a[0]=word;return a}});c.select([0,1,2]);c.count(2);c.draw();const first=c.picked();
  word=1;c.draw();assert.notDeepEqual(c.picked(),first);assert.match(c.e('go').textContent,/다시/);
  assert.equal(c.e('selected').textContent,'참가자 3명');
});
test('random integer rejects out-of-range words instead of favoring some people',()=>{
  let calls=0;const words=[0xffffffff,2,0],c=client({getRandomValues(a){a[0]=words[calls++];return a}});
  c.select([0,1,2]);c.count(3);c.draw();assert.equal(calls,3);assert.equal(new Set(c.picked()).size,3);
});
test('unavailable randomness reports failure without leaving an old result on screen',()=>{
  let fail=false;const c=client({getRandomValues(a){if(fail)throw Error('unavailable');a[0]=0;return a}});
  c.draw();assert.equal(c.e('result').hidden,false);fail=true;c.draw();
  assert.equal(c.e('result').hidden,true);assert.match(c.e('feedback').textContent,/못했어/);
});
