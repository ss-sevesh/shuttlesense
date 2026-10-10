import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';

test('possible landing replay and export preserve unconfirmed rally endings', async ({ page }) => {
  const id = '11111111-1111-4111-8111-111111111111';
  const ground = { status: 'experimental', model: 'segformer', revision: 'pinned', reason: 'Floor overlap and a projected stop suggest a landing; neither proves ground contact.',
    candidates: [{ frame: 30, time: 1, point: [20, 20], status: 'possible_landing', holdFrames: 6, floorScore: .9 }] };
  const result = { videoSha256: 'a'.repeat(64), analysisSha256: 'b'.repeat(64), fileName: 'Synthetic landing UI check', duration: 2, width: 320, height: 180, fps: 30, poseSampleHz: 30,
    samples: [], shuttle: [], shots: [], rallies: [{ id: 1, start: 0, end: null, reviewStop: 2, hitCandidates: 0, startStatus: 'possible', endStatus: 'unknown' }], limitations: [],
    metrics: { sampleCount: 0, nearTracked: 0, farTracked: 0, nearPoses: 0, farPoses: 0, shuttleFrames: 0, shuttleDetected: 0 }, groundLanding: ground };
  await page.route(`**/api/analysis/${id}`, route => route.fulfill({ json: { id, status: 'complete', stage: 'Ready', progress: 100, result } }));
  await page.route(`**/api/analysis/${id}/video`, route => route.fulfill({ path: 'tests/fixtures/preview.webm', contentType: 'video/webm' }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/review/${id}`);
  const panel = page.getByRole('region', { name: 'Possible shuttle landings' });
  await expect(panel).toContainText('ground contact unconfirmed');
  await panel.getByRole('button', { name: /Replay possible landing/ }).click();
  const video = page.locator('.review-camera video');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(.2);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused), { timeout: 10_000 }).toBe(true);
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(2.2);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download reviewed JSON' }).click();
  const exported = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(exported.groundLanding).toEqual(ground);
  expect(exported.modelRallies[0].end).toBeNull();
  expect((await new AxeBuilder({ page }).include('[aria-label="Possible shuttle landings"]').analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/ground-candidate-ui.png', fullPage: true });
  ground.candidates = [];
  await page.reload();
  await expect(panel).toContainText('No landing candidates passed');
  result.groundLanding = { ...ground, status: 'unavailable', reason: 'Floor worker did not complete. Rally endings remain unknown.' };
  await page.reload();
  await expect(panel).toContainText('Floor worker did not complete');
  expect(errors).toEqual([]);
});

test('real pretrained floor trial loads with zero unconfirmed candidates', async ({ page, request }) => {
  test.skip(!existsSync('artifacts/ground-test-job.json'), 'Requires the private floor trial');
  const { id } = JSON.parse(readFileSync('artifacts/ground-test-job.json', 'utf8'));
  const job = await (await request.get(`/api/analysis/${id}`)).json();
  expect(job.result.groundLanding.measurements.frames).toBe(1202);
  expect(job.result.groundLanding.candidates).toEqual([]);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`/review/${id}`);
  await expect(page.getByRole('region', { name: 'Possible shuttle landings' })).toContainText('No landing candidates passed');
  await expect.poll(() => page.locator('.review-camera video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  for (const image of await page.getByRole('region', { name: 'Contact frame evidence' }).locator('img').all()) {
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(832);
  }
  await page.screenshot({ path: 'artifacts/ground-real-review.png', fullPage: true });
  expect(errors).toEqual([]);
});
