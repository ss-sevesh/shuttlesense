import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { jobPath, localRequest } from '@/lib/analysis-jobs';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string; frame: string }> }) {
  if (!localRequest(request)) return new Response('Local analysis only.', { status: 403 });
  try {
    const { id, frame } = await params;
    if (!/^(0|[1-9]\d{0,8})$/.test(frame)) return new Response('Invalid frame.', { status: 400 });
    const directory = jobPath(id);
    const result = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'));
    if (!result.shots.some((shot: { contact?: { frames: (number | null)[] } }) => shot.contact?.frames.includes(Number(frame)))) return new Response('Frame not found.', { status: 404 });
    return new Response(await readFile(join(directory, 'frames', `${frame}.jpg`)), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('Frame not found.', { status: 404 }); }
}
