(() => {
'use strict';
const notes={
  letter:{title:'강일 없는 긍정의밤이라니… ㅠㅠ',message:'이번엔 함께 못해서 너무 아쉽다.\n벌써부터 네 빈자리가 느껴져.\n다음엔 꼭 같이 먹고, 웃고, 놀자!',sign:'함께하지 못해도,\n강일이도 늘 우리의 긍정 💛'},
  shirt:{title:'단체티도 강일이 기다리는 중',message:'단체티 입고 사진 찍을 때\n강일이 없어서 또 한 번 아쉬울 예정…\n다음엔 꼭 같이 입고 찍자 ㅠㅠ',sign:'사진 밖에서도 마음은 함께 💛'},
  tteok:{title:'오늘의 비밀 재료 발견',message:'떡볶이에 재료는 다 모였는데…\n강일이가 없어서 아쉬움 한 스푼 추가 🥲\n이건 아무리 끓여도 안 졸아든다.',sign:'다음 떡볶이는 같이 먹자 💛'},
  bbq:{title:'고기 굽다가 갑자기…',message:'고기 한 점, 강일이 생각 한 번.\n맛있는 냄새 나니까 더 생각나잖아 ㅠㅠ\n다음엔 불판 앞에서 같이 만나자!',sign:'오늘의 불맛에 그리움 조금 💛'},
  footer:{title:'여기까지 숨겨둔 한마디',message:'페이지는 끝까지 내려왔는데\n강일이 보고 싶은 마음은 안 끝남…\n다음엔 같이 끝까지 놀자 ㅋㅋㅠㅠ',sign:'다음 긍정의밤엔 꼭 함께 💛'}
};
const dialog=document.getElementById('kangil-dialog');
let opener;
document.querySelectorAll('[data-kangil]').forEach(button=>button.addEventListener('click',()=>{
  const note=notes[button.dataset.kangil];
  if(!note||dialog.open)return;
  opener=button;
  document.getElementById('miss-you-title').textContent=note.title;
  document.getElementById('kangil-message').textContent=note.message;
  document.getElementById('kangil-sign').textContent=note.sign;
  dialog.showModal();
  document.documentElement.classList.add('kangil-open');
}));
dialog.addEventListener('close',()=>{
  document.documentElement.classList.remove('kangil-open');
  opener?.focus({preventScroll:true});
});
dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const r=dialog.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
});
})();
