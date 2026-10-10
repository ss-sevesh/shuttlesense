import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';

const id=JSON.parse(readFileSync('artifacts/paris434-shot-job.json','utf8')).id;
test('only confirmed losses receive bounded local coaching',async ({request})=>{
  test.setTimeout(120000);
  const endpoint=`/api/analysis/${id}/landing`;
  const headers={origin:'http://127.0.0.1:3000'};
  const data=(await (await request.get(`/api/analysis/${id}`)).json()).result;
  const saved=await (await request.get(`${endpoint}?losses=1`)).json();
  expect(saved.outcomes).toEqual({'3':'lost','5':'lost'});
  expect((await request.post(endpoint,{headers,data:{rallyId:2}})).status()).toBe(422);
  expect((await request.post(endpoint,{headers,data:{rallyId:3,outcome:'bad'}})).status()).toBe(400);
  expect((await request.post(endpoint,{headers,data:{rallyId:3,outcome:['lost']}})).status()).toBe(400);
  expect((await request.post(endpoint,{headers:{origin:'https://example.com'},data:{rallyId:3}})).status()).toBe(403);
  for(const outcome of ['won','unknown']) {
    try {
      expect((await request.post(endpoint,{headers,data:{rallyId:3,outcome}})).ok()).toBe(true);
      expect((await request.post(endpoint,{headers,data:{rallyId:3}})).status()).toBe(409);
    } finally { expect((await request.post(endpoint,{headers,data:{rallyId:3,outcome:'lost'}})).ok()).toBe(true); }
  }
  // Existing five-frame answer is reused; this never starts full-video shot coaching.
  const response=await request.post(endpoint,{headers,data:{rallyId:3}});
  expect(response.ok()).toBe(true);
  const report=await response.json();
  expect(report.coaching.status).toBe('experimental');expect(report.rallyId).toBe(3);
  expect(report.coaching.model).toBe('Qwen/Qwen3-VL-2B-Instruct');
  for(const r of data.rallies.filter((r:{end:number|null})=>r.end!==null)) {
    const report=await (await request.get(`${endpoint}?frame=${Math.round(r.end*data.fps)}&rally=${r.id}`)).json();
    expect(report.frames).toHaveLength(5);
    expect(report.frames[0]).toBeGreaterThanOrEqual(Math.max(r.start,r.end-2)*data.fps-1);
    expect(report.frames[4]).toBeLessThan(Math.round(r.end*data.fps));
  }
});

test('loss-first review keeps technical tables closed and replay, heatmap and evidence accessible',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto(`/review/${id}`);
  const region=page.getByRole('region',{name:'Lost rally review'});
  await expect(region.getByRole('heading',{name:'2 lost rallies'})).toBeVisible();
  await expect(region.getByRole('group',{name:'Lost rallies'}).getByRole('button')).toHaveCount(2);
  await expect(page.getByRole('region',{name:'Shot contacts'})).not.toBeVisible();
  await expect(page.getByRole('region',{name:'Near-side hit poses'})).not.toBeVisible();
  await expect(region.getByRole('heading',{name:'Try next time'})).toBeVisible();
  await region.getByRole('button',{name:'Loss 2 · 81.5 s',exact:true}).click();
  await expect(region.getByRole('heading',{name:'What happened before 81.5 s?'})).toBeVisible();
  await region.getByRole('button',{name:'Show attempt at 80.533 s',exact:true}).click();
  const video=page.locator('.review-camera video');
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeCloseTo(80.533333,2);
  expect(await video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
  await expect.poll(()=>video.evaluate(v=>Math.abs(v.getBoundingClientRect().top))).toBeLessThan(2);
  await expect(page.locator('[data-ending-distance]')).toHaveCount(1);
  await expect(region.getByRole('heading',{name:'Try next time'})).toBeVisible();
  await region.getByText('See the five frames used by the AI',{exact:true}).click();
  await expect(region.locator('.contact-frames figure')).toHaveCount(5);
  await region.locator('.loss-frames').scrollIntoViewIfNeeded();
  await expect.poll(()=>region.locator('img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.screenshot({path:'artifacts/paris434-loss-review.png',fullPage:true});
  expect((await new AxeBuilder({page}).include('main').analyze()).violations).toEqual([]);
  await region.getByText('Correct rally outcomes',{exact:true}).click();
  try {
    await region.getByRole('combobox',{name:'Outcome for rally 5'}).selectOption('won');
    await expect(region.getByRole('heading',{name:'1 lost rally',exact:true})).toBeVisible();
    await expect(region.getByRole('button',{name:'Loss 2 · 81.5 s',exact:true})).toHaveCount(0);
    await region.getByRole('combobox',{name:'Outcome for rally 5'}).selectOption('lost');
  } finally { await request.post(`/api/analysis/${id}/landing`,{headers:{origin:'http://127.0.0.1:3000'},data:{rallyId:5,outcome:'lost'}}); }
  await expect(region.getByRole('heading',{name:'2 lost rallies'})).toBeVisible();
  for(const width of [320,768,1024,1440]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/paris434-loss-review-mobile.png',fullPage:true});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download reviewed JSON'}).click();
  const exported=JSON.parse(readFileSync((await (await download).path())!,'utf8'));
  expect(exported.lossReviews.outcomes).toEqual({'3':'lost','5':'lost'});
  expect(exported.lossReviews.explanations['5'].rallyId).toBe(5);
  await page.reload();await expect(region.getByRole('heading',{name:'2 lost rallies'})).toBeVisible();
  await page.keyboard.press('Tab');expect(await page.locator(':focus').count()).toBe(1);
  expect(errors).toEqual([]);
});
