import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';
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
