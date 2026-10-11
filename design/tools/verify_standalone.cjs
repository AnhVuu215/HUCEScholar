const {chromium}=require('C:/Users/Tuan Anh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const target=path.resolve(__dirname,'../../docs/deliverables/HUCEScholar_Wireframe_Prototype.html');
    await page.goto(pathToFileURL(target).href);
    assert.equal(await page.locator('.document-row').count(),4);
    await page.locator('#screen-map').click();assert.equal(await page.locator('[data-screen-map]').count(),20);
    await page.locator('[data-screen-map][href="#/reader/1/2"]').click();
    await page.locator('.pdf-paper').waitFor();assert.match(await page.locator('#main').innerText(),/Ghi chú của tôi/);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.resolve(__dirname,'../_qa/standalone-verification.json'),JSON.stringify({status:'passed',format:'Offline single-file HTML',checks:['All four initial catalog entries render','20-screen map works','Reader and note panel open','No uncaught JavaScript error'],externalNetworkRequired:false},null,2));
    console.log('Standalone offline prototype: passed');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
