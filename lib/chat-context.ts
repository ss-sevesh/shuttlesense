import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {jobPath} from './analysis-jobs';
import {isReviewData,validInterval,type HumanReviews} from './analysis-review';
import {reportEvidence,type MatchReportData} from './match-report';
import guidance from '@/docs/rag-guidance.json';
export type ChatSource={id:string;kind:string;title:string;text:string;url?:string;reviewedAt?:string;attribution?:string;rallyId?:number;time?:number;reportVersion?:string};
export type ChatContext={analysisId:string;evidenceHash:string;reportEvidenceHash:string;hasReport:boolean;sources:ChatSource[];facts:ChatSource[]};
export function textChunks(text:string) {return text.match(/[\s\S]{1,1400}/g)??[];}
export async function chatContext(analysisId:string,rallies:unknown):Promise<ChatContext> {
  if(!analysisId){const hash=createHash('sha256').update(JSON.stringify(referenceSources)).digest('hex');return {analysisId:'coach',evidenceHash:hash,reportEvidenceHash:hash,hasReport:false,sources:[],facts:[]};}
  const directory=jobPath(analysisId), data=JSON.parse(await readFile(join(directory,'result.json'),'utf8'));
  if(!isReviewData(data))throw new Error('Completed recording unavailable.');
  if(!rallies||typeof rallies!=='object'||Array.isArray(rallies))throw new Error('Invalid reviewed boundaries.');
  const reviews:HumanReviews={shots:{},rallies:{}};
  for(const [id,raw] of Object.entries(rallies)) {
    const window=raw as {start:number;end:number;reviewedAt:string};
    if(!data.rallies.some(r=>String(r.id)===id)||!window||!validInterval(window.start,window.end,data.duration)||typeof window.reviewedAt!=='string'||window.reviewedAt.length>80)throw new Error('Invalid reviewed boundaries.');
    reviews.rallies[id]=window;
  }
  const outcomes:Record<number,string>={},losses:Record<number,unknown>={};
  for(const rally of data.rallies) {
    try {const saved=JSON.parse(await readFile(join(directory,'loss-reviews',rally.id+'.json'),'utf8'));if(saved.analysisSha256===data.analysisSha256&&['lost','won','unknown'].includes(saved.outcome))outcomes[rally.id]=saved.outcome;}catch{/* Missing markings stay unknown. */}
    if(rally.end!==null&&outcomes[rally.id]==='lost')try {const saved=JSON.parse(await readFile(join(directory,'landing',String(Math.round(rally.end*data.fps)),'report.json'),'utf8'));if(saved.analysisSha256===data.analysisSha256&&saved.rallyId===rally.id&&saved.coaching?.status==='experimental')losses[rally.id]=saved.coaching.answer;}catch{/* No generated ending interpretation. */}
  }
  const evidence=reportEvidence(data,reviews,outcomes,losses);
  const evidenceHash=createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
  const facts:ChatSource[]=[{id:'recording',kind:'original_evidence',title:'Selected recording',text:JSON.stringify({duration:data.duration,rallies:evidence.rallies.filter(r=>r.eligible).map(r=>({id:r.id,start:r.start,end:r.end,outcome:r.outcome,outcomeSource:r.outcomeSource})),limits:evidence.interpretation})}];
  const sources:ChatSource[]=[facts[0]];
  for(const rally of evidence.rallies.filter(r=>r.eligible)) {
    const add=(id:string,title:string,time:number,value:unknown)=>{const s={id,kind:'original_evidence',title,rallyId:rally.id,time,text:JSON.stringify(value),reportVersion:evidence.schemaVersion};sources.push(s);facts.push(s);};
    add('rally-'+rally.id,`Window ${rally.id}: boundaries and user outcome`,rally.start,{id:rally.id,start:rally.start,end:rally.end,unit:'seconds',outcome:rally.outcome,outcomeSource:rally.outcomeSource,boundarySource:rally.boundarySource});
    for(const pose of rally.hitPoses)add(`pose-${rally.id}-${pose.frame}`,`Window ${rally.id}: pose at ${pose.time} s`,pose.time,pose);
    if(rally.ending?.evidence)add('ending-'+rally.id,`Window ${rally.id}: ending image measurements`,rally.ending.evidence.time,{...rally.ending.evidence,limits:'Image pixels / wrist proxy only. Contact, physical distance, intent and loss cause are unverified.'});
  }
  let report:MatchReportData|null=null;
  try {const saved=JSON.parse(await readFile(join(directory,'match-reports',evidenceHash,'report.json'),'utf8'));if(saved.evidenceSha256===evidenceHash&&saved.analysisSha256===data.analysisSha256&&saved.status==='experimental')report=saved;}catch{/* Stale/missing reports are excluded. */}
  if(report) {
    for(const [section,text] of Object.entries(report.answer))for(const [index,chunk] of textChunks(text).entries())sources.push({id:`report-${section}-${index}`,kind:'generated_interpretation',title:'Generated report: '+section,text:chunk,reportVersion:evidence.schemaVersion});
    for(const rally of report.rallyReports)for(const [section,text] of Object.entries(rally.answer))for(const [index,chunk] of textChunks(text).entries())sources.push({id:`report-rally-${rally.rallyId}-${section}-${index}`,kind:'generated_interpretation',title:`Generated window ${rally.rallyId}: ${section}`,rallyId:rally.rallyId,time:rally.start,text:chunk,reportVersion:evidence.schemaVersion});
  }
  if(sources.length>2000||facts[0].text.length>12000)throw new Error('Recording exceeds local chat capacity; no evidence was silently dropped.');
  const sourceHash=createHash('sha256').update(evidenceHash+JSON.stringify(sources)+JSON.stringify(referenceSources)).digest('hex');
  return {analysisId,evidenceHash:sourceHash,reportEvidenceHash:evidenceHash,hasReport:!!report,sources,facts};
}
export const referenceSources:ChatSource[]=guidance;
