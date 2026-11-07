/* Original approved artwork, animated with a small 2D mesh. No remote assets. */
(() => {
  'use strict';
  const image = new Image();
  const loaded = new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
  image.src = '../assets/anon-atlas.png';
  const rows = { idle: 0, walk: 1, follow: 1, happy: 2, feed: 2, dance: 2, guitar: 3, sleep: 4, held: 5, jump: 5, stretch: 5 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  const damp = (a, b, speed, dt) => a + (b - a) * (1 - Math.exp(-speed * dt));
  function frameFor(state, elapsed, reduced) {
    if (reduced) return state === 'sleep' ? 2 : state === 'happy' ? 1 : 0;
    if (state === 'idle') { const t = elapsed % 6100; return t > 5000 && t < 5140 ? 2 : t > 3000 && t < 3700 ? 1 : 0; }
    if (state === 'sleep') return elapsed < 1200 ? Math.min(2, Math.floor(elapsed / 450)) : 2 + Math.floor(elapsed / 1800) % 2;
    if (state === 'happy') return [0, 1, 1, 2, 2, 3, 1, 3][Math.floor(elapsed / 300) % 8];
    if (state === 'feed') return [0, 1, 1, 3, 1, 3][Math.floor(elapsed / 400) % 6];
    if (state === 'dance') return [2, 1, 2, 3][Math.floor(elapsed / 380) % 4];
    if (state === 'jump') return elapsed < 350 ? 0 : elapsed < 900 ? 1 : elapsed < 1600 ? 3 : 0;
    if (state === 'stretch') return [0, 1, 3, 3, 0][Math.min(4, Math.floor(elapsed / 1000))];
    return Math.floor(elapsed / (state === 'held' ? 210 : state === 'guitar' ? 240 : 150)) % 4;
  }
  const vertexShader = `attribute vec2 position; attribute vec2 uv; varying vec2 v_uv;
    void main(){v_uv=uv;gl_Position=vec4(position,0.0,1.0);}`;
  const fragmentShader = `precision mediump float; varying vec2 v_uv;
    uniform sampler2D atlas; uniform vec2 cell; uniform vec2 previous; uniform float blend;
    vec4 sampleCell(vec2 c){vec4 p=texture2D(atlas,(c+clamp(v_uv,0.001,0.999))/vec2(4.0,6.0));return vec4(p.rgb*p.a,p.a);}
    void main(){gl_FragColor=mix(sampleCell(previous),sampleCell(cell),blend);}`;

  window.AnonArt = class {
    constructor(canvas) {
      this.canvas = canvas; this.ready = false; this.state = ''; this.started = 0;
      this.lastDraw = -Infinity; this.frames = 0; this.cell = [0, 0]; this.previous = [0, 0]; this.cellSince = 0;
      this.pose = { roll: 0, lift: 0, sx: 1, sy: 1 }; this.gaze = { x: 0, y: 0 }; this.pointer = { x: 0, y: 0 };
      this.vertices = []; this.uv = []; this.indices = [];
      const cols = 14, rows = 18;
      for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) this.uv.push(x / cols, y / rows);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const a = y * (cols + 1) + x, b = a + cols + 1; this.indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
      this.positions = new Float32Array(this.uv.length);
      this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, powerPreference: 'low-power' });
      if (this.gl) this.initGL();
      else this.ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvas.dataset.renderer = this.gl ? 'mesh-2d' : 'canvas-2d';
      this.onPointer = e => {
        const b = canvas.getBoundingClientRect();
        this.pointer = { x: clamp((e.clientX - b.left - b.width / 2) / b.width, -1, 1), y: clamp((e.clientY - b.top - b.height / 3) / b.height, -1, 1) };
      };
      window.addEventListener('pointermove', this.onPointer, { passive: true });
      window.addEventListener('blur', () => { this.pointer = { x: 0, y: 0 }; });
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.ready = false; });
      canvas.addEventListener('webglcontextrestored', () => { this.initGL(); this.upload(); this.ready = true; });
      loaded.then(() => {
        const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
        const ctx = source.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
        this.pixels = ctx.getImageData(0, 0, image.width, image.height).data;
        if (this.gl) this.upload(); this.ready = true;
      }).catch(() => { canvas.setAttribute('aria-label', '角色图像加载失败，请重新安装'); });
    }
    initGL() {
      const gl = this.gl;
      const shader = (type, source) => {
        const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s;
      };
      const vs = shader(gl.VERTEX_SHADER, vertexShader), fs = shader(gl.FRAGMENT_SHADER, fragmentShader);
      this.program = gl.createProgram(); gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.deleteShader(vs); gl.deleteShader(fs); gl.useProgram(this.program);
      this.positionBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.DYNAMIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.uvBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.uv), gl.STATIC_DRAW);
      const uv = gl.getAttribLocation(this.program, 'uv'); gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);
      this.indexBuffer = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.indices), gl.STATIC_DRAW);
      this.uniforms = Object.fromEntries(['cell', 'previous', 'blend'].map(name => [name, gl.getUniformLocation(this.program, name)]));
      this.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);
    }
    upload() { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); }
    resize(battery) {
      const scale = Math.min(window.devicePixelRatio || 1, battery ? 1 : 2);
      const w = Math.max(64, Math.round(this.canvas.clientWidth * scale)), h = Math.max(64, Math.round(this.canvas.clientHeight * scale));
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      if (this.gl) this.gl.viewport(0, 0, w, h);
    }
    updatePose(state, elapsed, t, dt, reduced) {
      const target = { roll: Math.sin(t * 1.4) * .008, lift: Math.sin(t * 2) * .0015, sx: 1, sy: 1 };
      if (state === 'walk' || state === 'follow') { target.lift = -Math.abs(Math.sin(t * 10.4)) * .008; target.roll = Math.sin(t * 10.4) * .012; }
      if (state === 'guitar') target.roll = Math.sin(t * 5.8) * .018;
      if (state === 'happy' || state === 'feed') { target.roll = Math.sin(t * 3.6) * .026; target.lift = -Math.abs(Math.sin(t * 3.6)) * .004; }
      if (state === 'held') { target.roll = Math.sin(t * 6.5) * .085; target.lift = -.015; }
      if (state === 'dance') { target.roll = Math.sin(t * 5.5) * .065; target.lift = -Math.abs(Math.sin(t * 5.5)) * .035; target.sx += Math.sin(t * 5.5) * .018; target.sy -= Math.sin(t * 5.5) * .018; }
      if (state === 'jump') {
        const p = clamp(elapsed / 2400, 0, 1);
        if (p < .16) { target.sy -= Math.sin(p / .16 * Math.PI) * .06; target.sx += Math.sin(p / .16 * Math.PI) * .035; }
        else if (p < .7) { const arc = (p - .16) / .54; target.lift = -.065 * Math.sin(arc * Math.PI); target.roll = Math.sin(arc * Math.PI * 2) * .035; }
        else { target.sy -= Math.sin((p - .7) / .3 * Math.PI) * .035; }
      }
      if (state === 'stretch') { target.sy += Math.sin(clamp(elapsed / 5500, 0, 1) * Math.PI) * .035; target.roll = Math.sin(t * 2) * .022; }
      if (reduced) Object.assign(target, { roll: 0, lift: 0, sx: 1, sy: 1 });
      // Raised arms need headroom throughout their arc, including the apex of a jump.
      if (['held', 'jump', 'stretch'].includes(state)) { target.sx *= .93; target.sy *= .93; }
      for (const key of Object.keys(target)) this.pose[key] = reduced ? target[key] : damp(this.pose[key], target[key], 16, dt);
    }
    warp(u, v, t, state, reduced, direction) {
      let x = u, y = v;
      if (state === 'sleep') { y += .033; if (!reduced) x += (u - .5) * Math.sin(t * 2) * .004; }
      else if (!reduced) {
        const head = 1 - smooth(.39, .62, v);
        const tail = smooth(.26, .45, v) * (1 - smooth(.75, .91, v));
        const side = smooth(.2, .4, Math.abs(u - .5));
        const small = ['held', 'jump', 'stretch'].includes(state) || state === 'guitar' && u > .5;
        x += side * tail * Math.sin(t * 2.4 + v * 9 + (u < .5 ? 0 : 1.2)) * (small ? .0018 : .007);
        x += head * this.gaze.x * .0045; y += head * this.gaze.y * .002;
        x += (u - .5) * Math.sin(t * 2) * .004 * smooth(.4, .6, v) * (1 - smooth(.7, .9, v));
        const angle = head * (this.gaze.x * .009 + (state === 'happy' ? Math.sin(t * 3) * .006 : 0));
        const dx = x - .5, dy = y - .33;
        x = .5 + dx * Math.cos(angle) - dy * Math.sin(angle); y = .33 + dx * Math.sin(angle) + dy * Math.cos(angle);
      }
      const dx = (x - .5) * this.pose.sx, dy = (y - .94) * this.pose.sy;
      x = .5 + (dx * Math.cos(this.pose.roll) - dy * Math.sin(this.pose.roll)) * direction;
      y = .94 + dx * Math.sin(this.pose.roll) + dy * Math.cos(this.pose.roll) + this.pose.lift;
      return [x * 2 - 1, 1 - y * 2];
    }
    draw(snapshot, now) {
      if (!this.ready || !snapshot || document.hidden) return;
      const battery = snapshot.settings.quality === 'battery', interval = 1000 / (battery ? 24 : 50);
      if (now - this.lastDraw < interval - .5) return;
      const dt = clamp((now - this.lastDraw) / 1000, .001, .05); this.lastDraw = now;
      const state = snapshot.state, reduced = snapshot.settings.reducedMotion;
      if (state !== this.state || snapshot.revision !== this.revision) { this.state = state; this.revision = snapshot.revision; this.started = now; }
      const elapsed = now - this.started, t = reduced ? 0 : now / 1000;
      const cell = [frameFor(state, elapsed, reduced), rows[state] ?? 0];
      if (cell[0] !== this.cell[0] || cell[1] !== this.cell[1]) { this.previous = this.cell; this.cell = cell; this.cellSince = now; }
      const gaze = reduced || snapshot.settings.trackCursor === false ? { x: 0, y: 0 } : this.canvas.id === 'sprite' ? snapshot.gaze || this.pointer : this.pointer;
      this.gaze.x = damp(this.gaze.x, gaze.x, 5, dt); this.gaze.y = damp(this.gaze.y, gaze.y, 5, dt);
      this.updatePose(state, elapsed, t, dt, reduced); this.resize(battery);
      const direction = ['walk', 'follow'].includes(state) && snapshot.direction < 0 ? -1 : 1;
      // Only dissolve similar resting silhouettes. Distinct poses must not grow double eyes/limbs.
      this.blend = !reduced && ['idle', 'sleep'].includes(state) && this.previous[1] === this.cell[1] ? clamp((now - this.cellSince) / 45, 0, 1) : 1;
      if (this.gl) {
        const gl = this.gl;
        for (let i = 0; i < this.uv.length; i += 2) { const p = this.warp(this.uv[i], this.uv[i + 1], t, state, reduced, direction); this.positions[i] = p[0]; this.positions[i + 1] = p[1]; }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions);
        gl.uniform2fv(this.uniforms.cell, this.cell); gl.uniform2fv(this.uniforms.previous, this.previous); gl.uniform1f(this.uniforms.blend, this.blend);
        gl.clear(gl.COLOR_BUFFER_BIT); gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);
      } else {
        const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
        ctx.clearRect(0, 0, w, h); ctx.save(); ctx.translate(w / 2, h * (.94 + this.pose.lift)); ctx.rotate(this.pose.roll);
        ctx.scale(direction * this.pose.sx, this.pose.sy); ctx.translate(-w / 2, -h * .94);
        ctx.drawImage(image, this.cell[0] * image.width / 4, this.cell[1] * image.height / 6, image.width / 4, image.height / 6, 0, state === 'sleep' ? h * .033 : 0, w, h); ctx.restore();
      }
      this.frames++; this.canvas.dataset.frames = this.frames; this.canvas.dataset.state = state;
    }
    sampleAlpha(u, v, cell) {
      const x = Math.floor((cell[0] + clamp(u, .001, .999)) * image.width / 4), y = Math.floor((cell[1] + clamp(v, .001, .999)) * image.height / 6);
      return this.pixels[(y * image.width + x) * 4 + 3];
    }
    hit(clientX, clientY) {
      if (!this.ready || !this.frames) return false;
      const b = this.canvas.getBoundingClientRect(), u = (clientX - b.left) / b.width, v = (clientY - b.top) / b.height;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
      if (!this.gl) return this.ctx.getImageData(Math.floor(u * this.canvas.width), Math.floor(v * this.canvas.height), 1, 1).data[3] > 100;
      // Invert the same mesh used to draw; no per-pointer GPU readback stall.
      const x = u * 2 - 1, y = 1 - v * 2, p = this.positions;
      for (let i = 0; i < this.indices.length; i += 3) {
        const a = this.indices[i] * 2, b = this.indices[i + 1] * 2, c = this.indices[i + 2] * 2;
        const den = (p[b + 1] - p[c + 1]) * (p[a] - p[c]) + (p[c] - p[b]) * (p[a + 1] - p[c + 1]);
        if (Math.abs(den) < 1e-10) continue;
        const wa = ((p[b + 1] - p[c + 1]) * (x - p[c]) + (p[c] - p[b]) * (y - p[c + 1])) / den;
        const wb = ((p[c + 1] - p[a + 1]) * (x - p[c]) + (p[a] - p[c]) * (y - p[c + 1])) / den, wc = 1 - wa - wb;
        if (wa < 0 || wb < 0 || wc < 0) continue;
        const tu = this.uv[a] * wa + this.uv[b] * wb + this.uv[c] * wc, tv = this.uv[a + 1] * wa + this.uv[b + 1] * wb + this.uv[c + 1] * wc;
        const alpha = this.sampleAlpha(tu, tv, this.cell) * this.blend + this.sampleAlpha(tu, tv, this.previous) * (1 - this.blend);
        return alpha > 100;
      }
      return false;
    }
    diagnostics() { return { renderer: this.canvas.dataset.renderer, frames: this.frames, state: this.state, triangles: this.gl ? this.indices.length / 3 : 0, source: 'original-approved-atlas' }; }
  };
})();
