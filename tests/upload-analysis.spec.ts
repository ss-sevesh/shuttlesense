import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";

test("local analysis rejects foreign origins and invalid input", async ({ request }) => {
  const url = "/api/analyze-demo";
  expect((await request.post(url, { headers: { origin: "https://example.com" } })).status()).toBe(403);
  expect((await request.post(url, { headers: { origin: "http://127.0.0.1:3000" }, multipart: {
    video: { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("invalid") }, corners: "not json",
  } })).status()).toBe(400);
  expect((await request.post(url, { headers: { origin: "http://127.0.0.1:3000" }, multipart: {
    video: { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("invalid") }, corners: "[0,0,1,0,1,1,0,1]",
  } })).status()).toBe(422);
  expect(await readdir("data/demo-uploads")).toEqual([]);
});

test("uploaded footage produces synchronized boxes and side heatmaps", async ({ page }) => {
  test.skip(!existsSync("videoplayback.mp4") || !existsSync("data/models/yolox_tiny.onnx"), "Requires private local footage and detector");
  test.setTimeout(120_000);
  const errors: string[] = [];
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: /Upload Match/ }).click();
  await page.locator('input[name="match-video"]').setInputFiles("videoplayback.mp4");
  await expect(page.getByText("Local preview", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark court corners", exact: true }).click();
  for (const [x,y] of [[413/1280,241/720],[873/1280,239/720],[987/1280,687/720],[276/1280,692/720]]) {
    const picker = page.locator(".corner-picker");
    const rect = (await picker.boundingBox())!;
    await picker.click({ position: { x: x*rect.width, y: y*rect.height } });
  }
  const response = page.waitForResponse(r => r.url().endsWith("/api/analyze-demo") && r.request().method() === "POST", { timeout: 100_000 });
  await page.getByRole("button", { name: "Show boxes & heatmap", exact: true }).click();
  const processed = await response;
  expect(processed.status(), await processed.text()).toBe(200);
  const data = await processed.json();
  expect(data.samples.length).toBe(150);
  expect(data.samples.some((sample: {people: unknown[]}) => sample.people.length >= 2)).toBe(true);
  await expect(page.getByRole("heading", { name: "Approximate movement heatmap" })).toBeVisible();
  await page.locator(".analysis-video video").evaluate((video: HTMLVideoElement) => { video.currentTime = 1; });
  await expect(page.locator(".analysis-boxes rect")).not.toHaveCount(0);
  const near = await page.locator(".analysis-map rect title").allTextContents();
  expect(near.length).toBeGreaterThan(0);
  await page.getByLabel("Show court side").selectOption("far");
  expect(await page.locator(".analysis-map rect title").allTextContents()).not.toEqual(near);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.getByRole("button", { name: "Close upload" }).click();
    await page.emulateMedia({ colorScheme });
    const toggle = page.getByRole("button", { name: `Switch to ${colorScheme} theme` });
    if (await toggle.count()) await toggle.click();
    await page.getByRole("button", { name: "Upload Match", exact: true }).click();
    expect((await new AxeBuilder({ page }).include(".upload-modal").analyze()).violations.map(v => ({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
  }
  await page.screenshot({ path: "artifacts/upload-analysis.png", fullPage: true });
  await page.locator(".analysis-video video").evaluate((video: HTMLVideoElement) => { video.currentTime = 31; });
  await expect(page.locator(".analysis-boxes rect")).toHaveCount(0);
  expect(await readdir("data/demo-uploads")).toEqual([]);
  expect(errors).toEqual([]);
});
