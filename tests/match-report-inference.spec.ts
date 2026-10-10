import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const id=JSON.parse(readFileSync('artifacts/paris434-shot-job.json','utf8')).id;

test('approved Paris recording generates and reopens a local evidence-grounded match report',async({page,request})=>{
  test.setTimeout(900000);
  const response=await request.post(`/api/analysis/${id}/report`,{headers:{origin:'http://127.0.0.1:3000'},data:{rallies:{}},timeout:850000});
  expect(response.status(),await response.text()).toBe(200);
  const {report,evidence}=await response.json();
  expect(report.status).toBe('experimental');expect(report.rallyReports).toHaveLength(2);
  expect(evidence.rallies.filter((r:{eligible:boolean})=>r.eligible).every((r:{outcome:string})=>r.outcome==='lost')).toBe(true);
  expect(evidence.allHitPoses.length).toBeGreaterThan(0);
  expect(report.model).toBe('Qwen/Qwen3-4B-Instruct-2507');
  expect(evidence.modelRequests.filter((r:{repair:boolean})=>!r.repair)).toHaveLength(3);
  expect(evidence.modelRequests.length).toBeLessThanOrEqual(6);
  for(const entry of evidence.modelRequests) {
    expect(entry.request.model).toBe('shuttlesense-report:qwen3-4b-2507-q4km');
    for(const message of entry.request.messages){expect(Object.keys(message).sort()).toEqual(['content','role']);expect(typeof message.content).toBe('string');}
  }
  const supplied=evidence.modelRequests.filter((r:{synthesis:boolean;repair:boolean})=>!r.synthesis&&!r.repair).flatMap((r:{request:{messages:{content:string}[]}})=>JSON.parse(r.request.messages[1].content.split('EVIDENCE: ')[1].split('\nOUTPUT RULES:')[0]).hitPoses);
  const eligiblePoses=evidence.rallies.filter((r:{eligible:boolean})=>r.eligible).flatMap((r:{hitPoses:{frame:number;angles:Record<string,number|null>}[]})=>r.hitPoses);
  expect(supplied.map((p:{frame:number})=>p.frame).sort((a:number,b:number)=>a-b)).toEqual(eligiblePoses.map((p:{frame:number})=>p.frame).sort((a:number,b:number)=>a-b));
  for(const pose of supplied)expect(pose.angles).toEqual(eligiblePoses.find((p:{frame:number})=>p.frame===pose.frame).angles);
  expect(report.answer.training.length).toBeGreaterThan(20);
  expect(report.answer.training).toMatch(/practi[cs]e|drill|repetitions|repeat|sets|step/i);
  for(const rally of report.rallyReports){expect(rally.outcome).toBe('lost');expect(rally.answer.training).toMatch(/repetitions|reps|sets|seconds|minutes/i);expect(rally.answer.observations).not.toMatch(/\[0\.\d|coordinates/i);}
  for(const answer of [report.answer,...report.rallyReports.map((r:{answer:Record<string,string>})=>r.answer)])expect(Object.values(answer).join(' ')).not.toMatch(/\d\s*(degrees?\b|deg\b|°)/i);
  await page.goto(`/review/${id}`);
  const region=page.getByRole('region',{name:'AI match report'});
  await expect(region.getByRole('button',{name:'Download report',exact:true})).toBeVisible();
  let download=page.waitForEvent('download');await region.getByRole('button',{name:'Download report',exact:true}).click();
  const reportDownload=await download;await reportDownload.saveAs('artifacts/paris434-match-report.html');
  const html=readFileSync((await reportDownload.path())!,'utf8');
  expect(html).toContain('Rally 1 (window 3)');expect(html).toContain('frame 1184');expect(html).toContain('frame 2416');
  const photos=[...html.matchAll(/<image href="data:image\/jpeg;base64,([A-Za-z0-9+/=]+)"/g)];expect(photos).toHaveLength(2);
  for(const [index,frame] of [1184,2416].entries())expect(Buffer.from(photos[index][1],'base64')).toEqual(await (await request.get(`/api/analysis/${id}/frames/${frame}`)).body());
  await region.getByText('Read each rally review',{exact:true}).click();
  for(const window of [3,5])await expect(region.getByRole('figure',{name:`Lost rally ${window} report photo`})).toBeVisible();
  download=page.waitForEvent('download');await region.getByRole('button',{name:'Download AI evidence',exact:true}).click();
  const evidenceDownload=await download;await evidenceDownload.saveAs('artifacts/paris434-report-evidence.json');
  const saved=JSON.parse(readFileSync((await evidenceDownload.path())!,'utf8'));
  expect(saved).toEqual(evidence);
  await page.reload();await expect(region).toContainText(report.answer.summary);
});
