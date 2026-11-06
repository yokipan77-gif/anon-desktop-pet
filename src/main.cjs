'use strict';
const { app, BrowserWindow, ipcMain, Menu, Tray, screen, nativeImage, Notification, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { normalize, constrain, physics, Companion, clamp } = require('./core.cjs');
const testMode = process.argv.includes('--smoke-test');
if (testMode) app.setPath('userData', path.join(app.getPath('temp'), 'anon-desktop-pet-test', String(process.pid)));
app.setAppUserModelId('io.github.yokipan77.anonpet');
let pet, room, tray, model, savePath, timer, lastTime, drag, flight, point, lastSent = '', lastSave = 0, hidden = false, suspended = false;
let ignored = true, size = { width: 340, height: 340 };
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on('second-instance', () => { showPet(); openRoom(); });
  app.whenReady().then(boot).catch(error => { console.error(error); app.quit(); });
}
function secure(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
}
function trusted(event) { return [pet, room].some(win => win && !win.isDestroyed() && win.webContents === event.sender); }
function channel(name, handler) { ipcMain.on(name, (event, ...args) => { if (trusted(event)) handler(event, ...args); }); }
function save() {
  if (!model) return;
  try {
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    const data = normalize({ ...model.settings, ...point, savedAt: Date.now() });
    fs.writeFileSync(savePath + '.tmp', JSON.stringify(data, null, 2));
    fs.renameSync(savePath + '.tmp', savePath);
  } catch (error) { console.error('Unable to save companion settings:', error.message); }
}
function areaAt(p) { return screen.getDisplayNearestPoint({ x: Math.round(p.x + size.width / 2), y: Math.round(p.y + size.height / 2) }).workArea; }
function place() { if (pet && !pet.isDestroyed()) pet.setPosition(Math.round(point.x), Math.round(point.y), false); }
function home() {
  drag = null; flight = null;
  const a = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  point = constrain({ x: a.x + a.width - size.width - 40, y: a.y + a.height - size.height }, a, size);
  model.act('wake'); place(); showPet(); save(); broadcast(true);
}
function showPet() { hidden = false; pet?.showInactive(); }
function openRoom() {
  if (room && !room.isDestroyed()) { room.show(); room.focus(); return; }
  room = new BrowserWindow({ width: 960, height: 760, minWidth: 760, minHeight: 650, title: '爱音的小房间', backgroundColor: '#fbf8fb', autoHideMenuBar: true, icon: path.join(__dirname, '../assets/icon.png'), titleBarStyle: 'hidden', titleBarOverlay: { color: '#fbf8fb', symbolColor: '#3a3548', height: 38 }, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  secure(room); room.loadFile(path.join(__dirname, 'room.html'));
  // Let the control room sit above the companion while it has keyboard focus.
  room.on('focus', () => pet?.setAlwaysOnTop(false));
  room.on('blur', () => pet?.setAlwaysOnTop(model.settings.topmost, 'floating'));
  room.once('ready-to-show', () => room.show()); room.on('closed', () => { room = null; pet?.setAlwaysOnTop(model.settings.topmost, 'floating'); });
}
function menu() {
  Menu.buildFromTemplate([
    { label: '爱音的小房间', click: openRoom }, { type: 'separator' },
    { label: '摸摸头 ♡', click: () => model.act('pat') }, { label: '请她吃点心', click: () => model.act('feed') },
    { label: '弹一会儿吉他', click: () => model.act('guitar') },
    { label: model.state === 'sleep' ? '叫醒爱音' : '休息一下', click: () => model.act(model.state === 'sleep' ? 'wake' : 'sleep') },
    { label: '回到屏幕角落', click: home }, { label: hidden ? '显示桌宠' : '暂时隐藏', click: () => { if (hidden) showPet(); else { hidden = true; pet.hide(); } } },
    { type: 'separator' }, { label: '退出爱音桌宠', click: () => app.quit() }
  ]).popup();
}
function broadcast(force = false) {
  const value = model.snapshot(); const json = JSON.stringify(value);
  if (!force && json === lastSent) return; lastSent = json;
  for (const win of [pet, room]) if (win && !win.isDestroyed()) win.webContents.send('anon:update', value);
}
async function boot() {
  savePath = path.join(app.getPath('userData'), 'companion.json');
  let saved = {}; try { saved = JSON.parse(fs.readFileSync(savePath, 'utf8')); } catch {}
  model = new Companion(saved); size = { width: Math.round(340 * model.settings.size), height: Math.round(340 * model.settings.size) };
  const a = screen.getPrimaryDisplay().workArea;
  point = constrain({ x: model.settings.x ?? a.x + a.width - size.width - 40, y: model.settings.y ?? a.y + a.height - size.height }, a, size);
  pet = new BrowserWindow({ ...size, x: Math.round(point.x), y: Math.round(point.y), transparent: true, backgroundColor: '#00000000', frame: false, thickFrame: false, hasShadow: false, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, alwaysOnTop: model.settings.topmost, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true } });
  secure(pet); pet.setIgnoreMouseEvents(true, { forward: true }); pet.setAlwaysOnTop(model.settings.topmost, 'floating');
  pet.loadFile(path.join(__dirname, 'pet.html')); pet.once('ready-to-show', () => { pet.showInactive(); model.say('初次见面！我是爱音。右键点我，来玩吧 ♪', Date.now()); broadcast(true); });
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png')).resize({ width: 24, height: 24 }));
  tray.setToolTip('爱音桌宠 · 双击打开小房间'); tray.on('double-click', () => { showPet(); openRoom(); }); tray.on('right-click', menu); tray.on('click', showPet);
  ipcMain.handle('anon:get', event => trusted(event) ? model.snapshot() : null);
  channel('anon:action', (_, name) => { model.act(name); broadcast(true); });
  channel('anon:room', openRoom); channel('anon:home', home); channel('anon:menu', menu); channel('anon:quit', () => app.quit());
  channel('anon:hide', () => { hidden = true; pet.hide(); });
  channel('anon:focus', (_, minutes) => { model.focus(minutes); broadcast(true); });
  channel('anon:settings', (_, patch) => {
    if (!patch || typeof patch !== 'object') return;
    const allowed = {}; for (const key of ['size','roam','chatter','sound','topmost','reducedMotion']) if (Object.hasOwn(patch, key)) allowed[key] = patch[key];
    model.settings = normalize({ ...model.settings, ...allowed });
    pet.setAlwaysOnTop(model.settings.topmost && !room?.isFocused(), 'floating');
    const next = { width: Math.round(340 * model.settings.size), height: Math.round(340 * model.settings.size) };
    if (next.width !== size.width) { const bottom = point.y + size.height; size = next; point.y = bottom - size.height; pet.setSize(size.width, size.height); point = constrain(point, areaAt(point), size); place(); }
    if ((!model.settings.roam || model.settings.reducedMotion) && model.state === 'walk') model.setState('idle', 8000, Date.now());
    save(); broadcast(true);
  });
  channel('anon:hit', (event, hit) => {
    if (event.sender !== pet.webContents || drag) return;
    if (ignored === !hit) return; ignored = !hit; pet.setIgnoreMouseEvents(ignored, { forward: true });
  });
  channel('anon:drag', (event, active) => {
    if (event.sender !== pet.webContents) return;
    if (active && !drag) {
      const c = screen.getCursorScreenPoint(); drag = { dx: c.x - point.x, dy: c.y - point.y, vx: 0, vy: 0 }; flight = null;
      ignored = false; pet.setIgnoreMouseEvents(false); model.act('drag');
    } else if (!active && drag) {
      flight = { vx: clamp(drag.vx, -1500, 1500), vy: clamp(drag.vy, -1300, 1300) }; drag = null; model.act('drop');
    }
    broadcast(true);
  });
  screen.on('display-removed', home); screen.on('display-metrics-changed', () => { point = constrain(point, areaAt(point), size); place(); });
  powerMonitor.on('suspend', () => { suspended = true; }); powerMonitor.on('resume', () => { suspended = false; lastTime = Date.now(); });
  lastTime = Date.now(); timer = setInterval(tick, 1000 / 30);
  if (!saved.savedAt && !testMode) openRoom();
}
function tick() {
  if (suspended || !pet || pet.isDestroyed()) return;
  const now = Date.now(); const dt = clamp((now - lastTime) / 1000, .001, .05); lastTime = now;
  if (model.tick(now) && Notification.isSupported() && !testMode) new Notification({ title: '爱音：辛苦啦！', body: '专注时间结束，起来伸个懒腰吧。', silent: !model.settings.sound }).show();
  if (!hidden) {
    if (drag) {
      const c = screen.getCursorScreenPoint(); const a = screen.getDisplayNearestPoint(c).workArea;
      const next = constrain({ x: c.x - drag.dx, y: c.y - drag.dy }, a, size);
      drag.vx = (next.x - point.x) / dt * .45 + drag.vx * .55; drag.vy = (next.y - point.y) / dt * .45 + drag.vy * .55; point = next; place();
    } else if (flight) {
      const next = physics({ ...point, ...flight }, areaAt(point), size, dt); point = { x: next.x, y: next.y }; flight = next.settled ? null : { vx: next.vx, vy: next.vy }; place();
    } else if (['walk', 'follow'].includes(model.state) && !model.settings.reducedMotion) {
      const a = areaAt(point); let speed = model.state === 'follow' ? 100 : 38;
      if (model.state === 'follow') {
        const c = screen.getCursorScreenPoint(); const delta = c.x - (point.x + size.width / 2); model.direction = delta < 0 ? -1 : 1;
        if (Math.abs(delta) < 35) speed = 0;
      }
      const next = constrain({ x: point.x + speed * model.direction * dt, y: point.y }, a, size);
      if (Math.abs(next.x - point.x) < .01 && speed) model.direction *= -1;
      point = next; place();
    }
  }
  if (now - lastSave > 15000) { save(); lastSave = now; }
  // UI stats refresh at 4 Hz; physical movement stays smooth at 30 Hz.
  if (Math.floor(now / 250) !== Math.floor((now - dt * 1000) / 250)) broadcast();
}
app.on('before-quit', () => { clearInterval(timer); save(); tray?.destroy(); });
app.on('window-all-closed', () => {});
