const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const app = await electron.launch({ executablePath: require('electron'), args: [path.resolve(__dirname, '..'), '--smoke-test'], timeout: 60000 });
  try {
    const page = await app.firstWindow(); await page.waitForFunction(() => !!window.anonArt?.frames);
    await page.evaluate(() => window.anon.settings({ roam: false, chatter: false }));
    const report = await app.evaluate(({ BrowserWindow, screen }, root) => {
      const { applyPetBounds } = process.mainModule.require(root + '/src/window-bounds.cjs');
      const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('pet.html'));
      const before = w.getBounds(), samples = [];
      const area = screen.getDisplayMatching(before).workArea;
      for (let i = 0; i < 300; i++) {
        applyPetBounds(w, { x: before.x - i % 10, y: before.y }, { width: 240, height: 240 }, area); const bounds = w.getBounds(); samples.push(bounds);
        if (bounds.width > 450) break;
      }
      const resizeSamples = [];
      for(let i=0;i<6;i++)for(const scale of [.6,1.35,.75,1.2,1]) {
        const size={width:Math.round(240*scale),height:Math.round(240*scale)};
        applyPetBounds(w,{x:area.x+area.width-size.width,y:area.y+area.height-size.height},size,area);
        resizeSamples.push({expected:size.width,actual:w.getBounds()});
      }
      return { before, after: w.getBounds(), min: w.getMinimumSize(), samples, resizeSamples, area, displays: screen.getAllDisplays().map(d => ({ scale: d.scaleFactor, area: d.workArea })) };
    }, path.resolve(__dirname, '..'));
    for(const b of report.samples)assert.ok(Math.abs(b.width-240)<=2&&Math.abs(b.height-240)<=2,'300 repeated placements must keep the intended size');
    for(const {expected,actual:b} of report.resizeSamples){assert.ok(Math.abs(b.width-expected)<=2,'alternating resize must not accumulate rounding');assert.ok(b.x+b.width<=report.area.x+report.area.width+1&&b.y+b.height<=report.area.y+report.area.height+1,'actual outer frame must stay inside work area');}
    await page.evaluate(()=>window.anon.home());await page.waitForTimeout(100);
    await app.evaluate(({BrowserWindow,screen})=>{
      const b=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html')).getBounds();
      globalThis.originalCursor=screen.getCursorScreenPoint;
      globalThis.testCursor={x:b.x+90,y:b.y+120};screen.getCursorScreenPoint=()=>({...globalThis.testCursor});
    });
    await page.evaluate(()=>window.anon.drag(true));
    await app.evaluate(()=>{globalThis.testCursor.x-=320;globalThis.testCursor.y-=260;});
    await page.waitForTimeout(180);
    await page.evaluate(()=>window.anon.drag(false));await page.waitForFunction(()=>document.body.dataset.state==='happy');
    const bounds=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html')).getBounds());
    const dropped=await bounds();await page.waitForTimeout(8500);const rested=await bounds();
    assert.deepEqual(rested,dropped,'fixed pet must stay exactly where it was dropped, without gravity or autonomous movement');
    await page.evaluate(()=>window.anon.settings({pinned:false}));await page.evaluate(()=>window.anon.drag(true));
    await app.evaluate(()=>{globalThis.testCursor.y-=100;});await page.waitForTimeout(100);await page.evaluate(()=>window.anon.drag(false));await page.waitForTimeout(2200);
    const landed=await bounds();assert.ok(landed.y+landed.height<=report.area.y+report.area.height+1,'optional gravity must stay above taskbar');
    await app.evaluate(({screen})=>{screen.getCursorScreenPoint=globalThis.originalCursor;});
    require('node:fs').writeFileSync(path.resolve(__dirname,'../test-results/window-check.json'),JSON.stringify({...report,dropped,rested,landed},null,2));
    console.log('PASS: 300 native placements, 30 alternating resizes, actual work-area confinement, fixed drop/idle position, and optional gravity at '+report.displays.map(d=>d.scale*100+'%').join(', ')+' display scale.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
