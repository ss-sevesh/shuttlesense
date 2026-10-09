import { CoachWorkspace } from "@/components/coach-workspace";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { connection } from "next/server";
import { jobsRoot, jobPath } from "@/lib/analysis-jobs";

export default async function Page() {
  await connection(); // Keep private recording names out of prerendered build artifacts.
  const savedAnalyses: { id: string; name: string }[] = [];
  try {
    for (const entry of await readdir(jobsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const directory = jobPath(entry.name);
        const status = JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
        if (status.status !== "complete") continue;
        const request = JSON.parse(await readFile(join(directory, "request.json"), "utf8"));
        if (typeof request.fileName !== "string" || !request.fileName.trim()) continue;
        savedAnalyses.push({ id: entry.name, name: request.fileName });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Saved analysis could not be listed", entry.name, error);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Saved analyses could not be loaded", error);
  }
  return <CoachWorkspace savedAnalyses={savedAnalyses} />;
}
