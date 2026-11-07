const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
(async()=>{
  const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'test-results'),{recursive:true});fs.mkdirSync(path.join(root,'docs'),{recursive:true});
  const executablePath=process.env.ANON_EXE||require('electron');
  const app=await electron.launch({executablePath,args:[...(process.env.ANON_EXE?[]:[root]),'--smoke-test'],timeout:60000});
  const errors=[];let settingsPath;const listen=p=>p.on('pageerror',error=>errors.push(error.message));app.on('window',listen);
  try{
    const pet=await app.firstWindow();listen(pet);await pet.waitForFunction(()=>!!window.anon&&document.querySelector('#sprite'));
    await pet.waitForFunction(()=>window.anonArt?.frames>2);
    const hit=await pet.evaluate(()=>{const b=document.querySelector('#sprite').getBoundingClientRect();return {center:anonArt.hit(b.left+b.width*.5,b.top+b.height*.4),corner:anonArt.hit(b.left+2,b.top+2),diagnostics:anonArt.diagnostics()};});
    assert.equal(hit.center,true);assert.equal(hit.corner,false);assert.equal(hit.diagnostics.source,'original-approved-atlas');
    await pet.evaluate(()=>window.anon.settings({roam:false,chatter:false}));
    const windowInfo=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return{transparent:w.getBackgroundColor(),topmost:w.isAlwaysOnTop(),bounds:w.getBounds(),node:w.webContents.getLastWebPreferences().nodeIntegration,sandbox:w.webContents.getLastWebPreferences().sandbox};});
    assert.equal(windowInfo.node,false);assert.equal(windowInfo.sandbox,true);assert.equal(windowInfo.topmost,true);
    const roomPromise=app.waitForEvent('window');await pet.evaluate(()=>window.anon.room());
    const room=await roomPromise;listen(room);await room.waitForSelector('#preview');
    await room.waitForFunction(()=>window.anonArt?.frames>2);
    assert.equal(await room.locator('.actions [data-action]').count(),9);
    await room.locator('[data-action="pat"]').click();await room.waitForFunction(()=>document.querySelector('#pat-count').textContent==='1');
    assert.equal((await pet.evaluate(()=>window.anon.get())).state,'happy');
    await room.locator('[data-action="guitar"]').click();await pet.waitForFunction(()=>document.body.dataset.state==='guitar');
    await room.locator('[data-action="sleep"]').click();await pet.waitForFunction(()=>document.body.dataset.state==='sleep');
    await room.locator('#sleep-action').click();await pet.waitForFunction(()=>document.body.dataset.state==='happy');
    for(const action of ['feed','jump','dance','stretch']) {
      await room.locator(`[data-action="${action}"]`).click();await pet.waitForFunction(state=>document.body.dataset.state===state,action);
      await room.waitForFunction(state=>window.anonArt.state===state,action);
    }
    await room.locator('#quality').selectOption('battery');assert.equal((await pet.evaluate(()=>window.anon.get())).settings.quality,'battery');
    await room.locator('#quality').selectOption('balanced');await room.locator('#trackCursor').uncheck();
    assert.equal((await pet.evaluate(()=>window.anon.get())).settings.trackCursor,false);await room.locator('#trackCursor').check();
    await room.locator('#focus-start').click();assert.ok((await pet.evaluate(()=>window.anon.get())).focusEnd>Date.now());
    await room.locator('#focus-stop').click();assert.equal((await pet.evaluate(()=>window.anon.get())).focusEnd,0);
    await room.locator('#sound').check();assert.equal((await pet.evaluate(()=>window.anon.get())).settings.sound,true);await room.locator('#sound').uncheck();
    await pet.evaluate(()=>window.anon.settings({size:1.2}));await room.waitForFunction(()=>document.querySelector('#size-value').textContent==='120%');
    const resized=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html')).getBounds());assert.ok(Math.abs(resized.width-288)<=2,'compact size change respects Windows DPI rounding');
    await pet.evaluate(()=>window.anon.settings({size:.6}));
    await room.waitForFunction(()=>document.querySelector('#size-value').textContent==='60%');
    await room.waitForTimeout(250);
    const smallest=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html'));return{...w.getBounds(),min:w.getMinimumSize(),content:w.getContentSize()};});assert.ok(Math.abs(smallest.width-144)<=2,`60% compact size is available: ${JSON.stringify({initial:windowInfo.bounds,resized,smallest})}`);
    await pet.evaluate(()=>window.anon.settings({size:1}));
    await pet.evaluate(()=>window.anon.drag(true));assert.equal((await pet.evaluate(()=>window.anon.get())).state,'held');await pet.evaluate(()=>window.anon.drag(false));assert.equal((await pet.evaluate(()=>window.anon.get())).state,'happy');
    await pet.evaluate(()=>window.anon.home());
    await room.locator('[data-action="guitar"]').click();await room.waitForTimeout(400);
    await room.evaluate(()=>window.scrollTo(0,0));await room.screenshot({path:path.join(root,'docs/room.png'),fullPage:true});
    await room.locator('.stage').evaluate(el=>el.style.background='#172236');await room.locator('.stage').screenshot({path:path.join(root,'test-results/dark-art.png')});await room.locator('.stage').evaluate(el=>el.style.background='');
    await pet.screenshot({path:path.join(root,'docs/pet.png'),omitBackground:true});
    await room.locator('[data-action="follow"]').click();assert.equal((await pet.evaluate(()=>window.anon.get())).state,'follow');
    await pet.evaluate(()=>window.anon.settings({reducedMotion:true}));assert.equal((await pet.evaluate(()=>window.anon.get())).settings.reducedMotion,true);
    assert.deepEqual(errors,[]);
    settingsPath=await app.evaluate(({app})=>app.getPath('userData'));
    fs.writeFileSync(path.join(root,'test-results/smoke.json'),JSON.stringify({passed:true,packaged:!!process.env.ANON_EXE,windowInfo,art:hit,errors,settingsPath},null,2));
    console.log('PASS: renderer, art, IPC actions, focus, preferences, resize, drag lifecycle, isolation; screenshots saved.');
  }finally{await app.close();}
  const saved=JSON.parse(fs.readFileSync(path.join(settingsPath,'companion.json'),'utf8'));
  assert.equal(saved.pats,1);assert.equal(saved.reducedMotion,true);assert.ok(Number.isFinite(saved.x));console.log('PASS: settings and relationship survive clean shutdown.');
})().catch(error=>{console.error(error);process.exitCode=1;});
