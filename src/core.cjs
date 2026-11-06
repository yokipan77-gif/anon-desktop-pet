'use strict';

const defaults = Object.freeze({ size: 1, roam: true, chatter: true, sound: false, topmost: true, reducedMotion: false, affection: 20, hunger: 75, energy: 90, pats: 0, focusMinutes: 0, savedAt: 0 });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function normalize(input = {}) {
  const out = { ...defaults };
  if (!input || typeof input !== 'object') return out;
  for (const k of ['roam', 'chatter', 'sound', 'topmost', 'reducedMotion']) if (typeof input[k] === 'boolean') out[k] = input[k];
  for (const [k, lo, hi] of [['size', .75, 1.35], ['affection', 0, 100], ['hunger', 0, 100], ['energy', 0, 100], ['pats', 0, 1e8], ['focusMinutes', 0, 1e8], ['savedAt', 0, 1e15]]) {
    if (Number.isFinite(input[k])) out[k] = clamp(input[k], lo, hi);
  }
  if (Number.isFinite(input.x) && Number.isFinite(input.y)) { out.x = input.x; out.y = input.y; }
  return out;
}
function constrain(point, area, size) {
  return { x: clamp(point.x, area.x, area.x + Math.max(0, area.width - size.width)), y: clamp(point.y, area.y, area.y + Math.max(0, area.height - size.height)) };
}
function physics(p, area, size, dt) {
  dt = clamp(dt, 0, .05);
  let { x, y, vx, vy } = p;
  vy += 1450 * dt; x += vx * dt; y += vy * dt;
  const bounded = constrain({ x, y }, area, size);
  if (x !== bounded.x) vx *= -.48;
  if (y !== bounded.y) { vy *= -.3; vx *= .72; }
  const floor = area.y + Math.max(0, area.height - size.height);
  const settled = Math.abs(bounded.y - floor) < 1 && Math.abs(vy) < 55 && Math.abs(vx) < 28;
  return { ...bounded, vx: settled ? 0 : vx * Math.pow(.96, dt * 60), vy: settled ? 0 : vy, settled };
}
class Companion {
  constructor(saved, now = Date.now(), random = Math.random) {
    this.settings = normalize(saved); this.random = random; this.state = 'idle'; this.until = now + 8000;
    this.lastTick = now; this.lastAction = {}; this.speech = ''; this.speechUntil = 0;
    this.focusEnd = 0; this.focusStarted = 0; this.direction = 1; this.particles = ''; this.revision = 0;
  }
  say(text, now) { this.speech = text; this.speechUntil = now + 6500; }
  setState(state, duration, now) { this.state = state; this.until = now + duration; this.revision++; }
  act(action, now = Date.now()) {
    if (!['pat','feed','guitar','sleep','wake','talk','follow','wave','drag','drop'].includes(action)) return false;
    if (action === 'drag') { this.setState('held', Infinity, now); this.say('诶——轻一点啦！', now); return true; }
    if (action === 'drop') { this.setState('happy', 1800, now); this.say('安全着陆！刚才不算失误哦。', now); return true; }
    if (action === 'wake') { this.setState('happy', 2400, now); this.say('我醒着呢！……刚才只是闭目养神。', now); return true; }
    if (action === 'sleep') { this.setState('sleep', Infinity, now); this.say('借你的桌角，稍微休息一下……', now); return true; }
    if (this.state === 'held') return false;
    const cooled = now - (this.lastAction[action] ?? -Infinity) > (action === 'feed' ? 12000 : 1500);
    this.lastAction[action] = now;
    this.particles = action === 'feed' ? 'snack' : action === 'guitar' ? 'notes' : 'hearts';
    if (action === 'pat') {
      if (cooled) { this.settings.affection = clamp(this.settings.affection + 1, 0, 100); this.settings.pats++; }
      this.setState('happy', 3200, now);
      this.say(this.settings.pats % 3 === 0 ? '头发要乱了啦……不过，再摸一下也行。' : '嘿嘿，今天也有好好努力吧？', now);
    } else if (action === 'feed') {
      if (cooled) { this.settings.hunger = clamp(this.settings.hunger + 18, 0, 100); this.settings.energy = clamp(this.settings.energy + 5, 0, 100); }
      this.setState('happy', 3600, now); this.say(cooled ? '是给我的？那我就不客气啦 ♪' : '先让我把这一口吃完嘛！', now);
    } else if (action === 'guitar') {
      this.setState('guitar', 14000, now); this.say('接下来，是爱音的练习时间！', now);
    } else if (action === 'follow') {
      this.setState('follow', 18000, now); this.say('等一下！我也要去那边！', now);
    } else {
      this.setState('happy', 2600, now);
      const lines = ['迷路也没关系，一起往前走吧。','今天的我，也很有主角感吧？','要不要休息一下？我陪你。','练习很难，但一起的话就没那么难了。','你忙你的，我在这里。','下一次 Live，一定会更棒的！'];
      this.say(lines[Math.floor(this.random() * lines.length)], now);
    }
    return true;
  }
  focus(minutes, now = Date.now()) {
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 120) return false;
    if (!minutes) { this.focusEnd = 0; this.focusStarted = 0; this.say('暂停一下也没关系。', now); return true; }
    this.focusStarted = now; this.focusEnd = now + minutes * 60000;
    this.setState('idle', 6000, now); this.say(`一起专心 ${minutes} 分钟，我会安静陪着你。`, now); return true;
  }
  tick(now = Date.now()) {
    const elapsed = clamp((now - this.lastTick) / 60000, 0, 2); this.lastTick = now;
    this.settings.hunger = clamp(this.settings.hunger - elapsed * .24, 0, 100);
    this.settings.energy = clamp(this.settings.energy + elapsed * (this.state === 'sleep' ? 2 : -.16), 0, 100);
    let completed = false;
    if (this.focusEnd && now >= this.focusEnd) {
      this.settings.focusMinutes += Math.round((this.focusEnd - this.focusStarted) / 60000);
      this.focusEnd = 0; this.focusStarted = 0; completed = true;
      this.setState('happy', 5000, now); this.say('辛苦啦！站起来伸个懒腰吧。', now);
    }
    if (this.state !== 'sleep' && this.state !== 'held' && now > this.until) {
      const roll = this.random();
      if (this.state !== 'idle') this.setState('idle', 7000 + this.random() * 11000, now);
      else if (this.settings.energy < 15) this.setState('sleep', Infinity, now);
      else if (this.focusEnd || this.settings.reducedMotion) this.setState('idle', 15000, now);
      else if (roll < .5 && this.settings.roam) {
        this.direction = this.random() < .5 ? -1 : 1; this.setState('walk', 3000 + this.random() * 4000, now);
      } else if (roll < .72) this.setState('guitar', 8000, now);
      else if (this.settings.chatter) this.act('talk', now);
      else this.setState('idle', 12000, now);
    }
    return completed;
  }
  snapshot(now = Date.now()) {
    return { settings: { ...this.settings }, state: this.state, direction: this.direction, speech: now < this.speechUntil ? this.speech : '', focusEnd: this.focusEnd, particles: this.particles, revision: this.revision };
  }
}
module.exports = { defaults, normalize, clamp, constrain, physics, Companion };
