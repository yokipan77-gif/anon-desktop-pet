'use strict';
const api = window.anon;
const canvas = document.querySelector('#sprite'), art = new window.AnonArt(canvas), speech = document.querySelector('#speech');
let snapshot, pointer, lastInteractive, lastRevision = -1, audio;
const dock = document.querySelector('#dock'), more = document.querySelector('#more');
function update(next) {
  snapshot = next; document.body.dataset.state = next.state; speech.textContent = next.speech;
  if (next.revision !== lastRevision) {
    lastRevision = next.revision;
    if (['happy','guitar'].includes(next.state) && !next.settings.reducedMotion) {
      const container=document.querySelector('#particles'); container.replaceChildren();
      for(let i=0;i<4;i++){const p=document.createElement('span');p.className='particle';p.textContent=next.state==='guitar'?'♪':next.particles==='snack'?'✧':'♡';container.append(p);}
      if(next.state==='guitar'&&next.settings.sound) playNotes();
    }
  }
}
function playNotes() {
  try {
    audio ??= new AudioContext(); audio.resume();
    [261.63,329.63,392,523.25,392,329.63].forEach((frequency,index)=>{
      const oscillator=audio.createOscillator(),gain=audio.createGain();const t=audio.currentTime+index*.23;
      oscillator.type='triangle';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.025,t+.015);gain.gain.exponentialRampToValueAtTime(.0001,t+.4);
      oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(t);oscillator.stop(t+.45);
    });
  } catch {}
}
api.onUpdate(update);api.get().then(update);
function animate(now){art.draw(snapshot,now);requestAnimationFrame(animate);}requestAnimationFrame(animate);
function hit(event) {
  const interactive=!!pointer||!!event.target.closest('button')||(!dock.hidden&&!!event.target.closest('#dock'))||art.hit(event.clientX,event.clientY);
  if(interactive!==lastInteractive){lastInteractive=interactive;api.hit(interactive);}return interactive;
}
document.addEventListener('pointermove',event=>{
  if(pointer){
    if(!pointer.dragging&&Math.hypot(event.screenX-pointer.x,event.screenY-pointer.y)>6){pointer.dragging=true;api.drag(true);dock.hidden=true;more.setAttribute('aria-expanded','false');}
  }
  hit(event);
});
document.addEventListener('pointerleave',()=>{if(!pointer){lastInteractive=false;api.hit(false);}});
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||!art.hit(event.clientX,event.clientY))return;
  pointer={x:event.screenX,y:event.screenY,dragging:false,head:event.offsetY<canvas.clientHeight*.6};canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointerup',event=>{
  if(!pointer)return;const p=pointer;pointer=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  if(p.dragging)api.drag(false);else api.action(snapshot.state==='sleep'?'wake':p.head?'pat':'talk');hit(event);
});
function cancel(){if(pointer?.dragging)api.drag(false);pointer=null;}
canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);window.addEventListener('blur',cancel);
canvas.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();api.action(snapshot.state==='sleep'?'wake':'pat');}if(event.key==='Escape'){dock.hidden=true;more.setAttribute('aria-expanded','false');}});
document.addEventListener('contextmenu',event=>{event.preventDefault();api.menu();});
more.addEventListener('click',()=>{dock.hidden=!dock.hidden;more.setAttribute('aria-expanded',String(!dock.hidden));});
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>api.action(button.dataset.action==='sleep'&&snapshot.state==='sleep'?'wake':button.dataset.action)));
document.querySelector('#room').addEventListener('click',()=>api.room());
setInterval(()=>{const timer=document.querySelector('#timer');timer.hidden=!snapshot?.focusEnd;if(snapshot?.focusEnd){const left=Math.max(0,Math.ceil((snapshot.focusEnd-Date.now())/1000));timer.textContent=`◷ ${Math.floor(left/60).toString().padStart(2,'0')}:${(left%60).toString().padStart(2,'0')}`;}},1000);
