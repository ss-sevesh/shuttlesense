import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";

export const runtime = "nodejs";
let busy = false; // ponytail: one local analysis at a time; use jobs before offering shared hosting.
const execute = promisify(execFile);
const limit = 100 * 1024 * 1024;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  let source: URL | undefined;
  try { if (origin) source = new URL(origin); } catch { /* Invalid origins are rejected below. */ }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !host ||
      !source || !["localhost", "127.0.0.1", "[::1]"].includes(source.hostname) || source.host !== host || source.protocol !== url.protocol) {
    return Response.json({ error: "This demo runs on your local machine only." }, { status: 403 });
  }
  if (busy) return Response.json({ error: "Another video is processing. Try again shortly." }, { status: 429 });
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return Response.json({ error: "Choose a video and mark its court corners." }, { status: 400 });
  }
  busy = true;
  const root = join(process.cwd(), "data", "demo-uploads");
  let directory: string | undefined;
  try {
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "No upload received." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit + 65536) {
        await reader.cancel();
        return Response.json({ error: "Use a video under 100 MB for this demo." }, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    const form = await new Response(new Uint8Array(Buffer.concat(chunks)), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
    const file = form.get("video");
    if (!(file instanceof File) || file.size === 0 || file.size > limit || !/\.(mp4|mov|webm)$/i.test(file.name) ||
        (file.type && !["video/mp4", "video/quicktime", "video/webm"].includes(file.type))) {
      return Response.json({ error: "Choose a non-empty MP4, MOV, or WebM under 100 MB." }, { status: 400 });
    }
    let corners: unknown;
    try { corners = JSON.parse(String(form.get("corners"))); }
    catch { return Response.json({ error: "Mark four court corners inside the picture." }, { status: 400 }); }
    if (!Array.isArray(corners) || corners.length !== 8 || !corners.every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)) {
      return Response.json({ error: "Mark four court corners inside the picture." }, { status: 400 });
    }
    await mkdir(root, { recursive: true });
    directory = await mkdtemp(join(root, "upload-"));
    const video = join(directory, "clip" + /\.(mp4|mov|webm)$/i.exec(file.name)![0].toLowerCase());
    await writeFile(video, new Uint8Array(await file.arrayBuffer()));
    const { stdout } = await execute(process.env.PYTHON_EXECUTABLE || "python", ["analysis/upload_demo.py", video, "--corners", ...corners.map(String)],
      { cwd: process.cwd(), timeout: 90_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    return Response.json(JSON.parse(stdout), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Local demo analysis failed", error instanceof Error ? error.message : "Unknown error");
    const detail = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    const message = detail.includes("Court corners") || detail.includes("Degenerate court") ?
      "The court corners do not form a valid court. Reset them and click each of the four distinct singles-court corners once. Keep the far baseline above the near baseline." :
      "Analysis failed. Use a readable video with an upright, fixed full-court view. Check that the local Python detector is installed.";
    return Response.json({ error: message }, { status: 422 });
  } finally {
    try { if (directory) {
      const child = relative(root, directory);
      if (child.startsWith("upload-") && !child.includes(sep)) await rm(directory, { recursive: true, force: true });
    } } finally { busy = false; }
  }
}
