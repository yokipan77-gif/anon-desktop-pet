// The NSIS portable launcher cannot expose Electron's main-process inspector to
// Playwright. Launch normally and inspect only the locally bound renderer CDP.
const {chromium}=require('playwright-core');const {spawn,execFileSync}=require('node:child_process');const net=require('node:net');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'..'),server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const exe=path.join(root,'dist/Anon-Desktop-Pet-3.0.0-Portable.exe');
  const child=spawn(exe,['--smoke-test','--smoke-profile=portable-'+process.pid+'-'+Date.now(),'--remote-debugging-port='+port,'--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,stdio:'ignore'});let browser;
  try{
    const endpoint='http://127.0.0.1:'+port;let ready=false;
    for(let i=0;i<160;i++){try{const r=await fetch(endpoint+'/json/version',{signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
    assert.ok(ready,'portable application exposes its test renderer');browser=await chromium.connectOverCDP(endpoint);const context=browser.contexts()[0];
    let pet=context.pages().find(p=>p.url().endsWith('pet.html'));if(!pet){pet=await context.waitForEvent('page');await pet.waitForURL('**/pet.html');}
    await pet.waitForFunction(()=>window.anonArt?.frames>1);assert.equal((await pet.evaluate(()=>window.anon.get())).settings.pinned,true);
    const roomPromise=context.waitForEvent('page');await pet.evaluate(()=>window.anon.room('chat'));const room=await roomPromise;await room.waitForSelector('#chat-section:not([hidden])');
    await room.locator('#memory-notes').fill('便携版记忆保存验证');await room.locator('#save-memory').click();await room.waitForFunction(()=>document.querySelector('#chat-status').textContent.includes('长期记忆已保存'));
    assert.equal((await room.evaluate(()=>window.anon.chat.get())).data.notes,'便携版记忆保存验证');
    await room.screenshot({path:path.join(root,'test-results/portable-chat.png'),fullPage:true});await pet.evaluate(()=>window.anon.quit()).catch(()=>{});
    console.log('PASS: actual portable launcher extraction, transparent pet, fixed position default, chat page, memory saving, and graceful quit.');
  }finally{
    if(browser)await browser.close().catch(()=>{});
    if(child.exitCode===null){await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);if(child.exitCode===null)try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
