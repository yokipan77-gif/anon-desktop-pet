'use strict';
const { app, BrowserWindow, ipcMain, Menu, Tray, screen, nativeImage, Notification, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { normalize, constrain, physics, Companion, clamp } = require('./core.cjs');
const { applyPetBounds } = require('./window-bounds.cjs');
const testMode = process.argv.includes('--smoke-test');
if (testMode) app.setPath('userData', path.join(app.getPath('temp'), 'anon-desktop-pet-test', String(process.pid)));
app.setAppUserModelId('io.github.yokipan77.anonpet');
let pet, room, tray, model, savePath, timer, lastTime, drag, flight, point, lastSent = '', lastSave = 0, hidden = false, suspended = false;
const PET_BASE_SIZE = 240;
let ignored = true, size = { width: PET_BASE_SIZE, height: PET_BASE_SIZE };
let lastPlacement = '', lastBoundsCheck = 0;
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
function place(force = false) {
  if (!pet || pet.isDestroyed()) return;
  const key = `${Math.round(point.x)},${Math.round(point.y)},${size.width},${size.height}`;
  if (!force && key === lastPlacement) return;
  point = applyPetBounds(pet, point, size, areaAt(point));
  lastPlacement = `${Math.round(point.x)},${Math.round(point.y)},${size.width},${size.height}`;
}
function recoverPosition() {
  drag = null; flight = null;
  if (model.state === 'held') model.act('drop');
  point = constrain(point, areaAt(point), size); place(true); save();
}
function home() {
  drag = null; flight = null;
  const a = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  point = constrain({ x: a.x + a.width - size.width - 40, y: a.y + a.height - size.height }, a, size);
  if (model.state === 'held') model.act('drop');
  model.act('wake'); place(); showPet(); save(); broadcast(true);
}
function showPet() { hidden = false; pet?.showInactive(); }
function syncTopmost() { if (pet && !pet.isDestroyed()) pet.setAlwaysOnTop(model.settings.topmost && !(room && !room.isDestroyed() && room.isFocused()), 'floating'); }
function openRoom() {
  if (room && !room.isDestroyed()) { room.show(); room.focus(); return; }
  room = new BrowserWindow({ width: 960, height: 760, minWidth: 760, minHeight: 650, title: '爱音的小房间', backgroundColor: '#fbf8fb', autoHideMenuBar: true, icon: path.join(__dirname, '../assets/icon.png'), titleBarStyle: 'hidden', titleBarOverlay: { color: '#fbf8fb', symbolColor: '#3a3548', height: 38 }, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  secure(room); room.loadFile(path.join(__dirname, 'room.html'));
  // Let the control room sit above the companion while it has keyboard focus.
  room.on('focus', syncTopmost);
  room.on('blur', syncTopmost);
  room.once('ready-to-show', () => room.show()); room.on('closed', () => { room = null; syncTopmost(); });
}
function menu() {
  Menu.buildFromTemplate([
    { label: '爱音的小房间', click: openRoom }, { type: 'separator' },
    { label: '摸摸头 ♡', click: () => model.act('pat') }, { label: '请她吃点心', click: () => model.act('feed') },
    { label: '弹一会儿吉他', click: () => model.act('guitar') },
    { label: '一起摇摆 ♪', click: () => model.act('dance') }, { label: '跳一下！', click: () => model.act('jump') },
    { label: '伸个懒腰', click: () => model.act('stretch') },
    { label: model.state === 'sleep' ? '叫醒爱音' : '休息一下', click: () => model.act(model.state === 'sleep' ? 'wake' : 'sleep') },
    { label: '固定位置（拖动后停在原处）', type: 'checkbox', checked: model.settings.pinned, click: item => { model.settings = normalize({ ...model.settings, pinned: item.checked }); flight = null; if (['walk','follow'].includes(model.state)) model.setState('idle', 8000, Date.now()); save(); broadcast(true); } },
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
  model = new Companion(saved); size = { width: Math.round(PET_BASE_SIZE * model.settings.size), height: Math.round(PET_BASE_SIZE * model.settings.size) };
  const a = Number.isFinite(saved.x) && Number.isFinite(saved.y) ? areaAt({ x: saved.x, y: saved.y }) : screen.getPrimaryDisplay().workArea;
  point = constrain({ x: model.settings.x ?? a.x + a.width - size.width - 40, y: model.settings.y ?? a.y + a.height - size.height }, a, size);
  pet = new BrowserWindow({ ...size, minWidth: 1, minHeight: 1, x: Math.round(point.x), y: Math.round(point.y), transparent: true, backgroundColor: '#00000000', frame: false, thickFrame: false, hasShadow: false, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, alwaysOnTop: model.settings.topmost, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true } });
  secure(pet); place(true); pet.setIgnoreMouseEvents(true, { forward: true }); pet.setAlwaysOnTop(model.settings.topmost, 'floating');
  pet.loadFile(path.join(__dirname, 'pet.html')); pet.once('ready-to-show', () => { pet.showInactive(); model.say(saved.savedAt ? '你回来啦！今天，也一起吧 ♪' : '初次见面！我是爱音。右键点我，来玩吧 ♪', Date.now()); broadcast(true); });
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png')).resize({ width: 24, height: 24 }));
  tray.setToolTip('爱音桌宠 · 双击打开小房间'); tray.on('double-click', () => { showPet(); openRoom(); }); tray.on('right-click', menu); tray.on('click', showPet);
  ipcMain.handle('anon:get', event => trusted(event) ? model.snapshot() : null);
  channel('anon:action', (_, name) => { model.act(name); broadcast(true); });
  channel('anon:room', openRoom); channel('anon:home', home); channel('anon:menu', menu); channel('anon:quit', () => app.quit());
  channel('anon:hide', () => { hidden = true; pet.hide(); });
  channel('anon:focus', (_, minutes) => { model.focus(minutes); broadcast(true); });
  channel('anon:settings', (_, patch) => {
    if (!patch || typeof patch !== 'object') return;
    const allowed = {}; for (const key of ['size','pinned','roam','chatter','sound','topmost','reducedMotion','trackCursor','quality']) if (Object.hasOwn(patch, key)) allowed[key] = patch[key];
    model.settings = normalize({ ...model.settings, ...allowed });
    syncTopmost();
    const next = { width: Math.round(PET_BASE_SIZE * model.settings.size), height: Math.round(PET_BASE_SIZE * model.settings.size) };
    if (next.width !== size.width) {
      const bottom = point.y + size.height, center = point.x + size.width / 2;
      size = next; point = { x: center - size.width / 2, y: bottom - size.height };
      place(true);
    }
    if (model.settings.pinned || model.settings.reducedMotion) flight = null;
    if ((model.settings.pinned || model.settings.reducedMotion || !model.settings.roam && model.state === 'walk') && ['walk','follow'].includes(model.state)) model.setState('idle', 8000, Date.now());
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
      flight = model.settings.pinned || model.settings.reducedMotion ? null : { vx: clamp(drag.vx, -1500, 1500), vy: clamp(drag.vy, -1300, 1300) };
      drag = null; model.act('drop'); place(); save();
    }
    broadcast(true);
  });
  screen.on('display-removed', recoverPosition); screen.on('display-metrics-changed', recoverPosition);
  powerMonitor.on('suspend', () => { suspended = true; }); powerMonitor.on('resume', () => { suspended = false; lastTime = Date.now(); recoverPosition(); });
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
    } else if (flight && !model.settings.pinned) {
      const next = physics({ ...point, ...flight }, areaAt(point), size, dt); point = { x: next.x, y: next.y }; flight = next.settled ? null : { vx: next.vx, vy: next.vy }; place();
    } else if (['walk', 'follow'].includes(model.state) && !model.settings.reducedMotion && !model.settings.pinned) {
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
  if (!hidden && now - lastBoundsCheck > 1000) {
    lastBoundsCheck = now;
    const bounds = pet.getBounds(), safe = constrain(bounds, areaAt(bounds), bounds);
    if (Math.abs(bounds.width - size.width) > 2 || Math.abs(bounds.height - size.height) > 2 || bounds.x !== safe.x || bounds.y !== safe.y) place(true);
  }
  if (now - lastSave > 15000) { save(); lastSave = now; }
  // Cursor samples stay local; the renderer smooths these low-rate updates.
  if (Math.floor(now / 125) !== Math.floor((now - dt * 1000) / 125)) {
    if (!hidden && model.settings.trackCursor && !model.settings.reducedMotion) {
      const cursor = screen.getCursorScreenPoint();
      model.gaze = { x: clamp((cursor.x - point.x - size.width * .5) / 400, -1, 1), y: clamp((cursor.y - point.y - size.height * .5) / 400, -1, 1) };
    } else model.gaze = { x: 0, y: 0 };
    broadcast();
  }
}
app.on('before-quit', () => { clearInterval(timer); save(); tray?.destroy(); });
app.on('window-all-closed', () => {});
