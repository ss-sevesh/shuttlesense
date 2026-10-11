import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";

test("tracked movement shows source data, handles missing or invalid results, and stays accessible", async ({ page }) => {
  const path = "data/feasibility/movement-preview/results.json";
  const original = await readFile(path).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
  const grid = Array.from({ length: 8 }, () => Array(6).fill(0));
  grid[6][2] = 2;
  const preview = { version: 1, kind: "approximate_box_movement", player_id: "white-shirt", start_s: 10, end_s: 14, grid_seconds: grid, mapped_s: 2, outside_s: 1, missing_s: 1, proposal_samples: 3, contact_verified: false };
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await mkdir("data/feasibility/movement-preview", { recursive: true });
  try {
    await writeFile(path, JSON.stringify(preview));
    await page.goto("/movement");
    await expect(page).toHaveURL(/\/movement$/);
    await expect(page.getByRole("img", { name: /^Approximate tracked movement heatmap/ })).toBeVisible();
    await expect(page.locator("svg rect title")).toHaveText("Row 7, column 3: 2.00 seconds of approximate positions");
    await expect(page.locator("dd")).toHaveText(["4.00s", "2.00s", "1.00s", "1.00s", "3"]);
    await expect(page.getByText("Front-right needs attention")).toHaveCount(0);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.reload();
      expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
    }
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await unlink(path);
    await page.reload();
    await expect(page.getByText("No movement analysis is available yet.")).toBeVisible();
    await writeFile(path, JSON.stringify({ ...preview, mapped_s: 100 }));
    await page.reload();
    await expect(page.getByText("Movement analysis could not be loaded.", { exact: false })).toBeVisible();
    await expect(page.getByRole("main").getByRole("img")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    if (original) await writeFile(path, original);
    else await unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
});

test("upload rejects unsupported files, plays local video, and restores focus", async ({ page }) => {
  await page.goto("/?analysis=c278680c-fb33-4b1c-91d1-8daa17db95f6");
  await page.getByRole("button", { name: "Upload Match", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Match video", { exact: true }).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a video") });
  await expect(page.getByRole("alert").filter({ hasText: "Choose an MP4" })).toBeVisible();
  await expect(page.getByText("Your video stays on this device.", { exact: false })).toBeVisible();
  await page.getByLabel("Match video", { exact: true }).setInputFiles("tests/fixtures/preview.webm");
  await expect(page.locator(".local-preview")).toHaveAttribute("aria-busy", "false");
  expect(await page.locator("video").evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  await expect(page.locator(".preview-file strong")).toHaveText("preview.webm");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Upload Match", exact: true })).toBeFocused();
});
