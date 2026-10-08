import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';

async function upload(page: Page, file: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Upload Match', exact: true }).click();
  await page.getByLabel('Match video', { exact: true }).setInputFiles(file);
  await expect(page.locator('.local-preview')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Analyze Shots & Rallies', exact: true }).click();
  await expect(page.locator('.corner-picker')).toBeFocused();
  for (const [x,y] of [[327/832,178/464],[530/832,178/464],[798/832,388/464],[61/832,388/464]]) {
    const picker = page.locator('.corner-picker');
    const box = (await picker.boundingBox())!;
    await picker.click({ position: { x:x*box.width, y:y*box.height } });
  }
  const response = page.waitForResponse(r => r.url().endsWith('/api/analysis') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Analyze Shots & Rallies', exact: true }).click();
  const result = await response;
  expect(result.status(), await result.text()).toBe(202);
  return (await result.json()).id as string;
}

test('actual full recording supports replay, visible values and saved human reviews', async ({ page, request }) => {
  test.skip(!existsSync('WhatsApp Video 2026-10-08 at 7.09.26 PM.mp4'), 'Requires private local footage');
  test.setTimeout(120_000);
  const errors: string[] = [];
  await page.emulateMedia({ reducedMotion:'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  const id = await upload(page, 'WhatsApp Video 2026-10-08 at 7.09.26 PM.mp4');
  await expect(page.locator('.analysis-review')).toBeVisible({ timeout: 60_000 });
  const job = await (await request.get(`/api/analysis/${id}`)).json();
  expect(job.result.cached).toBe(true);
  expect(job.result.shots).toHaveLength(111);
  expect(job.result.rallies).toHaveLength(7);
  expect(job.result.analysisSha256).toMatch(/^[a-f0-9]{64}$/);
  await expect(page.locator('.review-summary')).toContainText('88 unknown');
  await expect(page.locator('.review-summary')).toContainText('0 estimated endings');
  const video = page.locator('.review-camera video');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.duration)).toBeCloseTo(320.5, 1);
  await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 12; });
  await expect(page.locator('.review-camera-frame svg rect')).not.toHaveCount(0);
  await expect(page.locator('.review-measurements').first()).toContainText('°');
  await page.getByLabel('Player boxes', { exact:true }).uncheck();
  await expect(page.locator('.review-camera-frame svg rect')).toHaveCount(0);
  await page.getByLabel('Player boxes', { exact:true }).check();
  const near = await page.locator('.review-heatmap rect title').allTextContents();
  expect(near.length).toBeGreaterThan(0);
  await page.locator('#review-side').selectOption('far');
  expect(await page.locator('.review-heatmap rect title').allTextContents()).not.toEqual(near);
  await page.getByLabel('What do you see?').selectOption('smash');
  await page.getByRole('button', { name:'Save shot review', exact:true }).click();
  await expect(page.locator('.review-selected')).toContainText('You marked: Smash');
  await page.getByRole('button', { name:'Replay this contact', exact:true }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(12.7);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.upload-modal').analyze()).violations.map(v => v.id)).toEqual([]);
  const original = job.result.shots[0];
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name:'Download reviewed JSON' }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(exported.modelShots[0]).toEqual(original);
  expect(exported.humanReviews.shots[original.id].label).toBe('smash');
  await page.goto(`/review/${id}`);
  await expect(page.locator('.review-selected')).toContainText('You marked: Smash', { timeout:30_000 });
  await page.getByRole('button', { name:'Rally windows', exact:true }).click();
  await expect(page.locator('.review-selected')).toContainText('Unknown');
  await page.getByLabel('Observed end (seconds)').fill('30');
  await page.getByRole('button', { name:'Save verified window' }).click();
  await expect(page.getByLabel('Observed end (seconds)')).toBeFocused();
  await expect(page.locator('.review-feedback')).toContainText('later end');
  await page.getByLabel('Observed end (seconds)').fill('40');
  await page.getByRole('button', { name:'Save verified window' }).click();
  await expect(page.locator('.review-summary')).toContainText('1 rally windows reviewed');
  await expect(page.locator('.review-selected')).toContainText('Unknown');
  for (const colorScheme of ['light','dark'] as const) {
    await page.emulateMedia({ colorScheme });
    expect((await new AxeBuilder({ page }).include('.saved-analysis').analyze()).violations.map(v => ({id:v.id,nodes:v.nodes.map(n => n.target)}))).toEqual([]);
  }
  for (const width of [320,768,1440]) {
    await page.setViewportSize({ width,height:1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path:'artifacts/shot-rally-review.png',fullPage:true });
  const range = await request.get(`/api/analysis/${id}/video`, { headers:{range:'bytes=0-99'} });
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(100);
  expect(errors).toEqual([]);
});

test('fresh six-second upload runs the actual GPU pipeline', async ({ page, request }) => {
  test.skip(!existsSync('data/feasibility/ui-upload-6s.mp4'), 'Requires local model fixture');
  test.setTimeout(240_000);
  const id = await upload(page, 'data/feasibility/ui-upload-6s.mp4');
  await expect(page.locator('.analysis-review')).toBeVisible({ timeout:210_000 });
  const job = await (await request.get(`/api/analysis/${id}`)).json();
  expect(job.status).toBe('complete');
  expect(job.result.cached).toBe(false);
  expect(job.result.duration).toBeCloseTo(6,1);
  expect(job.result.metrics.shuttleFrames).toBe(180);
  expect(job.result.metrics.sampleCount).toBe(90);
  await expect(page.locator('.review-summary > div').last().locator('dd')).toHaveText('00 rally windows reviewed');
  await page.screenshot({path:'artifacts/fresh-upload-review.png',fullPage:true});
});

test('full analysis rejects foreign origins and invalid calibration', async ({ request }) => {
  expect((await request.post('/api/analysis', {headers:{origin:'https://example.com'}})).status()).toBe(403);
  expect((await request.post('/api/analysis', {headers:{origin:'http://127.0.0.1:3000'},multipart:{video:{name:'bad.mp4',mimeType:'video/mp4',buffer:Buffer.from('invalid')},corners:'not JSON'}})).status()).toBe(422);
  expect((await request.post('/api/analysis', {headers:{origin:'http://127.0.0.1:3000'},multipart:{video:{name:'bad.mp4',mimeType:'video/mp4',buffer:Buffer.from('invalid')},corners:'[0,0,1,0,1,1,0,1]'}})).status()).toBe(422);
  expect((await request.get('/api/analysis/not-a-job')).status()).toBe(404);
});
