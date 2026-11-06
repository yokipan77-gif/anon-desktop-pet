const { chromium } = require('playwright-core');
const { readFileSync } = require('node:fs');
const path = require('node:path');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try { const page=await browser.newPage({viewport:{width:256,height:256},deviceScaleFactor:1}); await page.setContent('<style>html,body{margin:0;background:transparent}</style>'+readFileSync(path.join(__dirname,'../assets/icon.svg'),'utf8')); await page.screenshot({path:path.join(__dirname,'../assets/icon.png'),omitBackground:true}); }
  finally { await browser.close(); }
})();
