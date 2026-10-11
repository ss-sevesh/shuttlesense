import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readdirSync,writeFileSync} from 'node:fs';

test('Paris434 upload completes selected analysis through the real worker and reopens',async({page,request})=>{
  test.setTimeout(1800000);
  const file=readdirSync('.').find(name=>name.endsWith('350_434.mp4'))!;
  expect(file).toBeTruthy();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?analysis=c278680c-fb33-4b1c-91d1-8daa17db95f6');
  await page.getByRole('button',{name:'Upload Match',exact:true}).click();
  await page.getByLabel('Match video',{exact:true}).setInputFiles(file);
  await expect(page.locator('.local-preview')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.preview-file strong')).toHaveText(file);
  const video=page.locator('.analysis-video video');
  expect(await video.evaluate((v:HTMLVideoElement)=>v.duration)).toBeCloseTo(84,0);
  await page.getByRole('button',{name:'Mark court corners',exact:true}).click();
  for(const [x,y] of [[.36015625,.45138889],[.63828125,.45138889],[.78046875,.93055556],[.221875,.93055556]]) {
    const picker=page.locator('.corner-picker');const box=(await picker.boundingBox())!;
    await picker.click({position:{x:x*box.width,y:y*box.height}});
  }
  await page.getByLabel('Estimated shot types (BST)',{exact:true}).check();
  await page.getByLabel('Near-player ending review',{exact:true}).check();
  expect((await new AxeBuilder({page}).include('.upload-modal').analyze()).violations.map(v=>v.id)).toEqual([]);
  await page.screenshot({path:'artifacts/paris434-upload-setup.png',fullPage:true});
  const response=page.waitForResponse(r=>r.url().endsWith('/api/analysis')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Analyze Rallies & Poses',exact:true}).click();
  const started=await response;expect(started.ok(),await started.text()).toBe(true);
  const {id}=await started.json();writeFileSync('artifacts/paris434-current-upload.json',JSON.stringify({id,file},null,2));
  let lastStage='';
  await expect.poll(async()=>{
    const job=await (await request.get('/api/analysis/'+id)).json();
    if(job.stage!==lastStage){lastStage=job.stage;console.log('Upload:',job.stage,job.progress);}
    if(job.status==='failed')throw new Error(job.error);
    return job.status;
  },{timeout:1700000,intervals:[5000,10000]}).toBe('complete');
  const job=await (await request.get('/api/analysis/'+id)).json();
  expect(job.result.fileName).toBe(file);
  expect(job.result.options).toMatchObject({yolo:true,shuttle:true,ground:true,pose:true,shots:true,ending:true,llm:false});
  expect(job.result.shuttle.some((s:{point:unknown})=>s.point)).toBe(true);
  expect(job.result.rallies.some((r:{end:number|null})=>r.end!==null)).toBe(true);
  expect(job.result.endingReview.some((e:{evidence:unknown})=>e.evidence)).toBe(true);
  await expect(page).toHaveURL(new RegExp('/review/'+id+'$'),{timeout:15000});
  await expect(page.getByRole('heading',{name:'Your recording',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Lost rally review'})).toContainText('No confirmed losses yet');
  await page.screenshot({path:'artifacts/paris434-upload-result.png',fullPage:true});
  expect(errors).toEqual([]);
});
