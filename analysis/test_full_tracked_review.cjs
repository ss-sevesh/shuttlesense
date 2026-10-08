const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('@playwright/test');
(async()=>{
 const [url,reportPath]=process.argv.slice(2);
 assert(url&&reportPath,'Pass review URL and its results.json');
 const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
 const expected=report.settings.end_s-report.settings.start_s;
 const browser=await chromium.launch({channel:'chrome'});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  const video=page.locator('video');
  assert(Math.abs(await video.evaluate(v=>v.duration)-expected)<.1);
  assert.equal(await page.getByRole('button',{name:/Possible rally/}).count(),report.rallies.length);
  assert.equal(await page.locator('figure img').count(),2);
  for(const t of [1,expected/2,expected-1]) {
   await video.evaluate((v,t)=>{v.pause();v.currentTime=t},t);
   await page.waitForFunction(t=>{const v=document.querySelector('video');return !v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-t)<.1},t);
   assert.equal(await video.evaluate(v=>v.error),null);
  }
  const event=page.locator('[data-start]').first();
  if(await event.count()) {
   const end=Number(await event.getAttribute('data-end'));
   await event.click();
   await page.waitForFunction(()=>!document.querySelector('video').paused);
   await video.evaluate((v,t)=>v.currentTime=t,Math.max(0,end-.3));
   await page.waitForFunction(()=>document.querySelector('video').paused,null,{timeout:5000});
   const stopped=await video.evaluate(v=>v.currentTime);
   assert(stopped>=end&&stopped<end+.5);
  }
  await page.getByRole('button',{name:'Play full clip',exact:true}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('video');return !v.paused&&v.currentTime<2});
  await video.evaluate(v=>{v.pause();v.currentTime=10});
  await page.waitForFunction(()=>!document.querySelector('video').seeking);
  assert.match(await page.locator('#pose').innerText(),/Elbow L \/ R/);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'artifacts/full-tracked-review.png',fullPage:false});
  await page.locator('figure').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/full-tracked-heatmaps.png',fullPage:false});
  const range=await page.request.get(new URL('/source.mp4',url).href,{headers:{Range:'bytes=100-199'}});
  assert.equal(range.status(),206);assert.equal((await range.body()).length,100);
  assert.equal((await page.request.get(new URL('/AGENTS.md',url).href)).status(),404);
  const archive=await page.request.get(new URL('/rallies.zip',url).href,{headers:{Range:'bytes=0-3'}});
  assert.equal(archive.status(),206);assert.equal((await archive.body()).subarray(0,2).toString(),'PK');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({duration:expected,rallies:report.rallies.length,seeks:'start/middle/end',pageErrors:errors}));
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
