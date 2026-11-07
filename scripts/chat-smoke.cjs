const {_electron:electron}=require('playwright-core');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
(async()=>{
  const root=path.resolve(__dirname,'..'),requests=[],profile='chat-'+process.pid+'-'+Date.now();
  const server=http.createServer(async(req,res)=>{
    let text='';for await(const chunk of req)text+=chunk;const body=text?JSON.parse(text):{};
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'unit-chat'},{name:'bge-m3'}]}));return;}
    if(req.url==='/api/show'){res.end(JSON.stringify({capabilities:['completion']}));return;}
    if(req.url!=='/api/chat'){res.writeHead(404);res.end('{}');return;}
    requests.push(body);
    if(body.model==='unit-slow'){const timer=setTimeout(()=>res.end(JSON.stringify({message:{content:'迟到的回复'}})),30000);res.on('close',()=>clearTimeout(timer));return;}
    if(body.model==='unit-broken'){res.writeHead(500);res.end('private-server-detail');return;}
    const last=body.messages.at(-1).content;
    res.end(JSON.stringify({message:{content:last.includes('<img')?'这句内容会作为普通文字显示。':'小悠，物理复习加油！学累了就休息一下，我会在这里陪你。'}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let app,room,pet,userData;const errors=[];
  async function launch(){
    app=await electron.launch({executablePath:process.env.ANON_EXE||require('electron'),args:[...(process.env.ANON_EXE?[]:[root]),'--smoke-test','--smoke-profile='+profile],timeout:60000});
    app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));pet=await app.firstWindow();await pet.waitForFunction(()=>window.anonArt?.frames>0);
    const pending=app.waitForEvent('window');await pet.evaluate(()=>window.anon.room('chat'));room=await pending;await room.waitForSelector('#chat-section:not([hidden])');await room.waitForFunction(()=>document.querySelector('#deepseek-model').value.length>0);room.on('dialog',d=>d.accept());
  }
  async function save(){await room.locator('#connection-form button[type=submit]').click();await room.waitForFunction(()=>document.querySelector('#chat-status').textContent.includes('设置已保存'));}
  async function model(name){await room.locator('#ollama-model').fill(name);await save();}
  async function send(text,count){await room.locator('#chat-input').fill(text);await room.locator('#chat-send').click();await room.waitForFunction(n=>document.querySelectorAll('.message').length===n,count);await room.waitForFunction(()=>document.querySelector('#chat-status').textContent.includes('已回复'));}
  try{
    await launch();await room.locator('#api-key').fill('sk-electron-test-not-real');assert.equal(await room.locator('#chat-send').isDisabled(),true);await save();assert.equal(await room.locator('#api-key').inputValue(),'');
    const security=await app.evaluate(({app,safeStorage})=>{const fs=process.mainModule.require('node:fs'),path=process.mainModule.require('node:path');const raw=fs.readFileSync(path.join(app.getPath('userData'),'chat-config.json'),'utf8'),config=JSON.parse(raw);return{encrypted:!raw.includes('sk-electron-test-not-real'),decrypts:safeStorage.decryptString(Buffer.from(config.encryptedKey,'base64'))==='sk-electron-test-not-real'};});assert.deepEqual(security,{encrypted:true,decrypts:true});
    const snapshot=await room.evaluate(()=>window.anon.chat.get());assert.equal(snapshot.data.config.encryptedKey,undefined);assert.equal(snapshot.data.config.hasKey,true);
    await room.locator('#chat-provider').selectOption('ollama');assert.equal(await room.locator('#chat-send').isDisabled(),true);await room.locator('#ollama-url').fill('http://127.0.0.1:'+server.address().port);await room.locator('#detect-models').click();await room.waitForFunction(()=>document.querySelector('#ollama-model').value==='unit-chat');await save();
    await room.locator('#test-connection').click();await room.waitForFunction(()=>document.querySelector('#chat-status').textContent.includes('连接成功'));
    await room.locator('#memory-notes').fill('称呼我小悠。我正在复习物理。');await room.locator('#save-memory').click();await room.waitForFunction(()=>document.querySelector('#chat-status').textContent.includes('长期记忆已保存'));
    await send('爱音，我今天有点紧张。',2);await send('还记得我在准备什么吗？',4);
    assert.match(requests[1].messages[0].content,/小悠/);assert.equal(requests[1].messages.length,4);
    await room.locator('.remember-button').first().click();await room.waitForFunction(()=>document.querySelector('#memory-notes').value.includes('今天有点紧张'));
    await model('unit-slow');await room.locator('#chat-input').fill('这条消息取消');await room.locator('#chat-send').click();await room.waitForFunction(async()=>(await window.anon.chat.get()).data.busy);await room.locator('#chat-cancel').click();await room.waitForFunction(()=>document.querySelector('#chat-status').textContent.includes('已取消'));assert.equal(await room.locator('.message').count(),4);assert.equal(await room.locator('#chat-input').inputValue(),'这条消息取消');
    await model('unit-broken');await room.locator('#chat-send').click();await room.waitForFunction(()=>document.querySelector('#chat-status').textContent.includes('HTTP 500'));assert.equal(await room.locator('.message').count(),4);assert.ok(!(await room.locator('#chat-status').textContent()).includes('private-server-detail'));
    await model('unit-chat');await send('<img src=x onerror="window.pwned=true">',6);assert.equal(await room.locator('#chat-log img').count(),0);assert.equal(await room.evaluate(()=>window.pwned),undefined);
    await room.locator('#chat-input').fill('这是一条还没发出的草稿');userData=await app.evaluate(({app})=>app.getPath('userData'));await app.close();app=null;
    await launch();assert.equal(await room.locator('.message').count(),6);assert.equal(await room.locator('#chat-input').inputValue(),'这是一条还没发出的草稿');assert.match(await room.locator('#memory-notes').inputValue(),/小悠/);assert.equal((await room.evaluate(()=>window.anon.chat.get())).data.config.hasKey,true);
    await room.locator('.memory-card details').evaluate(el=>el.open=true);await room.locator('#clear-history').click();await room.waitForFunction(()=>document.querySelectorAll('.message').length===0);assert.match(await room.locator('#memory-notes').inputValue(),/小悠/);
    await send('爱音，陪我复习一会儿吧。',2);await room.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0);});await room.screenshot({path:path.join(root,'docs/chat.png'),fullPage:true});
    await room.locator('#clear-memory').click();await room.waitForFunction(()=>document.querySelector('#memory-notes').value==='');assert.equal(await room.locator('.message').count(),0);
    await room.locator('#chat-provider').selectOption('deepseek');await room.locator('#delete-key').click();await room.waitForFunction(()=>document.querySelector('#delete-key').hidden);
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(root,'test-results/chat-smoke.json'),JSON.stringify({passed:true,security,requests:requests.length,restartRestored:true,errors,userData},null,2));
    console.log('PASS: chat UI, real Windows key encryption, model detection, request context, pinning, cancellation, errors, escaped text, restart recovery, and selective memory deletion.');
  }finally{if(app)await app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
