import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { byteRange, jobPath, localRequest } from '@/lib/analysis-jobs';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!localRequest(request)) return new Response('Local analysis only.', { status: 403 });
  try {
    const path = join(jobPath((await params).id), 'source.mp4');
    const { size } = await stat(path);
    const range = byteRange(request.headers.get('range'), size);
    if (!range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const [start, end] = range;
    const partial = request.headers.has('range');
    return new Response(Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, {
      status: partial ? 206 : 200,
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) },
    });
  } catch { return new Response('Video not found.', { status: 404 }); }
}
