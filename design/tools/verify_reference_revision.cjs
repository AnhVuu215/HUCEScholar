// Targeted checks for the reference-led visual revision, not a production audit.
const {chromium}=require('C:/Users/Tuan Anh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const out=path.resolve(__dirname,'../_qa');
const base='file:///'+path.resolve(__dirname,'../wireframe/index.html').replaceAll('\\','/');
let browser;
const checks=[];
const luminance=color=>{
  const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
};
(async()=>{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1253,height:900}});
  await page.goto(base+'#/catalog');
  await page.locator('.continue-reading a').click();
  assert.match(page.url(),/reader\/1\/2\/2$/);checks.push('Continue reading opens the stored document, version and page');
  await page.fill('#page-number','3');await page.locator('#page-number').press('Tab');
  await page.goto(base+'#/catalog');
  assert.equal(await page.locator('.continue-reading a').getAttribute('href'),'#/reader/1/2/3');checks.push('Continue reading follows updated in-memory progress');
  await page.screenshot({path:path.join(out,'desktop-catalog-1253.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('Catalog has no body overflow at reference browser width 1253px');
  const pairs=await page.evaluate(()=>{
    const style=s=>getComputedStyle(document.querySelector(s));
    return [
      {name:'sidebar navigation',fg:style('.nav a').color,bg:style('.sidebar').backgroundColor},
      {name:'main heading',fg:style('.catalog-intro h1').color,bg:style(':root').backgroundColor},
      {name:'body metadata',fg:style('.row-meta').color,bg:style('.document-row').backgroundColor},
      {name:'search button',fg:style('.search-row .button').color,bg:style('.search-row .button').backgroundColor},
    ];
  });
  const contrasts=pairs.map(p=>{const a=luminance(p.fg),b=luminance(p.bg);return {...p,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
  for(const p of contrasts)assert.ok(p.ratio>=4.5,`${p.name}: ${p.ratio}`);
  checks.push('Four representative foreground/background pairs meet 4.5:1 contrast');
  await page.selectOption('#role','lecturer');await page.goto(base+'#/catalog');
  assert.match(await page.locator('.continue-reading').innerText(),/Góc học tập/);checks.push('Role with no progress gets personal-library fallback');
  await page.goto(base+'#/login');await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(out,'mobile-login.png'),fullPage:true});
  await page.goto(base+'#/books');await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:path.join(out,'desktop-books.png'),fullPage:true});
  fs.writeFileSync(path.join(out,'reference-revision-verification.json'),JSON.stringify({date:'2026-10-11',status:'passed',checks,contrasts,scope:'Static in-memory prototype; representative contrast only, not full accessibility audit'},null,2));
  await browser.close();console.log(JSON.stringify({status:'passed',checks:checks.length}));
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
