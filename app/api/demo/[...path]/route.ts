import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {demoData,demoHash,demoLoss,demoReport} from '@/lib/public-demo';
import {byteRange,localRequest} from '@/lib/analysis-jobs';
import {reportEvidence} from '@/lib/match-report';
import {parseReviews} from '@/lib/analysis-review';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){
  const path=(await params).path, query=new URL(request.url).searchParams;
  if(path[0]==='video'){
    const data=await readFile(join(process.cwd(),'public/demo/court.mp4'));
    const range=byteRange(request.headers.get('range'),data.length);if(!range)return new Response(null,{status:416});
    const [start,end]=range;
    return new Response(data.subarray(start,end+1),{status:request.headers.has('range')?206:200,headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':String(end-start+1),...(request.headers.has('range')?{'Content-Range':`bytes ${start}-${end}/${data.length}`}:{})}});
  }
  if(path[0]==='landing' && query.has('losses'))return Response.json({analysisSha256:demoHash,outcomes:{1:'lost',2:'lost'}});
  if(path[0]==='landing'){
    const id=Number(query.get('rally')) || (Number(query.get('frame'))===150?1:2);
    if(query.has('image'))return image(id);
    return Response.json(demoLoss(id));
  }
  if(path[0]==='frames' && ['135','315'].includes(path[1]))return image(path[1]==='135'?1:2);
  return new Response(null,{status:404});
}
async function image(id:number){return new Response(await readFile(join(process.cwd(),`public/demo/attempt-${id===1?1:2}.jpg`)),{headers:{'Content-Type':'image/jpeg'}});}
export async function POST(request:Request,{params}:{params:Promise<{path:string[]}>}){
  if(!localRequest(request,true))return Response.json({error:'Local demo only.'},{status:403});
  let body;
  try{
    const reader=request.body?.getReader();if(!reader)throw new Error();
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();return new Response(null,{status:413});}chunks.push(part.value);}
    body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body || typeof body!=='object' || Array.isArray(body))throw new Error();
  }catch{return new Response(null,{status:400});}
  const path=(await params).path;
  if(path[0]==='report')return body.generate===false?new Response(null,{status:204}):Response.json({report:demoReport,evidence:reportEvidence(demoData,parseReviews(JSON.stringify({rallies:body.rallies,shots:{}}),demoData),{1:'lost',2:'lost'},{})});
  if(path[0]==='landing'){
    if(![1,2].includes(body.rallyId) || (body.outcome!==undefined && !['lost','won','unknown'].includes(body.outcome)))return new Response(null,{status:400});
    return Response.json(body.outcome?{rallyId:body.rallyId,outcome:body.outcome}:demoLoss(body.rallyId));
  }
  return new Response(null,{status:404});
}
