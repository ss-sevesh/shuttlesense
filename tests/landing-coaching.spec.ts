import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';

test('before-landing frames reach the local AI and remain separate from contact estimates', async ({ page, request }) => {
  const id = 'dd88779c-8a2f-406e-a2a3-ebdf90038b47';
  test.skip(!existsSync(`data/analysis-jobs/${id}/result.json`), 'Requires private saved footage and local model');
  test.setTimeout(300_000);
  const endpoint = `/api/analysis/${id}/landing`;
  expect((await request.post(endpoint, { headers: { origin: 'https://example.com' }, data: { frame: 300 } })).status()).toBe(403);
  expect((await request.post(endpoint, { headers: { origin: 'http://127.0.0.1:3000' }, data: { frame: 0 } })).status()).toBe(422);
  expect((await request.post(endpoint, { headers: { origin: 'http://127.0.0.1:3000' }, data: { frame: 1.5 } })).status()).toBe(400);
  expect((await request.get(`${endpoint}?frame=../1`)).status()).toBe(400);
  const original = await (await request.get(`/api/analysis/${id}`)).json();
  const errors: string[] = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`/review/${id}`);
  const panel = page.getByRole('region', { name: 'Before-landing coaching' });
  await expect(panel).toBeVisible();
  // Test anchor only; this timestamp is not independently labeled as a landing.
  await panel.getByLabel('Observed landing time (seconds)').fill('10');
  const completion = page.waitForResponse(r => r.url().endsWith('/landing') && r.request().method() === 'POST', { timeout: 260_000 });
  await panel.getByRole('button', { name: 'Send pre-landing frames to AI' }).click();
  const response = await completion;
  expect(response.status(), await response.text()).toBe(200);
  const report = await response.json();
  expect(report.frames).toEqual([270, 278, 285, 292, 299]);
  expect(report.status).toBe('user_selected');
  expect(report.coaching.status, JSON.stringify(report.coaching)).toBe('experimental');
  expect(report.coaching.answer.shotType).toBe('unknown');
  expect(report.coaching.promptVersion).toBe('before-landing-v1');
  await expect(panel.getByRole('heading', { name: 'Possible alternative' })).toBeVisible();
  await expect(panel.locator('img')).toHaveCount(5);
  for (const image of await panel.locator('img').all()) await expect.poll(() => image.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(832);
  expect((await request.get(`${endpoint}?frame=300&image=270`)).headers()['content-type']).toBe('image/jpeg');
  expect((await request.get(`${endpoint}?frame=300&image=300`)).status()).toBe(404);
  expect((await request.get(`${endpoint}?frame=300&image=../source`)).status()).toBe(404);
  expect((await request.get(`${endpoint}?frame=300`, { headers: { origin: 'https://example.com' } })).status()).toBe(403);
  expect((await (await request.get(`/api/analysis/${id}`)).json()).result).toEqual(original.result);
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download before-landing review' }).click();
  expect(JSON.parse(readFileSync((await (await download).path())!, 'utf8')).frames).toEqual(report.frames);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    expect((await new AxeBuilder({ page }).include('.landing-coaching').analyze()).violations).toEqual([]);
  }
  await page.screenshot({ path: 'artifacts/before-landing-coaching.png', fullPage: true });
  await page.reload();
  await panel.getByLabel('Observed landing time (seconds)').fill('10');
  await panel.getByRole('button', { name: 'Send pre-landing frames to AI' }).click();
  await expect(panel.getByRole('heading', { name: 'Possible alternative' })).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});
