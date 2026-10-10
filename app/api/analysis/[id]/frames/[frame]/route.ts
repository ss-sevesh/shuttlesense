import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { jobPath, localRequest } from '@/lib/analysis-jobs';
export const runtime = 'nodejs';
const execute = promisify(execFile);

export async function GET(request: Request, { params }: { params: Promise<{ id: string; frame: string }> }) {
  if (!localRequest(request)) return new Response('Local analysis only.', { status: 403 });
  try {
    const { id, frame } = await params;
    if (!/^(0|[1-9]\d{0,8})$/.test(frame)) return new Response('Invalid frame.', { status: 400 });
    const directory = jobPath(id);
    const result = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'));
    const ending = result.endingReview?.some((item: {evidence?: {frame:number}|null}) => item.evidence?.frame === Number(frame));
    if (!ending && !result.shots.some((shot: { contact?: { frames: (number | null)[] } }) => shot.contact?.frames.includes(Number(frame)))) return new Response('Frame not found.', { status: 404 });
    const file = join(directory, 'frames', `${frame}.jpg`);
    let picture: Buffer;
    try { picture = await readFile(file); }
    catch {
      if (!ending) throw new Error('Frame unavailable');
      await execute(join(process.cwd(), 'data/hf-racquet-env/Scripts/python.exe'), ['analysis/evidence_frame.py', directory, frame], {cwd:process.cwd(),windowsHide:true,timeout:30000,maxBuffer:1024*1024});
      picture = await readFile(file);
    }
    return new Response(new Uint8Array(picture), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('Frame not found.', { status: 404 }); }
}
