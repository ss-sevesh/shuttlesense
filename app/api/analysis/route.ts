import { localRequest, startJob, uploadLimit } from '@/lib/analysis-jobs';
import { analysisOptions } from '@/lib/analysis-options';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!localRequest(request, true)) return Response.json({ error: 'Analysis is available on this local machine only.' }, { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return Response.json({ error: 'Choose a video and mark its court corners.' }, { status: 400 });
  try {
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: 'No upload received.' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > uploadLimit + 65536) { await reader.cancel(); return Response.json({ error: 'Choose a video under 100 MB.' }, { status: 413 }); }
      chunks.push(chunk.value);
    }
    const form = await new Response(new Uint8Array(Buffer.concat(chunks)), { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData();
    const file = form.get('video');
    if (!(file instanceof File) || !file.size || file.size > uploadLimit || !/\.(mp4|mov|webm)$/i.test(file.name) || (file.type && !['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type))) return Response.json({ error: 'Choose a readable MP4, MOV or WebM under 100 MB.' }, { status: 400 });
    const corners: unknown = JSON.parse(String(form.get('corners')));
    if (!Array.isArray(corners) || corners.length !== 8 || !corners.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) return Response.json({ error: 'Mark four distinct court corners inside the picture.' }, { status: 400 });
    const options = analysisOptions(form.has('options') ? JSON.parse(String(form.get('options'))) : undefined);
    return Response.json(await startJob(file, corners, options), { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed.';
    return Response.json({ error: message }, { status: message.includes('Another full-video') || message.includes('EEXIST') ? 429 : 422 });
  }
}
