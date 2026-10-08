import { localRequest, readStatus } from '@/lib/analysis-jobs';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!localRequest(request)) return Response.json({ error: 'Local analysis only.' }, { status: 403 });
  try { return Response.json(await readStatus((await params).id), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Analysis not found.' }, { status: 404 }); }
}
