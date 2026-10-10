import { test, expect } from '@playwright/test';
import { movementHeatmap, type ReviewPerson } from '../lib/analysis-review';
import { readFileSync } from 'node:fs';

test('Paris live heat starts faint and uses fixed accumulated seconds through playback and rewind', async ({page,request}) => {
  const {id} = JSON.parse(readFileSync('artifacts/paris434-shot-job.json','utf8'));
  const data = (await (await request.get(`/api/analysis/${id}`)).json()).result;
  expect(data.fileName).toMatch(/350_434\.mp4$/);
  await page.goto(`/review/${id}`);
  const video = page.locator('.review-camera video');
  const cells = page.locator('.review-heatmap rect').filter({has:page.locator('title')});
  await expect(video).toBeVisible();
  for (const time of [.2, 2, 10, .2, 0]) {
    await video.evaluate((v:HTMLVideoElement,t) => {v.pause();v.currentTime=t;},time);
    const expected = movementHeatmap(data,'near',time).grid.flat().filter(seconds=>seconds>0);
    await expect.poll(async()=>cells.locator('title').allTextContents()).toEqual(
      movementHeatmap(data,'near',time).grid.flatMap((row,y)=>row.flatMap((seconds,x)=>seconds>0 ? [`Row ${y+1}, column ${x+1}: ${seconds.toFixed(2)} seconds of approximate positions`] : []))
    );
    const opacity = await cells.evaluateAll(rows=>rows.map(row=>Number(row.getAttribute('opacity'))));
    expect(opacity).toEqual(expected.map(seconds=>.85*Math.min(seconds/5,1)));
    if (time===.2) {
      expect(opacity.length).toBeGreaterThan(0);
      expect(Math.max(...opacity)).toBeLessThan(.05);
      await page.screenshot({path:'artifacts/paris434-heat-start.png'});
    }
    if (time===10) await page.screenshot({path:'artifacts/paris434-heat-later.png'});
  }
});

test('live heat uses elapsed samples only and rebuilds correctly after rewind', () => {
  const person = (side: 'near' | 'far', court: [number,number]) => ({side,court} as ReviewPerson);
  const data = {poseSampleHz:2,duration:2,samples:[
    {time:0,people:[person('near',[0,0]),person('far',[1,1])]},
    {time:.5,people:[person('near',[1,1])]},
    {time:1,people:[person('near',[-1,.5])]},
    {time:1.5,people:[person('near',[.5,.5])]},
  ]};
  expect(movementHeatmap(data,'near',0).seconds).toBe(0);
  const partial = movementHeatmap(data,'near',.25);
  expect(partial.seconds).toBe(.25); expect(partial.grid[0][0]).toBe(.25);
  expect(partial.grid[7][5]).toBe(0);
  const forward = movementHeatmap(data,'near',1.75);
  expect(forward.seconds).toBe(1.25); expect(forward.grid[7][5]).toBe(.5);
  expect(movementHeatmap(data,'near',.25)).toEqual(partial);
  expect(movementHeatmap(data,'near',1.75)).toEqual(forward);
  expect(movementHeatmap(data,'near',10).seconds).toBe(1.5);
  expect(movementHeatmap(data,'far',1.75).seconds).toBe(.5);
});
