import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync,readdirSync} from 'node:fs';
import {shuttleContext} from '../lib/shuttle-context';
import type {ReviewData} from '../lib/analysis-review';
const id=JSON.parse(readFileSync('artifacts/paris434-shot-job.json','utf8')).id;

test('image relations use exact frame, near identity and confidence, never court coordinates',()=>{
  const person={side:'near',trackId:2,box:[.4,.5,.1,.3],court:[.1,.1],poseDetected:true,landmarks:Array(33).fill([.5,.6]),scores:Array(33).fill(.9)};
  const data={fps:30,width:1000,height:500,samples:[{time:1,people:[person]}],shuttle:[{time:1,point:[.7,.7]}]} as ReviewData;
  const row=shuttleContext(data,30,2);
  expect(row).toMatchObject({horizontal:'camera-right of player box',vertical:'within player box height',wristGapPx:206.2});
  expect(shuttleContext(data,31).status).toBe('unavailable');
  expect(shuttleContext(data,30,3).status).toBe('unavailable');
  person.scores.fill(.49);expect(shuttleContext(data,30).wristGapPx).toBeNull();
});

test('all real-recording tabs navigate, preserve recording and pass responsive accessibility',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
  await page.goto('/?analysis='+id);
  await expect(page.getByRole('region',{name:'Recording summary'})).toContainText('84.0');
  await expect(page.locator('.metrics>div').nth(1).locator('strong')).toHaveText('2near-player outcome');
  for(const view of ['overview','rallies','practice','matches']) {
    await page.goto('/?view='+view+'&analysis='+id);
    if(view!=='matches')await expect(page.getByRole('status').filter({hasText:'Loading recording'})).toHaveCount(0);
    await expect(page.getByRole('heading',{level:1})).toBeVisible();
    await expect(page.getByText('Evening singles',{exact:true})).toHaveCount(0);
    if(view==='rallies')await expect(page.getByRole('region',{name:'Lost rally review'})).toContainText('2 lost rallies');
    if(view==='practice')await expect(page.getByRole('region',{name:'AI match report'})).toBeVisible();
    if(view==='matches')await expect(page.locator('a.match-library-row[href="/review/'+id+'"]')).toBeVisible();
    for(const width of [320,768,1024,1440]) {
      await page.setViewportSize({width,height:1000});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    for(const theme of ['light','dark'] as const) {
      const button=page.getByRole('button',{name:'Switch to '+theme+' theme'});
      if(await button.count())await button.click();
      if(theme==='dark') {
        expect(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(0, 0, 0)');
        expect(await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(5, 5, 5)');
      }
      expect((await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
    }
    await expect(page.getByRole('link',{name:'Website',exact:true})).toBeVisible();
    await page.screenshot({path:'artifacts/workspace-'+view+'.png',fullPage:true});
  }
  await page.goto('/?view=rallies&analysis='+id);
  await page.getByRole('link',{name:'Practice Plan',exact:true}).click();
  await expect(page).toHaveURL(new RegExp('analysis='+id));
  await expect(page.getByRole('region',{name:'AI match report'})).toBeVisible();
  await page.goBack();await expect(page.getByRole('region',{name:'Lost rally review'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('workspace handles unreadable saved analysis without fictional results',async({page})=>{
  await page.route('**/api/analysis/'+id,route=>route.fulfill({status:404,json:{error:'Missing'}}));
  await page.goto('/?analysis='+id);
  await expect(page.getByRole('alert').filter({hasText:'could not be loaded'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Recording summary'})).toHaveCount(0);
});

test('editorial upload previews Paris434, preserves calibration and model controls on mobile',async({page})=>{
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  await page.goto('/?analysis='+id);
  await page.getByRole('button',{name:'Upload Match',exact:true}).click();
  const file=readdirSync('.').find(name=>name.endsWith('350_434.mp4'))!;
  expect(file).toBeTruthy();
  await page.getByLabel('Match video',{exact:true}).setInputFiles(file);
  await expect(page.locator('.local-preview')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.preview-file strong')).toHaveText(file);
  expect(await page.locator('.analysis-video video').evaluate((v:HTMLVideoElement)=>v.duration)).toBeCloseTo(84,0);
  await page.getByRole('button',{name:'Mark court corners',exact:true}).click();
  for(const [x,y] of [[.36015625,.45138889],[.63828125,.45138889],[.78046875,.93055556],[.221875,.93055556]]) {
    const picker=page.locator('.corner-picker');const box=(await picker.boundingBox())!;
    await picker.click({position:{x:x*box.width,y:y*box.height}});
  }
  await expect(page.getByLabel('Body pose',{exact:true})).toBeChecked();
  await page.getByLabel('Estimated shot types (BST)',{exact:true}).check();
  await page.getByLabel('Near-player ending review',{exact:true}).check();
  for(const width of [320,768,1440]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.locator('.upload-modal').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    expect((await new AxeBuilder({page}).include('.upload-modal').analyze()).violations.map(v=>v.id)).toEqual([]);
    await page.screenshot({path:`artifacts/editorial-upload-${width}.png`});
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Upload Match',exact:true})).toBeFocused();
});

// A new upload has detected rallies before the user marks any wins or losses.
test('unmarked Paris434 rallies remain visible and replayable without being labelled zero rallies',async({page,request})=>{
  const uploadedId=JSON.parse(readFileSync('artifacts/paris434-current-upload.json','utf8')).id;
  const metadata=await (await request.get('/api/analysis/'+uploadedId)).json();
  await page.route('**/landing?losses=1',route=>route.fulfill({json:{analysisSha256:metadata.result.analysisSha256,outcomes:{}}}));
  await page.goto('/review/'+uploadedId);
  const loss=page.getByRole('region',{name:'Lost rally review'});
  await expect(loss.getByText('2 completed rally windows detected',{exact:true})).toBeVisible();
  await expect(loss.getByRole('heading',{name:'Mark your rally outcomes',exact:true})).toBeVisible();
  await expect(loss.getByRole('combobox',{name:'Outcome for rally 3'})).toBeVisible();
  await loss.getByRole('button',{name:'Replay detected rally 1',exact:true}).click();
  await expect.poll(()=>page.locator('.review-camera video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThanOrEqual(29.4);
  await expect(loss.getByRole('button',{name:'Explain this loss with local AI'})).toHaveCount(0);
  await loss.getByRole('button',{name:'Replay detected rally 2',exact:true}).click();
  await expect.poll(()=>page.locator('.review-camera video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThanOrEqual(58.2);
  for(const width of [320,1440]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).include('main').analyze()).violations.map(v=>v.id)).toEqual([]);
  }
});

test('loading outcomes cannot overwrite a rally selected while the request is pending',async({page})=>{
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/landing?losses=1',async route=>{await pending;await route.continue();});
  await page.goto('/review/'+id);
  await page.getByLabel('Selected rally',{exact:true}).selectOption('5');
  release();
  await expect(page.getByRole('button',{name:/Loss 2.*81\.5 s/,exact:true})).toHaveAttribute('aria-pressed','true');
});

test('fresh rally shows exact attempt and contextual explanation, with an ending-only replay option',async({page,request})=>{
  const fresh=JSON.parse(readFileSync('artifacts/paris434-current-upload.json','utf8')).id;
  const metadata=await (await request.get('/api/analysis/'+fresh)).json();
  await page.route('**/landing?losses=1',route=>route.fulfill({json:{analysisSha256:metadata.result.analysisSha256,outcomes:{}}}));
  await page.goto('/review/'+fresh);
  const loss=page.getByRole('region',{name:'Lost rally review'});
  const photo=loss.getByRole('figure',{name:'Exact attempt photo'});
  await expect(photo).toContainText('39.467 s');
  await expect(loss.getByRole('heading',{name:'Try next time',exact:true})).toBeVisible();
  await expect(loss).toContainText('At 39.467 s');
  await expect(loss.getByRole('button',{name:'Explain this loss with local AI'})).toHaveCount(0);
  await page.getByRole('button',{name:'How rally ended',exact:true}).click();
  const video=page.locator('.review-camera video');
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThanOrEqual(37.2);
  expect(await video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeLessThan(39);
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.paused),{timeout:6000}).toBe(true);
  expect(await video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeLessThan(40.4);
  await page.getByLabel('Selected rally',{exact:true}).selectOption('5');
  await expect(photo).toContainText('80.533 s');
  await page.getByRole('button',{name:'How rally ended',exact:true}).click();
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThanOrEqual(78.5);
  expect(await video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeLessThan(80);
});
