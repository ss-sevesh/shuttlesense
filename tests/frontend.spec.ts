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
    await page.goto("/");
    await page.getByRole("link", { name: "View tracked clip movement" }).click();
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
    await expect(page.getByRole("img")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    if (original) await writeFile(path, original);
    else await unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
});

test("rally evidence filters correctly and survives reload", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".rally-bar")).toHaveCount(24);
  await page.getByRole("button", { name: "Lost", exact: true }).click();
  await expect(page.locator(".rally-bar")).toHaveCount(14);
  await page.getByRole("button", { name: "Won", exact: true }).click();
  await expect(page.locator(".rally-bar")).toHaveCount(10);
  await page.getByRole("button", { name: "Rally 3, won", exact: true }).click();
  await expect(page.locator(".subtle-tag").first()).toHaveText("Rally 03");
  await page.reload();
  await expect(page.getByRole("button", { name: "Rally 3, won", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Review front-right rallies" }).click();
  await expect(page).toHaveURL(/issue=front/);
  await expect(page.locator(".rally-bar")).toHaveCount(5);
  await expect(page.locator(".rally-table-row")).toHaveCount(5);
  expect(errors).toEqual([]);
});

test("practice instructions, completion, keyboard dismissal, and downloads work", async ({ page }) => {
  await page.goto("/?view=practice");
  const drill = page.getByRole("button", { name: /^Diagonal recovery/ });
  await drill.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diagonal recovery", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(drill).toBeFocused();
  await page.getByRole("button", { name: "Mark Diagonal recovery complete", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Mark Diagonal recovery incomplete", exact: true })).toHaveAttribute("aria-pressed", "true");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Plan", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("shuttlesense-practice-plan.txt");
});

test("upload rejects unsupported files, plays local video, and restores focus", async ({ page }) => {
  await page.goto("/");
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

test("movement controls, library navigation, and report export work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Show movement trail", exact: true }).click();
  await expect(page.locator(".movement-overlay")).toHaveCount(0);
  await page.getByRole("button", { name: "Play movement demo", exact: true }).click();
  await expect.poll(async () => Number(await page.getByRole("slider").inputValue())).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause movement demo", exact: true }).click();
  await page.getByRole("button", { name: "Restart movement demo", exact: true }).click();
  await expect(page.getByRole("slider")).toHaveValue("0");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export Report", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("shuttlesense-sample-report.txt");
  await page.getByRole("link", { name: "My Matches 1", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Matches", exact: true })).toBeVisible();
  await page.locator(".match-library-row").click();
  await expect(page.getByRole("heading", { name: "A closer look", exact: true })).toBeVisible();
});

test("responsive screens and both themes pass accessibility checks", async ({ page }) => {
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.map(v => ({ id:v.id, nodes:v.nodes.map(n=>n.target) }))).toEqual([]);
    await page.screenshot({ path: `artifacts/shuttlesense-${colorScheme}.png`, fullPage: true });
  }
  await page.goto("/?view=practice");
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
  await page.getByRole("button", { name: /^Diagonal recovery/ }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
});
