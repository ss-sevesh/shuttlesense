import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import {movementHeatmap,type ReviewData,type ReviewPerson} from '../lib/analysis-review';
import {poseAngles,hitPoseAngles} from '../lib/pose-angles';
import {reportEvidence} from '../lib/match-report';

const id=JSON.parse(readFileSync('artifacts/paris434-shot-job.json','utf8')).id;
test('rally heat intersects partial samples and unions overlaps without between-point time',()=>{
  const person={side:'near',court:[.5,.5]} as ReviewPerson;
  const data={duration:5,poseSampleHz:1,samples:[0,1,2,3,4].map(time=>({time,people:[person]}))};
  const windows:[number,number][]=[[.25,1.25],[1,1.5],[3.2,4.2]];
  expect(movementHeatmap(data,'near',5,windows).seconds).toBeCloseTo(2.25);
  expect(movementHeatmap(data,'near',5,windows).windowSeconds).toBeCloseTo(2.25);
  expect(movementHeatmap(data,'near',1,windows).seconds).toBe(.75);
  expect(movementHeatmap(data,'near',3,windows).seconds).toBe(1.25);
  expect(movementHeatmap(data,'near',5,[]).seconds).toBe(0);
  expect(movementHeatmap(data,'near',5,[[NaN,4],[3,2],[-1,1]]).seconds).toBe(0);
});

test('pose angles use pixel aspect ratio, confidence, exact frame and player identity',()=>{
  const person={poseDetected:true,landmarks:Array.from({length:33},()=>[0,0]),scores:Array(33).fill(1)} as ReviewPerson;
  person.landmarks[11]=[.1,.2];person.landmarks[13]=[.2,.2];person.landmarks[15]=[.2,.4];
  expect(poseAngles(person,1280,720)['Left elbow']).toBe(90);
  person.landmarks[15]=[.3,.4];
  expect(poseAngles(person,1280,720)['Left elbow']).toBeCloseTo(131.6335,3);
  person.scores[15]=.49;
  expect(poseAngles(person,1280,720)['Left elbow']).toBeNull();
  const data={samples:[{time:1,people:[{...person,side:'near',trackId:2}]}],width:1280,height:720,fps:30} as ReviewData;
  const event={frame:30,time:1,trackId:1,measurements:{elbow:null,bodyLean:null}} as NonNullable<ReviewData['hitPoses']>[number];
  expect(hitPoseAngles(data,event)['Left shoulder']).toBeNull();
});

test('approved Paris rally selection, combined totals, angles and report gates',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const data=(await (await request.get(`/api/analysis/${id}`)).json()).result as ReviewData;
  expect(data.fileName).toMatch(/350_434\.mp4$/);
  const eligible=data.rallies.filter(r=>r.end!==null);
  await page.goto(`/review/${id}`);
  await expect(page.getByLabel('Selected rally',{exact:true})).toHaveValue(String(eligible[0].id));
  const heat=page.locator('.review-heatmap');
  await expect(heat.locator('rect title')).toHaveCount(0);
  await expect(heat.locator('[data-live-position]')).toHaveCount(0);
  await page.getByRole('button',{name:'Rally total',exact:true}).click();
  const titles=()=>heat.locator('rect title').allTextContents();
  const expected=(windows:[number,number][])=>movementHeatmap(data,'near',data.duration,windows).grid.flatMap((row,y)=>row.flatMap((s,x)=>s>0?[`Row ${y+1}, column ${x+1}: ${s.toFixed(2)} seconds of approximate positions`]:[]));
  await expect.poll(titles).toEqual(expected([[eligible[0].start,eligible[0].end!]]));
  await page.getByLabel('Combine rallies',{exact:true}).check();
  await expect.poll(titles).toEqual(expected(eligible.map(r=>[r.start,r.end!])));
  await page.getByRole('group',{name:'Rallies to combine'}).getByLabel('Rally 1',{exact:true}).uncheck();
  await expect.poll(titles).toEqual(expected([[eligible[1].start,eligible[1].end!]]));
  await page.getByLabel('Combine rallies',{exact:true}).uncheck();
  await page.getByLabel('Selected rally',{exact:true}).selectOption(String(eligible[1].id));
  await expect(page.getByRole('button',{name:'Loss 2 · 81.5 s',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect.poll(titles).toEqual(expected([[eligible[1].start,eligible[1].end!]]));
  await page.getByText('Technical details: poses & rally boundaries',{exact:true}).click();
  const poses=page.getByRole('region',{name:'Near-side hit poses'});
  await poses.getByText('View body angles',{exact:true}).first().click();
  for(const part of ['Left shoulder','Right elbow','Left hip','Right knee','Right ankle','Body lean'])await expect(poses.getByText(part,{exact:true}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Shot types',exact:true})).toHaveCount(0);
  const evidence=reportEvidence(data,{shots:{},rallies:{}},{3:'lost',5:'lost'},{});
  expect(evidence.allHitPoses).toHaveLength(data.hitPoses!.length);
  expect(evidence.rallies.filter(r=>r.eligible)).toHaveLength(2);
  expect(evidence.rallies.filter(r=>!r.eligible).every(r=>r.hitPoses.length===0 && r.movement.trackedSeconds===0)).toBe(true);
  const origin={'origin':'http://127.0.0.1:3000'};
  expect((await request.post(`/api/analysis/${id}/report`,{data:{rallies:{}},headers:{origin:'https://evil.example'}})).status()).toBe(403);
  expect((await request.post(`/api/analysis/${id}/report`,{data:{rallies:{3:{start:40,end:30,reviewedAt:'now'}}},headers:origin})).status()).toBe(422);
  expect((await request.post(`/api/analysis/${id}/report`,{data:{rallies:[],generate:false},headers:origin})).status()).toBe(400);
  expect((await request.post(`/api/analysis/${id}/report`,{data:'x'.repeat(20000),headers:origin})).status()).toBe(413);
  for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  expect((await new AxeBuilder({page}).include('main').analyze()).violations).toEqual([]);
  await page.screenshot({path:'artifacts/paris434-rally-report-ui.png',fullPage:true});
  expect(errors).toEqual([]);
});
