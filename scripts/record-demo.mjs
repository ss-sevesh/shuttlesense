import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
await mkdir('docs/media',{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:'artifacts/demo-recording',size:{width:1440,height:1000}},reducedMotion:'reduce'});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function chapter(text){
  await page.evaluate(text=>{
    let caption=document.getElementById('demo-caption');
    if(!caption){caption=document.createElement('div');caption.id='demo-caption';Object.assign(caption.style,{position:'fixed',bottom:'18px',left:'24px',right:'24px',padding:'16px 24px',background:'#183d2c',color:'#fff',font:'600 18px system-ui',borderRadius:'8px',zIndex:'10000',pointerEvents:'none'});document.body.append(caption);}
    caption.textContent=text;
  },text);
  await page.waitForTimeout(2800);
}
await page.goto('http://127.0.0.1:3000/demo');
await page.getByRole('button',{name:'Loss 1 · 5.0 s',exact:true}).waitFor();
await page.getByRole('figure',{name:'Exact attempt photo'}).locator('img').waitFor();
await page.evaluate(()=>scrollTo(0,0));
await page.getByRole('button',{name:'Rally total',exact:true}).click();
await page.screenshot({path:'docs/media/review.png'});
await page.getByRole('button',{name:'Live',exact:true}).click();
await chapter('ShuttleSense — generated footage, synthetic evidence. Explore rally review without model setup.');
const video=page.locator('.review-camera video');
await page.getByRole('button',{name:'Replay full rally',exact:true}).click();
await chapter('1 / Replay a selected rally. The live heatmap counts only its playing window.');
await page.waitForTimeout(2500);await video.evaluate(v=>v.pause());
await page.getByRole('button',{name:'Rally total',exact:true}).click();
await chapter('2 / Rally total shows accumulated movement for the entire selected rally.');
await page.getByLabel('Combine rallies',{exact:true}).check();
await chapter('3 / Combine rallies to compare overall court coverage. Choose which rallies contribute.');
await page.getByRole('group',{name:'Rallies to combine'}).getByLabel('Rally 1',{exact:true}).uncheck();
await page.waitForTimeout(1500);
await page.getByLabel('Combine rallies',{exact:true}).uncheck();
await page.getByLabel('Selected rally',{exact:true}).selectOption('2');
await page.getByRole('button',{name:'Live',exact:true}).click();
await chapter('4 / Select another rally. Idle movement between rallies never enters the map.');
for(const label of ['Player boxes','Body pose','Shuttle','Near-side court lines']){
  await page.getByLabel(label,{exact:true}).uncheck();await page.waitForTimeout(500);await page.getByLabel(label,{exact:true}).check();
}
await chapter('5 / Toggle player boxes, pose, shuttle and court-line overlays independently.');
await page.getByRole('button',{name:'Loss 2 · 11.0 s',exact:true}).click();
await page.getByRole('button',{name:'Show attempt at 10.500 s',exact:true}).click();
await chapter('6 / Show attempt pauses at its evidence timestamp and scrolls to the video.');
const photo=page.getByRole('figure',{name:'Exact attempt photo'});
await photo.getByRole('button',{name:'Mark racket head',exact:true}).click();
const image=photo.getByRole('button',{name:'Mark racket head on attempt photo'});
const box=await image.boundingBox();await image.click({position:{x:box.width*.55,y:box.height*.5}});
await chapter('7 / The default gap uses a wrist proxy. Mark the racket head manually to measure image pixels.');
await photo.getByRole('button',{name:'Reset racket mark'}).click();
await page.getByText('Technical details: poses & rally boundaries',{exact:true}).click();
await page.getByRole('button',{name:'Hit poses',exact:true}).click();
await page.getByText('View body angles',{exact:true}).first().click();
await chapter('8 / Expand reliable shoulder, elbow, wrist, hip, knee and ankle angles. Unknown stays unknown.');
await page.getByRole('button',{name:'Show pose at 7.500 s',exact:true}).click();
await page.waitForTimeout(1000);
await page.getByRole('button',{name:'Rally boundaries',exact:true}).click();
await page.getByLabel('Observed start (seconds)').fill('7.1');
await page.getByRole('button',{name:'Save verified window',exact:true}).click();
await chapter('9 / Correct observed rally boundaries. Heatmap windows update with the saved correction.');
const report=page.getByRole('region',{name:'AI match report'});
await report.getByRole('button',{name:'Generate match report',exact:true}).click();
await report.getByText('Read each rally review',{exact:true}).waitFor();
await report.evaluate(element=>element.scrollIntoView({block:'start'}));
await chapter('10 / Qwen3-4B uses text evidence only for reports. This demo shows synthetic sample copy, not inference.');
await report.getByText('Read each rally review',{exact:true}).click();
await report.evaluate(element=>element.scrollIntoView({block:'start'}));
await chapter('11 / Exact loss photos attach after generation. Download the illustrated HTML report and full AI evidence.');
for(const label of ['Download report','Download AI evidence']){
  const download=page.waitForEvent('download');await report.getByRole('button',{name:label,exact:true}).click();await download;
}
const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download reviewed JSON',exact:true}).click();await download;
await chapter('12 / JSON keeps original detector evidence separate from your corrections. See README for real-analysis setup.');
if(errors.length)throw new Error(errors.join('\n'));
const recording=page.video();await context.close();const source=await recording.path();await browser.close();
execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',source,'-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart','docs/media/shuttlesense-walkthrough.mp4']);
console.log('Saved synthetic feature walkthrough and README screenshot. No private match footage was read.');
