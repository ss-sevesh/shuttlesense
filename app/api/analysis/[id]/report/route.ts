import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { acquireAnalysisLock, jobPath, jobsRoot, localRequest } from '@/lib/analysis-jobs';
import { isReviewData, validInterval, type HumanReviews } from '@/lib/analysis-review';
import { reportEvidence } from '@/lib/match-report';

export const runtime='nodejs';
export const maxDuration=900;
const execute=promisify(execFile);

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(!localRequest(request,true))return Response.json({error:'Local analysis only.'},{status:403});
  let body;
  try {
    const reader=request.body?.getReader();if(!reader)throw new Error();
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();return Response.json({error:'Request too large.'},{status:413});}chunks.push(part.value);}
    body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!body || typeof body!=='object' || Array.isArray(body) || !body.rallies || typeof body.rallies!=='object' || Array.isArray(body.rallies) || (body.generate!==undefined && typeof body.generate!=='boolean'))throw new Error();
  }catch{return Response.json({error:'Invalid report request.'},{status:400});}
  let directory:string, output:string, evidence:ReturnType<typeof reportEvidence>;
  try {
    directory=jobPath((await params).id);
    const data=JSON.parse(await readFile(join(directory,'result.json'),'utf8'));
    if(!isReviewData(data))throw new Error('Invalid analysis.');
    const reviews:HumanReviews={shots:{},rallies:{}};
    for(const [id,window] of Object.entries(body.rallies)) {
      const value=window as {start:number;end:number;reviewedAt:string};
      if(!data.rallies.some(r=>String(r.id)===id) || !value || !validInterval(value.start,value.end,data.duration) || typeof value.reviewedAt!=='string')return Response.json({error:'Invalid reviewed rally boundaries.'},{status:422});
      reviews.rallies[Number(id)]={start:value.start,end:value.end,reviewedAt:value.reviewedAt};
    }
    const outcomes:Record<number,string>={},losses:Record<number,unknown>={};
    for(const r of data.rallies) {
      try {const saved=JSON.parse(await readFile(join(directory,'loss-reviews',`${r.id}.json`),'utf8'));if(saved.analysisSha256===data.analysisSha256 && ['lost','won','unknown'].includes(saved.outcome))outcomes[r.id]=saved.outcome;}catch{/* Unconfirmed outcome. */}
      if(r.end!==null && outcomes[r.id]==='lost')try {
        const saved=JSON.parse(await readFile(join(directory,'landing',String(Math.round(r.end*data.fps)),'report.json'),'utf8'));
        if(saved.analysisSha256===data.analysisSha256 && saved.rallyId===r.id && saved.coaching?.status==='experimental')losses[r.id]=saved.coaching.answer;
      }catch{/* Missing ending explanation remains unknown. */}
    }
    evidence=reportEvidence(data,reviews,outcomes,losses);
    if(!evidence.rallies.some(r=>r.eligible))return Response.json({error:'No completed or verified rallies to review.'},{status:422});
    const serialized=JSON.stringify(evidence);
    const key=createHash('sha256').update(serialized).digest('hex');
    output=join(directory,'match-reports',key);
    try {const report=JSON.parse(await readFile(join(output,'report.json'),'utf8'));if(report.evidenceSha256===key && report.analysisSha256===data.analysisSha256 && report.status==='experimental')return Response.json({report,evidence:{...evidence,modelRequests:report.modelRequests}},{headers:{'Cache-Control':'no-store'}});}catch{/* Not generated yet. */}
    if(body.generate===false)return new Response(null,{status:204});
    await mkdir(output,{recursive:true});
    const temporary=join(output,`evidence.${crypto.randomUUID()}.tmp`);
    await writeFile(temporary,serialized);await rename(temporary,join(output,'evidence.json'));
  }catch{return Response.json({error:'Completed analysis not found or unreadable.'},{status:404});}
  let lock;
  try{lock=await acquireAnalysisLock();}catch{return Response.json({error:'Another analysis is running. Wait for it to finish.'},{status:429});}
  try {
    await lock.writeFile(JSON.stringify({pid:process.pid}));await lock.close();
    await execute(join(process.cwd(),'data/hf-racquet-env/Scripts/python.exe'),['analysis/match_report.py',directory,output.split(/[\\/]/).at(-1)!],{cwd:process.cwd(),windowsHide:true,timeout:840000,maxBuffer:1024*1024});
    const report=JSON.parse(await readFile(join(output,'report.json'),'utf8'));
    return Response.json({report,evidence:{...evidence,modelRequests:report.modelRequests}},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const detail=error && typeof error==='object' && 'stderr' in error?String(error.stderr).split('\n').findLast(line=>line.startsWith('ValueError:'))?.replace('ValueError: ','').trim():null;
    return Response.json({error:detail || 'Local match report failed. Check the local CUDA/model environment and retry.'},{status:422});
  }finally{await lock.close().catch(()=>undefined);await unlink(join(jobsRoot,'active.json')).catch(()=>undefined);}
}
