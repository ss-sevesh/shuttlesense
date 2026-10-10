"use client";

import { useEffect, useState } from 'react';
import type { ReviewData, HumanReviews } from '@/lib/analysis-review';
import type { MatchReportData } from '@/lib/match-report';

export function MatchReport({data,videoUrl,reviews,outcomes}:{data:ReviewData;videoUrl:string;reviews:HumanReviews;outcomes:Record<number,string>}) {
  const [report,setReport]=useState<MatchReportData|null>(null);
  const [evidence,setEvidence]=useState<unknown>(null);
  const [snapshot,setSnapshot]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const endpoint=`${videoUrl.replace(/\/video$/,'')}/report`;
  const windows=JSON.stringify({rallies:reviews.rallies,outcomes});
  const rallyLabel=(id:number)=>{const index=data.rallies.filter(r=>r.end!==null || reviews.rallies[r.id]).findIndex(r=>r.id===id);return index>=0?`Rally ${index+1} (window ${id})`:`Window ${id}`;};
  useEffect(()=>{
    let cancelled=false;
    fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rallies:reviews.rallies,generate:false})}).then(async response=>{
      if(!response.ok || response.status===204)return;
      const result=await response.json();
      if(!cancelled && result.report?.analysisSha256===data.analysisSha256){setReport(result.report);setEvidence(result.evidence);setSnapshot(windows);}
    }).catch(()=>undefined);
    return()=>{cancelled=true;};
  },[endpoint,data.analysisSha256,windows]);
  async function generate() {
    if(busy)return;
    setBusy(true);setError('');
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rallies:reviews.rallies})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error ?? 'Could not generate report.');
      if(result.report?.analysisSha256!==data.analysisSha256 || result.report?.status!=='experimental')throw new Error('Report does not match this analysis.');
      setReport(result.report);setEvidence(result.evidence);setSnapshot(windows);
    }catch(e){setError(e instanceof Error?e.message:'Report failed.');}
    finally{setBusy(false);}
  }
  function download(format:'report'|'evidence') {
    if(!report)return;
    const text=format==='evidence'?JSON.stringify(evidence,null,2):[
      '# ShuttleSense — Match review',`Recording: ${data.fileName}`,`Generated: ${report.generatedAt}`,`Model: ${report.model}`,`Evidence SHA256: ${report.evidenceSha256}`,
      'Experimental coaching from the available clip, not a verified assessment of the entire original match.',
      ...Object.entries(report.answer).map(([key,value])=>`## ${key[0].toUpperCase()+key.slice(1)}\n\n${value}`),
      ...report.rallyReports.map(r=>`## ${rallyLabel(r.rallyId)}: ${r.start.toFixed(3)}–${r.end.toFixed(3)} s\n\n${Object.entries(r.answer).map(([key,value])=>`### ${key}\n\n${value}`).join('\n\n')}`),
    ].join('\n\n');
    const url=URL.createObjectURL(new Blob([text],{type:format==='report'?'text/markdown':'application/json'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=format==='report'?'shuttlesense-match-report.md':'shuttlesense-report-evidence.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="match-report" aria-label="AI match report" aria-busy={busy}>
    <div className="review-event-heading"><div><span className="intro-label">MATCH REVIEW · LOCAL AI</span><h3>Your match report</h3></div><button type="button" disabled={busy} onClick={()=>void generate()}>{busy?'Preparing report locally…':report?'Refresh match report':'Generate match report'}</button></div>
    <p>Reviews eligible rallies, all hit-pose timestamps and available body angles, rally movement and ending evidence. Between-point motion is excluded. Covers this recording only; attempted shots are cautious interpretations.</p>
    <p role="status" aria-live="polite">{error || (busy?'The local model is reviewing each rally. This can take several minutes.':'')}</p>
    {report && <><p className="report-meta">{report.model} · {report.rallyReports.length} rally reviews · {new Date(report.generatedAt).toLocaleString()}</p>{snapshot!==windows&&<p role="alert">Rally boundaries or outcomes changed. Refresh the report before using it.</p>}
      <div className="report-sections">{Object.entries(report.answer).map(([key,value])=><section key={key}><h4>{key[0].toUpperCase()+key.slice(1)}</h4><p>{value}</p></section>)}</div>
      <details><summary>Read each rally review</summary>{report.rallyReports.map(r=><section key={r.rallyId}><h4>{rallyLabel(r.rallyId)} · {r.start.toFixed(1)}–{r.end.toFixed(1)} s</h4>{Object.entries(r.answer).map(([key,value])=><p key={key}><strong>{key}: </strong>{value}</p>)}</section>)}</details>
      <div className="report-downloads"><button type="button" onClick={()=>download('report')}>Download report</button><button type="button" onClick={()=>download('evidence')}>Download AI evidence</button></div>
    </>}
  </section>;
}
