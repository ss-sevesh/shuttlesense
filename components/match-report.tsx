"use client";

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ReviewData, HumanReviews } from '@/lib/analysis-review';
import type { MatchReportData, reportEvidence } from '@/lib/match-report';
import { reportHtml, type ReportPhoto } from '@/lib/report-html';
import { AttemptPhoto } from './attempt-photo';

export function MatchReport({data,videoUrl,reviews,outcomes}:{data:ReviewData;videoUrl:string;reviews:HumanReviews;outcomes:Record<number,string>}) {
  const [report,setReport]=useState<MatchReportData|null>(null);
  const [evidence,setEvidence]=useState<ReturnType<typeof reportEvidence>|null>(null);
  const [snapshot,setSnapshot]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [exporting,setExporting]=useState(false);
  const endpoint=`${videoUrl.replace(/\/video$/,'')}/report`;
  const windows=JSON.stringify({rallies:reviews.rallies,outcomes});
  const rallyLabel=(id:number)=>{const index=data.rallies.filter(r=>r.end!==null || reviews.rallies[r.id]).findIndex(r=>r.id===id);return index>=0?`Rally ${index+1} (window ${id})`:`Window ${id}`;};
  const photoFor=(id:number)=>evidence?.rallies.find(r=>r.id===id && r.eligible && r.outcome==='lost')?.ending?.evidence;
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
  async function download(format:'report'|'evidence'|'pdf') {
    if(!report || exporting)return;
    const focused=document.activeElement;
    setExporting(true);setError('');
    try {
      const photos:ReportPhoto[]=[];
      if(format!=='evidence')for(const rally of report.rallyReports) {
        const ending=photoFor(rally.rallyId);if(!ending)continue;
        const response=await fetch(`${videoUrl.replace(/\/video$/,'')}/frames/${ending.frame}`);
        if(!response.ok || response.headers.get('content-type')?.split(';')[0]!=='image/jpeg')throw new Error('Could not load a loss photo. Retry the download; no incomplete report was saved.');
        const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not embed the loss photo.'));response.blob().then(blob=>reader.readAsDataURL(blob),reject);});
        let racket:[number,number]|null=null;
        try {const mark=JSON.parse(localStorage.getItem(`shuttlesense-racket-${data.analysisSha256}-${ending.frame}`) ?? 'null');if(Array.isArray(mark)&&mark.length===2&&mark.every(v=>Number.isFinite(v)&&v>=0&&v<=1))racket=mark as [number,number];}catch{/* Optional manual annotation. */}
        photos.push({rallyId:rally.rallyId,dataUrl,evidence:ending,racket});
      }
      const text=format==='evidence'?JSON.stringify(evidence,null,2):reportHtml(data,report,photos,Object.fromEntries(report.rallyReports.map(r=>[r.rallyId,rallyLabel(r.rallyId)])));
      const url=URL.createObjectURL(new Blob([text],{type:format==='evidence'?'application/json':'text/html'}));
      if(format==='pdf'){
        const frame=document.createElement('iframe');frame.title='Print match report';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
        frame.style.cssText='position:fixed;width:1px;height:1px;bottom:0;opacity:0;border:0;pointer-events:none';
        // Re-enable the invoking button before restoring keyboard focus.
        const clean=()=>{frame.remove();URL.revokeObjectURL(url);flushSync(()=>setExporting(false));if(focused instanceof HTMLElement)focused.focus();};
        try{
          await new Promise<void>((resolve,reject)=>{
            const timeout=setTimeout(()=>reject(new Error('Could not prepare PDF. Download the report and print it instead.')),15000);
            frame.onload=()=>{clearTimeout(timeout);resolve();};frame.onerror=()=>{clearTimeout(timeout);reject(new Error('Could not open the printable report.'));};
            frame.src=url;document.body.append(frame);
          });
          if(!frame.contentWindow)throw new Error('Could not open the printable report.');
          frame.contentWindow.addEventListener('afterprint',clean,{once:true});
          frame.contentWindow.print();
        }catch(e){clean();throw e;}
        return;
      }
      const anchor=document.createElement('a');anchor.href=url;anchor.download=format==='report'?'shuttlesense-match-report.html':'shuttlesense-report-evidence.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setError(e instanceof Error?e.message:'Could not download report.');}
    finally{setExporting(false);}
  }
  return <section className="match-report" aria-label="AI match report" aria-busy={busy}>
    <div className="review-event-heading"><div><span className="intro-label">MATCH REVIEW · LOCAL AI</span><h2>Your match report</h2></div><button type="button" disabled={busy} onClick={()=>void generate()}>{busy?'Preparing report locally…':report?'Refresh match report':'Generate match report'}</button></div>
    <p>The local report reviews tracked shuttle positions relative to the near player, the ending attempt and every eligible hit pose. Each drill should refer to a visible sequence in this recording. Loss photos are attached afterwards; this model receives text only.</p>
    <p role="status" aria-live="polite">{error || (busy?'The local model is reviewing each rally. This can take several minutes.':'')}</p>
    {report && <>{snapshot===windows&&videoUrl.startsWith('/api/analysis/')&&<a className="secondary-button" href={'/workspace?view=chat&analysis='+videoUrl.split('/')[3]}>Chat about this match</a>}<p className="report-meta">{report.model} · {report.rallyReports.length} rally reviews · {new Date(report.generatedAt).toLocaleString()}{report.generationSeconds!==undefined?` · Generated in ${report.generationSeconds.toFixed(1)} s`:''}</p>{snapshot!==windows&&<p role="alert">Rally boundaries or outcomes changed. Refresh the report before using it.</p>}
      <div className="report-sections">{Object.entries(report.answer).map(([key,value])=><section key={key}><h3>{key[0].toUpperCase()+key.slice(1)}</h3><p>{value}</p></section>)}</div>
      <details><summary>Read each rally review</summary>{report.rallyReports.map(r=><section className="report-rally" key={r.rallyId}><h3>{rallyLabel(r.rallyId)} · {r.start.toFixed(1)}–{r.end.toFixed(1)} s</h3><p className="report-meta">Outcome: {r.outcome}{r.outcome!=='unknown'?' · user marked':''}</p>{photoFor(r.rallyId)&&<AttemptPhoto data={data} videoUrl={videoUrl} evidence={photoFor(r.rallyId)!} readOnly label={`Lost rally ${r.rallyId} report photo`}/>}<div>{Object.entries(r.answer).map(([key,value])=><p key={key}><strong>{key}: </strong>{value}</p>)}</div>{evidence?.rallies.find(item=>item.id===r.rallyId)?.outcome==='lost'&&!photoFor(r.rallyId)&&<p>No reliable attempt photo is available for this rally.</p>}</section>)}</details>
      <p className="report-meta">Save as PDF opens a formatted A4 report with page numbers; choose “Save as PDF” in the print dialog and keep the default margins. Download report saves the same illustrated layout as offline HTML. The separate evidence appendix preserves all angles and actual text requests.</p>
      <div className="report-downloads"><button type="button" disabled={exporting||busy||snapshot!==windows} onClick={()=>void download('pdf')}>Save as PDF</button><button type="button" disabled={exporting||busy||snapshot!==windows} onClick={()=>void download('report')}>{exporting?'Preparing download…':'Download report'}</button><button type="button" disabled={exporting} onClick={()=>void download('evidence')}>Download AI evidence</button></div>
    </>}
  </section>;
}
