/* Atlas is consumed directly, without remote assets or a canvas-sized DOM overlay. */
(() => {
  const image = new Image(); image.src = '../assets/anon-atlas.png';
  const loaded = new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
  const rows = { idle:0, walk:1, follow:1, happy:2, guitar:3, sleep:4, held:5 };
  const frameFor = (state, elapsed, reduced) => {
    if (reduced) return state === 'sleep' ? 2 : 0;
    if (state === 'idle') { const t = elapsed % 5700; return t > 4850 && t < 4990 ? 2 : t > 2800 && t < 3800 ? 1 : 0; }
    if (state === 'sleep') return elapsed < 1000 ? 0 : 1 + Math.floor(elapsed / 1000) % 3;
    if (state === 'happy') return [0,1,1,2,2,3,1,3][Math.floor(elapsed / 220) % 8];
    return Math.floor(elapsed / (state === 'held' ? 190 : state === 'guitar' ? 220 : 140)) % 4;
  };
  window.AnonArt = class {
    constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d', { willReadFrequently:true }); this.ready = false; this.state = ''; this.started = performance.now(); loaded.then(() => { this.ready = true; }).catch(() => { canvas.setAttribute('aria-label','角色图像加载失败，请重新安装'); }); }
    draw(snapshot, now) {
      if (!this.ready || !snapshot) return;
      const state = snapshot.state;
      if (state !== this.state) { this.state = state; this.started = now; }
      const elapsed = now - this.started; const reduced = snapshot.settings.reducedMotion;
      const frame = frameFor(state, elapsed, reduced); const row = rows[state] ?? 0;
      const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
      ctx.clearRect(0,0,w,h); ctx.save();
      const dir = ['walk','follow'].includes(state) && snapshot.direction < 0 ? -1 : 1;
      const bounce = reduced ? 0 : state === 'walk' || state === 'follow' ? Math.sin(elapsed / 90) * 1.4 : Math.sin(elapsed / 650) * .65;
      const tilt = reduced ? 0 : state === 'held' ? Math.sin(elapsed / 170) * .055 : state === 'guitar' ? Math.sin(elapsed / 180) * .012 : 0;
      ctx.translate(w/2, h*.85); ctx.rotate(tilt); ctx.scale(dir,1); ctx.translate(-w/2,-h*.85 + bounce);
      // Four columns, six rows. Sleeping frames keep their naturally smaller silhouette.
      ctx.drawImage(image,frame * image.width/4,row * image.height/6,image.width/4,image.height/6,0, row === 4 ? 9 : 0,w,h);
      ctx.restore();
    }
    hit(clientX,clientY) { if (!this.ready) return false; const b=this.canvas.getBoundingClientRect(); const x=Math.floor((clientX-b.left)/b.width*this.canvas.width), y=Math.floor((clientY-b.top)/b.height*this.canvas.height); if(x<0||y<0||x>=this.canvas.width||y>=this.canvas.height)return false; return this.ctx.getImageData(x,y,1,1).data[3]>100; }
  };
})();
