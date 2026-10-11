import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {access,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {acquireAnalysisLock,jobsRoot,jobPath,localRequest} from '@/lib/analysis-jobs';
import {boundedJson,readLocalJson,writeLocalJson} from '@/lib/local-json';
import {emptyProfile,validateProfile} from '@/lib/player-profile';
import {chatContext,referenceSources,type ChatSource} from '@/lib/chat-context';
import {checkedGuidance,exactEvidence,endingEvidence,savedProfileAnswer,validateGenerated,type ChatAnswer} from '@/lib/chat-policy';
import chatModel from '@/analysis/chat_model.json';
export const runtime='nodejs';
export const maxDuration=420;
const headers={'Cache-Control':'private, no-store'};
type Entry=ChatAnswer&{question:string;createdAt:string;evidenceHash:string;profileHash:string};
function historyPath(id:string) {if(id)jobPath(id);return join(process.cwd(),'data/chat',id||'coach','history.json');}
function lockFailure(error:unknown) {
  const busy=!!error&&typeof error==='object'&&'code' in error&&['EBUSY','EEXIST'].includes(String(error.code));
  return Response.json({error:busy?'Analysis/report/chat is busy. Retry when finished.':'Local work lock unavailable. Retry; if this persists, restart the local app.'},{status:busy?429:503,headers});
}
function runWorker(payload:unknown):Promise<{answer:string;citations:string[];sources:ChatSource[]}> {
  return new Promise((resolve,reject)=>{
    const child=spawn(/* turbopackIgnore: true */ join(process.cwd(),'data/hf-racquet-env/Scripts/python.exe'),['analysis/rag_chat.py','--worker'],{cwd:process.cwd(),windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',settled=false,failed=false;
    const fail=()=>{if(settled)return;failed=true;child.kill();};
    const timer=setTimeout(fail,360000);
    child.on('error',()=>{clearTimeout(timer);settled=true;reject(new Error('Local retrieval/chat unavailable. Run optional RAG setup and check Ollama.'));});
    child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>1024*1024)fail();});
    child.stderr.resume(); // Requests, health details and model diagnostics are never logged.
    child.stdin.on('error',fail);
    child.on('exit',code=>{clearTimeout(timer);if(settled)return;settled=true;if(failed||code!==0)return reject(new Error('Local retrieval/chat unavailable. Run optional RAG setup and check Ollama.'));try{resolve(JSON.parse(output));}catch{reject(new Error('Local answer unreadable. Retry.'));}});
    child.stdin.end(JSON.stringify(payload));
  });
}
export async function GET(request:Request) {
  if(!localRequest(request))return Response.json({error:'Local chat only.'},{status:403});
  try{return Response.json({history:await readLocalJson(historyPath(new URL(request.url).searchParams.get('analysis')??''))??[]},{headers});}
  catch{return Response.json({error:'Chat history unavailable.'},{status:400,headers});}
}
export async function DELETE(request:Request) {
  if(!localRequest(request,true))return Response.json({error:'Local chat only.'},{status:403});
  let lock;
  try{lock=await acquireAnalysisLock();await lock.writeFile(JSON.stringify({pid:process.pid,kind:'chat-delete'}));await lock.close();}
  catch(error){return lockFailure(error);}
  try{await unlink(historyPath(new URL(request.url).searchParams.get('analysis')??'')).catch(error=>{if(error.code!=='ENOENT')throw error;});return Response.json({deleted:true},{headers});}
  catch{return Response.json({error:'Chat could not be deleted.'},{status:400,headers});}
  finally{await lock.close().catch(()=>undefined);await unlink(join(jobsRoot,'active.json')).catch(()=>undefined);}
}
export async function POST(request:Request) {
  if(!localRequest(request,true))return Response.json({error:'Local chat only.'},{status:403});
  let body:{question:string;analysisId:string;rallies:unknown};
  try{body=await boundedJson(request,32768);if(!body||typeof body.question!=='string'||!body.question.trim()||body.question.length>1000||typeof body.analysisId!=='string'||Object.keys(body).some(k=>!['question','analysisId','rallies'].includes(k)))throw new Error();historyPath(body.analysisId);}
  catch{return Response.json({error:'Invalid or oversized chat request.'},{status:400,headers});}
  let lock;
  try{lock=await acquireAnalysisLock();await lock.writeFile(JSON.stringify({pid:process.pid,kind:'chat'}));await lock.close();}
  catch(error){return lockFailure(error);}
  let workerRan=false;
  try {
    const stored=await readLocalJson(join(process.cwd(),'data/player/profile.json'));
    const profile=stored?validateProfile(stored):{...emptyProfile};
    const profileHash=createHash('sha256').update(JSON.stringify(profile)).digest('hex');
    const context=await chatContext(body.analysisId,body.rallies??{}),path=historyPath(body.analysisId);
    const history:Entry[]=await readLocalJson(path)??[];
    if(!Array.isArray(history))throw new Error('Chat history unreadable.');
    const recentEntries=history.filter(h=>h.evidenceHash===context.evidenceHash&&h.profileHash===profileHash).slice(-4);
    const prior=recentEntries.at(-1);
    const guidanceQuestion=prior?.mode==='guidance'&&/\b(shorter|simpler|change|adjust)\b/i.test(body.question)&&/\b(schedule|weekly|routine|plan)\b/i.test(prior.question)?prior.question+'\n'+body.question:body.question;
    let result=checkedGuidance(guidanceQuestion,profile)??savedProfileAnswer(body.question,profile)??exactEvidence(body.question,context)??endingEvidence(body.question,context);
    if(!result) {
      const recent=recentEntries.map(h=>({question:h.question,answer:h.answer.slice(0,1200)}));
      try{await access(join(process.cwd(),'data/hf-racquet-env/Scripts/python.exe'));}catch{throw new Error('Local retrieval/chat unavailable. Run optional RAG setup and check Ollama.');}
      workerRan=true;
      const generated=await runWorker({...context,question:body.question,profile,history:recent,references:referenceSources});
      const available=[...context.sources,...referenceSources];
      if(!Array.isArray(generated.sources)||generated.sources.some(s=>!available.some(a=>a.id===s.id&&a.text===s.text)))throw new Error('Local answer failed source checks. Retry.');
      result=validateGenerated(generated,available.filter(s=>generated.sources.some(g=>g.id===s.id)));
    }
    const current=await chatContext(body.analysisId,body.rallies??{});
    const latestProfile=await readLocalJson(join(process.cwd(),'data/player/profile.json'));
    const latestHash=createHash('sha256').update(JSON.stringify(latestProfile?validateProfile(latestProfile):{...emptyProfile})).digest('hex');
    if(current.evidenceHash!==context.evidenceHash||latestHash!==profileHash)return Response.json({error:'Evidence or profile changed while answering. Retry with current context.'},{status:409,headers});
    const entry:Entry={...result,question:body.question,createdAt:new Date().toISOString(),evidenceHash:context.evidenceHash,profileHash};
    // shortcut: latest 50 turns per explicitly selected recording; add archival/export only when requested.
    await writeLocalJson(path,[...history,entry].slice(-50));
    return Response.json({entry,hasReport:context.hasReport,evidenceHash:context.evidenceHash},{headers});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Local chat failed. Retry.'},{status:422,headers});}
  finally{
    if(workerRan)await Promise.allSettled([chatModel.text.name,chatModel.embedding.name].map(model=>fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,keep_alive:0}),signal:AbortSignal.timeout(5000)})));
    await lock.close().catch(()=>undefined);await unlink(join(jobsRoot,'active.json')).catch(()=>undefined);
  }
}
