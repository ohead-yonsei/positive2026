(() => {
'use strict';
const NAMES=['구세라','권경지','권순록','김강일','류원선','박재훈','서정윤','유세종','이대호','이수한','천수진'];
const $=id=>document.getElementById(id),checks=[],counts={people:1,teams:2};
let mode='people',hasResult=false;
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
const participants=()=>checks.flatMap((input,i)=>input.checked?[i]:[]);
// Rejection sampling avoids modulo bias; Fisher–Yates gives every order equal probability.
function randomBelow(n){
  const limit=Math.floor(0x100000000/n)*n,buffer=new Uint32Array(1);
  do{crypto.getRandomValues(buffer)}while(buffer[0]>=limit);
  return buffer[0]%n;
}
function shuffle(ids){
  const result=ids.slice();
  for(let i=result.length-1;i>0;i--){const j=randomBelow(i+1);[result[i],result[j]]=[result[j],result[i]]}
  return result;
}
function clearResult(){hasResult=false;$('picker-result').hidden=true;$('picker-result-list').replaceChildren()}
function update(){
  const n=participants().length,count=n?Math.min(n,Math.max(1,counts[mode])):0;
  $('picker-selected').textContent=`참가자 ${n}명`;
  $('picker-count-label').textContent=mode==='teams'?'몇 개 팀으로 나눌까?':'몇 명을 뽑을까?';
  const select=$('picker-count');select.replaceChildren();
  if(!n)select.append(new Option('—',''));
  for(let i=1;i<=n;i++)select.append(new Option(i+(mode==='teams'?'개 팀':'명'),String(i)));
  select.value=n?String(count):'';select.disabled=!n;
  $('picker-go').disabled=!n;
  $('picker-go').textContent=(hasResult?'다시 ':'')+(mode==='teams'?`${count}개 팀 나누기 🤝`:`${count}명 뽑기 🎲`);
  if(!n){$('picker-go').textContent='참가자를 먼저 골라줘';$('picker-help').textContent='명단 변경을 열고 한 명 이상 체크해줘.'}
  else $('picker-help').textContent=mode==='teams'?
    Array.from({length:count},(_,i)=>Math.floor(n/count)+(i<n%count?1:0)+'명').join(' · ')+'으로 나눠. 모두 한 팀씩 들어가.':
    `${n}명 중 ${count}명! 같은 추첨 안에서는 이름이 겹치지 않아.`;
  if(!hasResult)$('picker-feedback').textContent=n?'준비되면 뽑기 버튼을 눌러줘.':'참가자가 없어. 명단에서 함께할 사람을 골라줘.';
}
NAMES.forEach((name,i)=>{
  const label=node('label'),input=node('input');input.type='checkbox';input.checked=true;input.id='picker-person-'+i;
  label.append(input,node('span',null,name));$('picker-people').append(label);checks.push(input);
  input.addEventListener('change',()=>{clearResult();update()});
});
for(const next of ['people','teams'])$('picker-mode-'+next).addEventListener('change',()=>{
  if(!$('picker-mode-'+next).checked)return;mode=next;clearResult();update();
});
$('picker-count').addEventListener('change',()=>{counts[mode]=Number($('picker-count').value);clearResult();update()});
for(const [id,checked] of [['picker-all',true],['picker-none',false]])$(id).addEventListener('click',()=>{
  checks.forEach(input=>{input.checked=checked});clearResult();update();
});
$('picker-form').addEventListener('submit',event=>{
  event.preventDefault();const ids=participants(),count=Number($('picker-count').value);
  if(!Number.isInteger(count)||count<1||count>ids.length){clearResult();update();return}
  let order;
  try{order=shuffle(ids)}catch(_){clearResult();$('picker-feedback').textContent='추첨을 시작하지 못했어. 페이지를 새로고침하고 다시 눌러줘.';return}
  const root=$('picker-result-list');root.replaceChildren();
  if(mode==='people'){
    const chosen=order.slice(0,count),list=node('ul','picker-result-list');
    chosen.forEach(i=>list.append(node('li',null,NAMES[i])));root.append(list);
    $('picker-result-title').textContent=`뽑힌 ${count}명!`;
    $('picker-feedback').textContent=`${chosen.map(i=>NAMES[i]).join(', ')}! ${count}명을 뽑았어.`;
    $('picker-result-note').textContent='다시 뽑으면 지금 뽑힌 사람도 후보에 포함돼. 빼고 싶으면 명단에서 체크를 해제해줘.';
  }else{
    const teams=Array.from({length:count},()=>[]),grid=node('div','picker-teams');
    order.forEach((i,k)=>teams[k%count].push(i));
    teams.forEach((members,k)=>{
      const card=node('div','picker-team'),heading=node('h4',null,`${k+1}팀`),list=node('ul');
      heading.append(node('small',null,`${members.length}명`));members.forEach(i=>list.append(node('li',null,NAMES[i])));
      card.append(heading,list);grid.append(card);
    });
    root.append(grid);$('picker-result-title').textContent=`우리의 ${count}개 팀!`;
    $('picker-feedback').textContent=`${ids.length}명을 ${count}개 팀으로 나눴어. 아래에서 팀원을 확인해줘.`;
    $('picker-result-note').textContent='팀 인원 차이는 최대 1명이야. 다시 누르면 새 조합으로 섞어줘.';
  }
  hasResult=true;$('picker-result').hidden=false;update();
});
update();
})();
