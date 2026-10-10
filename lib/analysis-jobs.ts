import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { analysisOptions, type AnalysisOptions } from './analysis-options.ts';

export const jobsRoot = join(process.cwd(), 'data', 'analysis-jobs');
export const uploadLimit = 100 * 1024 * 1024;
const execute = promisify(execFile);
const lockPath = join(jobsRoot, 'active.json');
export function jobPath(id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw new Error('Invalid analysis ID.');
  return join(jobsRoot, id);
}
export function localRequest(request: Request, requireOrigin = false) {
  const url = new URL(request.url);
  const local = ['localhost', '127.0.0.1', '[::1]'];
  const host = request.headers.get('host');
  let address: URL;
  try { address = new URL(`${url.protocol}//${host}`); } catch { return false; }
  if (!local.includes(url.hostname) || !host || address.host !== host || !local.includes(address.hostname)) return false;
  const origin = request.headers.get('origin');
  if (!origin) return !requireOrigin;
  try { const source = new URL(origin); return source.host === host && source.protocol === url.protocol; } catch { return false; }
}
export async function readStatus(id: string) {
  const directory = jobPath(id);
  const status = JSON.parse(await readFile(join(directory, 'status.json'), 'utf8'));
  if (status.status === 'complete') status.result = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'));
  return status;
}
export async function acquireAnalysisLock() {
  // shortcut: stale recovery assumes sequential local requests; use atomic recovery before concurrent/public serving.
  await mkdir(jobsRoot, { recursive: true });
  try {
    const active = JSON.parse(await readFile(lockPath, 'utf8'));
    try { process.kill(active.pid, 0); throw new Error('Another full-video analysis is running. Wait for it to finish.'); }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
      await unlink(lockPath);
    }
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  const lock = await open(lockPath, 'wx');
  return lock;
}
export async function startJob(file: File, corners: number[], selected?: AnalysisOptions) {
  const options = analysisOptions(selected);
  if (options.llm) throw new Error('Whole-video LLM coaching is disabled. Generate an explanation for a confirmed lost rally after analysis.');
  const lock = await acquireAnalysisLock();
  await lock.writeFile(JSON.stringify({ pid: process.pid }));
  await lock.close();
  let id: string | undefined;
  try {
    id = randomUUID();
    const directory = jobPath(id);
    await mkdir(directory);
    const source = `original${/\.(mp4|mov|webm)$/i.exec(file.name)![0].toLowerCase()}`;
    await writeFile(join(directory, source), new Uint8Array(await file.arrayBuffer()));
    await writeFile(join(directory, 'request.json'), JSON.stringify({ source, fileName: file.name, corners, options }));
    const python = process.env.PYTHON_EXECUTABLE || 'python';
    await execute(python, ['analysis/review_job.py', directory, '--validate'], { cwd: process.cwd(), windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
    await writeFile(join(directory, 'status.json'), JSON.stringify({ id, status: 'queued', stage: 'Queued for full-video analysis', progress: 0 }));
    const child = spawn(/* turbopackIgnore: true */ python, ['-u', 'analysis/review_job.py', directory], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore' });
    if (!child.pid) throw new Error('Could not start the local Python analysis worker.');
    await writeFile(lockPath, JSON.stringify({ id, pid: child.pid }));
    const release = async () => {
      try {
        const status = JSON.parse(await readFile(join(directory, 'status.json'), 'utf8'));
        if (!['complete', 'failed'].includes(status.status)) {
          await writeFile(join(directory, 'status.json'), JSON.stringify({ id, status: 'failed', stage: 'Worker stopped', progress: 0, error: 'The analysis worker stopped. Retry the upload and check that Python and the local model environments are available.' }));
        }
      } finally {
        const active = await readFile(lockPath, 'utf8').then(JSON.parse).catch(() => null);
        if (active?.id === id) await unlink(lockPath).catch(() => undefined);
      }
    };
    child.once('exit', () => { void release().catch(console.error); });
    child.once('error', () => { void release().catch(console.error); });
    return { id, status: 'queued' as const };
  } catch (error) {
    await unlink(lockPath).catch(() => undefined);
    if (error && typeof error === 'object' && 'stderr' in error) {
      const text = String(error.stderr);
      const detail = text.split('\n').findLast(line => line.startsWith('ValueError:'))?.replace('ValueError: ', '');
      throw new Error(detail || 'Video validation failed. Reset the four distinct court corners and use an upright, readable court video.');
    }
    throw error;
  }
}

export function byteRange(value: string | null, size: number): [number, number] | null {
  if (!value) return [0, size - 1];
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end || (!match[1] && Number(match[2]) === 0)) return null;
  return [start, end];
}
