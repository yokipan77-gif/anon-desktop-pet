// Verify rendered alpha against input hit regions, motion limits, and reduced motion.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');const http=require('node:http');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const allowed={'/test/art.html':'text/html','/src/art.js':'text/javascript','/assets/anon-atlas.png':'image/png'};
  const server=http.createServer((req,res)=>{if(!allowed[req.url]){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',allowed[req.url]);fs.createReadStream(path.join(root,req.url)).pipe(res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:988,height:1170},deviceScaleFactor:1,...(process.env.ANON_RECORD?{recordVideo:{dir:path.join(root,'test-results/video'),size:{width:988,height:1170}}}:{})});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/test/art.html`);
    await page.evaluate(()=>{
      window.previews=[];
      const labels={idle:'安静陪伴 · 眨眼与呼吸',walk:'散步 · 轻轻踏步',happy:'摸摸头 · 心情很好',guitar:'吉他 · 专属练习时间',sleep:'小憩 · 安稳呼吸',held:'抱起来 · 晃晃小腿',dance:'一起摇摆 · 跟上节拍',jump:'跳一下 · 嘿咻！',stretch:'伸个懒腰 · 活动一下'};
      for(const [state,label] of Object.entries(labels)){
        const section=document.createElement('section'),canvas=document.createElement('canvas'),caption=document.createElement('label');caption.textContent=label;section.append(canvas,caption);document.querySelector('main').append(section);
        previews.push({art:new AnonArt(canvas),snapshot:{state,revision:0,direction:1,settings:{quality:'balanced',trackCursor:true,reducedMotion:false},gaze:{x:.6,y:0}}});
      }
    });
    await page.waitForFunction(()=>previews.length===9&&previews.every(p=>p.art.ready));
    const report=await page.evaluate(()=>{
      let compared=0;const mismatches=[];
      for(const {art,snapshot} of previews){
        for(let t=0;t<=900;t+=25)art.draw(snapshot,1000+t);
        if(!art.gl)throw new Error('WebGL required for GPU hit-region verification');
        const gl=art.gl,w=art.canvas.width,h=art.canvas.height,b=art.canvas.getBoundingClientRect(),pixels=new Uint8Array(w*h*4);
        gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        for(let y=5;y<h;y+=13)for(let x=5;x<w;x+=13){
          const alpha=pixels[((h-1-y)*w+x)*4+3];if(alpha>20&&alpha<180)continue;
          const hit=art.hit(b.left+(x+.5)*b.width/w,b.top+(y+.5)*b.height/h);compared++;
          if(hit!==(alpha>100))mismatches.push({state:snapshot.state,x,y,alpha,hit});
        }
      }
      const art=previews[0].art,snapshot=previews[0].snapshot;
      const moving=Array.from(art.positions);art.draw(snapshot,2400);const moved=moving.some((v,i)=>Math.abs(v-art.positions[i])>.0001);
      const resting={...snapshot,settings:{...snapshot.settings,reducedMotion:true}};art.draw(resting,2500);const still=Array.from(art.positions);art.draw(resting,5000);
      const stable=still.every((v,i)=>v===art.positions[i]);
      // Restore the showcase to its normal pose.
      art.draw(snapshot,5100);
      return{compared,mismatches,moved,stable,diagnostics:previews.map(p=>p.art.diagnostics())};
    });
    assert.ok(report.compared>3000);assert.deepEqual(report.mismatches,[]);assert.equal(report.moved,true);assert.equal(report.stable,true);assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(root,'docs/actions.png'),fullPage:true});
    if(process.env.ANON_RECORD){
      await page.evaluate(()=>{for(const p of previews){p.art.started=performance.now();p.art.lastDraw=-Infinity;}function animate(now){for(const p of previews){if(['jump','stretch'].includes(p.snapshot.state)&&now-p.art.started>6000)p.snapshot.revision++;p.art.draw(p.snapshot,now);}requestAnimationFrame(animate);}requestAnimationFrame(animate);});
      await page.waitForTimeout(8500);const video=page.video();await page.close();await video.saveAs(path.join(root,'test-results/motion.webm'));
    }
    // Simulate a driver that refuses WebGL; the fallback must still draw and hit-test.
    const fallback=await browser.newPage();
    await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args);};});
    await fallback.goto(`http://127.0.0.1:${server.address().port}/test/art.html`);
    await fallback.evaluate(()=>{const c=document.createElement('canvas');document.querySelector('main').append(c);window.art=new AnonArt(c);});
    await fallback.waitForFunction(()=>art.ready);
    const result=await fallback.evaluate(()=>{art.draw({state:'idle',revision:0,direction:1,settings:{reducedMotion:false}},1000);const b=art.canvas.getBoundingClientRect();return {renderer:art.diagnostics().renderer,center:art.hit(b.left+b.width*.5,b.top+b.height*.4),corner:art.hit(b.left+2,b.top+2)};});
    assert.deepEqual(result,{renderer:'canvas-2d',center:true,corner:false});report.fallback=result;
    require('node:fs').writeFileSync(path.join(root,'test-results/art.json'),JSON.stringify(report,null,2));
    console.log(`PASS: ${report.compared} GPU-alpha / mouse-hit comparisons across nine poses; continuous motion and reduced-motion stability.`);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
