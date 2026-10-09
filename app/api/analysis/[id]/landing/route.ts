import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { acquireAnalysisLock, jobPath, jobsRoot, localRequest } from '@/lib/analysis-jobs';

export const runtime = 'nodejs';
export const maxDuration = 300;
const execute = promisify(execFile);
const validFrame = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < 100000000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!localRequest(request)) return Response.json({ error: 'Local analysis only.' }, { status: 403 });
  const query = new URL(request.url).searchParams;
  if (!/^(0|[1-9]\d{0,7})$/.test(query.get('frame') || '')) return Response.json({ error: 'Invalid frame.' }, { status: 400 });
  try {
    const directory = jobPath((await params).id);
    const result = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'));
    const output = join(directory, 'landing', query.get('frame')!);
    const report = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'));
    if (report.analysisSha256 !== result.analysisSha256 || report.videoSha256 !== result.videoSha256) throw new Error('Changed analysis');
    if (query.has('image')) {
      const image = query.get('image')!;
      if (!/^(0|[1-9]\d{0,7})$/.test(image) || !report.frames.includes(Number(image))) return new Response('Frame not found.', { status: 404 });
      return new Response(await readFile(join(output, 'frames', `${image}.jpg`)), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    return Response.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Before-landing review not found.' }, { status: 404 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!localRequest(request, true)) return Response.json({ error: 'Local analysis only.' }, { status: 403 });
  let frame: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > 1024) { await reader.cancel(); return Response.json({ error: 'Request too large.' }, { status: 413 }); }
      chunks.push(chunk.value);
    }
    frame = JSON.parse(Buffer.concat(chunks).toString('utf8')).frame;
    if (!validFrame(frame)) throw new Error();
  } catch { return Response.json({ error: 'Choose a valid landing frame.' }, { status: 400 }); }
  let directory: string;
  try {
    directory = jobPath((await params).id);
    const result = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'));
    if (frame < Math.round(result.fps) || frame >= Math.round(result.duration * result.fps)) return Response.json({ error: 'Choose a time after the first second and before the recording ends.' }, { status: 422 });
  } catch { return Response.json({ error: 'Completed analysis not found.' }, { status: 404 }); }
  const lockPath = join(jobsRoot, 'active.json');
  let lock;
  try { lock = await acquireAnalysisLock(); }
  catch { return Response.json({ error: 'Another analysis is running. Wait for it to finish.' }, { status: 429 }); }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }));
    await lock.close();
    await execute(join(process.cwd(), 'data/hf-racquet-env/Scripts/python.exe'), ['analysis/landing_coach.py', directory, String(frame)], { cwd: process.cwd(), windowsHide: true, timeout: 240000, maxBuffer: 1024 * 1024 });
    return await GET(new Request(`${request.url}?frame=${frame}`, { headers: request.headers }), { params });
  } catch (error) {
    const detail = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).split('\n').findLast(line => line.startsWith('ValueError:'))?.replace('ValueError: ', '').trim() : null;
    return Response.json({ error: detail || 'Local before-landing coaching failed. Check the local model environment and retry.' }, { status: 422 });
  } finally { await lock.close().catch(() => undefined); await unlink(lockPath).catch(() => undefined); }
}
