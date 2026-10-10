import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { acquireAnalysisLock, jobPath, jobsRoot, localRequest } from '@/lib/analysis-jobs';

export const runtime = 'nodejs';
export const maxDuration = 300;
const execute = promisify(execFile);
const validFrame = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < 100000000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!localRequest(request)) return Response.json({ error: 'Local analysis only.' }, { status: 403 });
  const query = new URL(request.url).searchParams;
  if (!query.has('losses') && !/^(0|[1-9]\d{0,7})$/.test(query.get('frame') || '')) return Response.json({ error: 'Invalid frame.' }, { status: 400 });
  try {
    const directory = jobPath((await params).id);
    const result = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'));
    if (query.has('losses')) {
      const outcomes: Record<number, string> = {};
      for (const rally of result.rallies) {
        try {
          const saved = JSON.parse(await readFile(join(directory, 'loss-reviews', `${rally.id}.json`), 'utf8'));
          if (saved.analysisSha256 === result.analysisSha256 && ['lost','won','unknown'].includes(saved.outcome)) outcomes[rally.id] = saved.outcome;
        } catch { /* Unreviewed rally. */ }
      }
      return Response.json({ analysisSha256: result.analysisSha256, outcomes }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const output = join(directory, 'landing', query.get('frame')!);
    const report = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'));
    if (report.analysisSha256 !== result.analysisSha256 || report.videoSha256 !== result.videoSha256) throw new Error('Changed analysis');
    if (query.has('image')) {
      const image = query.get('image')!;
      if (!/^(0|[1-9]\d{0,7})$/.test(image) || !report.frames.includes(Number(image))) return new Response('Frame not found.', { status: 404 });
      return new Response(await readFile(join(output, 'frames', `${image}.jpg`)), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (query.has('rally') && String(report.rallyId) !== query.get('rally')) return new Response(null, {status:204});
    return Response.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return query.has('rally') ? new Response(null, {status:204}) : Response.json({ error: 'Before-landing review not found.' }, { status: 404 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!localRequest(request, true)) return Response.json({ error: 'Local analysis only.' }, { status: 403 });
  let frame: unknown;
  let rallyId: unknown, outcome: unknown;
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
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    frame = body.frame; rallyId = body.rallyId; outcome = body.outcome;
    if (rallyId === undefined ? !validFrame(frame) : !Number.isSafeInteger(rallyId) || (rallyId as number) < 1) throw new Error();
  } catch { return Response.json({ error: 'Choose a valid landing frame.' }, { status: 400 }); }
  let directory: string;
  try {
    directory = jobPath((await params).id);
    const result = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'));
    if (rallyId !== undefined) {
      const rally = result.rallies.find((r: {id:number;end:number|null}) => r.id === rallyId);
      if (!rally || rally.end === null) return Response.json({ error: 'Choose a rally with an ending; walking/tossing windows are excluded.' }, { status: 422 });
      const savedPath = join(directory, 'loss-reviews', `${rallyId}.json`);
      if (outcome !== undefined) {
        if (typeof outcome !== 'string' || !['lost','won','unknown'].includes(outcome)) return Response.json({ error: 'Invalid outcome.' }, { status: 400 });
        await mkdir(join(directory, 'loss-reviews'), {recursive:true});
        const temporary = `${savedPath}.${crypto.randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify({rallyId, outcome, analysisSha256:result.analysisSha256, reviewedAt:new Date().toISOString()}));
        await rename(temporary, savedPath);
        return Response.json({rallyId, outcome});
      }
      let saved;
      try { saved = JSON.parse(await readFile(savedPath, 'utf8')); } catch { /* Outcome unconfirmed. */ }
      if (saved?.outcome !== 'lost' || saved.analysisSha256 !== result.analysisSha256) return Response.json({error:'Only confirmed near-player losses receive AI coaching.'}, {status:409});
      frame = Math.round(rally.end * result.fps);
    }
    if (!validFrame(frame) || frame >= Math.round(result.duration * result.fps) || (rallyId === undefined && frame < Math.round(result.fps))) return Response.json({ error: 'Choose a valid time within the recording.' }, { status: 422 });
    if (rallyId === undefined && result.options?.llm === false) return Response.json({ error: 'LLM coaching was disabled for this analysis.' }, { status: 409 });
  } catch { return Response.json({ error: 'Completed analysis not found.' }, { status: 404 }); }
  const lockPath = join(jobsRoot, 'active.json');
  let lock;
  try { lock = await acquireAnalysisLock(); }
  catch { return Response.json({ error: 'Another analysis is running. Wait for it to finish.' }, { status: 429 }); }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }));
    await lock.close();
    await execute(join(process.cwd(), 'data/hf-racquet-env/Scripts/python.exe'), ['analysis/landing_coach.py', directory, String(frame), ...(rallyId === undefined ? [] : ['--rally', String(rallyId)])], { cwd: process.cwd(), windowsHide: true, timeout: 240000, maxBuffer: 1024 * 1024 });
    return await GET(new Request(`${request.url}?frame=${frame}`, { headers: request.headers }), { params });
  } catch (error) {
    const detail = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).split('\n').findLast(line => line.startsWith('ValueError:'))?.replace('ValueError: ', '').trim() : null;
    return Response.json({ error: detail || 'Local before-landing coaching failed. Check the local model environment and retry.' }, { status: 422 });
  } finally { await lock.close().catch(() => undefined); await unlink(lockPath).catch(() => undefined); }
}
