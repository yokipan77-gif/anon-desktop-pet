'use strict';
const api=window.anon;let snapshot;const art=new window.AnonArt(document.querySelector('#preview'));
window.anonArt=art;
const states={idle:'安静陪着你',walk:'散步中',follow:'跟着你跑',happy:'心情很好 ♪',feed:'点心时间 ♡',dance:'跟上这个节拍 ♪',jump:'嘿咻！',stretch:'一起伸个懒腰',guitar:'练习吉他中',sleep:'小憩中 · 点击叫醒',held:'被抱起来了！'};
function update(next){
  snapshot=next;document.querySelector('#state-label').textContent=states[next.state]||states.idle;
  document.querySelector('#room-speech').textContent=next.speech||'你忙你的，我在这里。';
  for(const key of ['affection','energy','hunger']){document.getElementById(key).value=next.settings[key];document.getElementById(key+'-number').textContent=Math.round(next.settings[key]);}
  document.querySelector('#pat-count').textContent=next.settings.pats;
  for(const key of ['pinned','roam','chatter','sound','topmost','reducedMotion','trackCursor'])document.getElementById(key).checked=next.settings[key];
  document.querySelector('#quality').value=next.settings.quality;
  document.querySelectorAll('[data-action]').forEach(button=>button.disabled=next.state==='held'||next.settings.pinned&&button.dataset.action==='follow');
  document.querySelector('#roam').disabled=next.settings.pinned;
  if(document.activeElement.id!=='size')document.querySelector('#size').value=next.settings.size;
  document.querySelector('#size-value').textContent=Math.round(next.settings.size*100)+'%';
  document.querySelector('#sleep-action b').textContent=next.state==='sleep'?'叫醒爱音':'休息一下';
  updateTimer();
}
function updateTimer(){if(!snapshot)return;const active=!!snapshot.focusEnd;document.querySelector('#focus-start').hidden=active;document.querySelector('#focus-duration').hidden=active;document.querySelector('#focus-stop').hidden=!active;
  const left=Math.max(0,Math.ceil((snapshot.focusEnd-Date.now())/1000));document.querySelector('#focus-description').textContent=active?`还剩 ${Math.floor(left/60)} 分 ${left%60} 秒。爱音在安静陪你。`:`已经一起专心 ${snapshot.settings.focusMinutes} 分钟。结束时我会叫你。`;
}
api.onUpdate(update);api.get().then(update);
function animate(now){art.draw(snapshot,now);requestAnimationFrame(animate);}requestAnimationFrame(animate);
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>api.action(button.dataset.action==='sleep'&&snapshot.state==='sleep'?'wake':button.dataset.action)));
const preview=document.querySelector('#preview');const pat=()=>api.action(snapshot?.state==='sleep'?'wake':'pat');preview.addEventListener('click',pat);preview.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();pat();}});
for(const key of ['pinned','roam','chatter','sound','topmost','reducedMotion','trackCursor'])document.getElementById(key).addEventListener('change',event=>api.settings({[key]:event.target.checked}));
document.querySelector('#quality').addEventListener('change',event=>api.settings({quality:event.target.value}));
document.querySelector('#size').addEventListener('input',event=>{document.querySelector('#size-value').textContent=Math.round(Number(event.target.value)*100)+'%';api.settings({size:Number(event.target.value)});});
document.querySelector('#focus-start').addEventListener('click',()=>api.focus(Number(document.querySelector('#focus-duration').value)));
document.querySelector('#focus-stop').addEventListener('click',()=>api.focus(0));document.querySelector('#home').addEventListener('click',()=>api.home());setInterval(updateTimer,1000);
