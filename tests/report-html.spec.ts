import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {demoData,demoReport} from '../lib/public-demo';
import {reportHtml} from '../lib/report-html';
import {attemptPhotoGeometry} from '../lib/attempt-photo';

test('portable report embeds exact loss images, escapes text and works without a server',async({page})=>{
  const report={...demoReport,answer:{...demoReport.answer,summary:'<script>window.exposed=true</script> & safe'},
    rallyReports:demoReport.rallyReports};
  const image=`data:image/jpeg;base64,${readFileSync('public/demo/attempt-1.jpg').toString('base64')}`;
  const html=reportHtml({...demoData,fileName:'<img src=x onerror=alert(1)>'},report,
    [{rallyId:1,dataUrl:image,evidence:demoData.endingReview![0].evidence!,racket:null}],{1:'Rally 1',2:'Rally 2'});
  expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
  expect(html).toContain('Wrist proxy');expect(html).toContain('frame 135');
  await page.setContent(html);
  expect(await page.locator('script').count()).toBe(0);
  await expect(page.getByRole('heading',{name:'Rally 1 · 1.000–5.000 s'})).toBeVisible();
  expect(await page.locator('image').getAttribute('href')).toBe(image);
  const bounds=attemptPhotoGeometry(demoData,demoData.endingReview![0].evidence!,demoData.endingReview![0].evidence!.wristPoint);
  expect(await page.locator('svg').getAttribute('viewBox')).toBe(`${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}`);
  expect(await page.locator('svg line').count()).toBeGreaterThan(0);
  expect(page.url()).toBe('about:blank');
  expect(()=>reportHtml(demoData,report,[{rallyId:1,dataUrl:'https://example.com/tracker',evidence:demoData.endingReview![0].evidence!,racket:null}],{})).toThrow('Invalid report photo');
});

test('synthetic illustrated download reports missing images and excludes unconfirmed losses',async({page})=>{
  await page.goto('/demo');
  const region=page.getByRole('region',{name:'AI match report'});
  await region.getByRole('button',{name:'Generate match report',exact:true}).click();
  await expect(region.getByRole('button',{name:'Download report',exact:true})).toBeVisible();
  await page.route('**/api/demo/frames/135',route=>route.fulfill({status:404}));
  await region.getByRole('button',{name:'Download report',exact:true}).click();
  await expect(region).toContainText('no incomplete report was saved');
  await page.unroute('**/api/demo/frames/135');
  const download=page.waitForEvent('download');await region.getByRole('button',{name:'Download report',exact:true}).click();
  const file=await download;expect(file.suggestedFilename()).toBe('shuttlesense-match-report.html');
  expect(readFileSync((await file.path())!,'utf8').match(/<image href=/g)).toHaveLength(2);
  await page.route('**/api/demo/report',async route=>{
    const response=await route.fetch(),result=await response.json();
    if(result.evidence){result.evidence.rallies[0].outcome='unknown';result.report.rallyReports[0].outcome='unknown';}
    await route.fulfill({response,json:result});
  });
  await region.getByRole('button',{name:'Refresh match report',exact:true}).click();
  await region.getByText('Read each rally review',{exact:true}).click();
  await expect(region.getByRole('figure',{name:'Lost rally 1 report photo'})).toHaveCount(0);
  await expect(region.getByRole('figure',{name:'Lost rally 2 report photo'})).toBeVisible();
  const secondDownload=page.waitForEvent('download');await region.getByRole('button',{name:'Download report',exact:true}).click();
  expect(readFileSync((await (await secondDownload).path())!,'utf8').match(/<image href=/g)).toHaveLength(1);
});
