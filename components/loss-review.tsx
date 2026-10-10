"use client";

import { useEffect, useState } from 'react';
import type { ReviewData, ShotCoaching } from '@/lib/analysis-review';
import { readable } from '@/lib/analysis-review';
import type { ReplayWindow } from './analysis-camera';
import { AttemptPhoto } from './attempt-photo';

export type LossReport = { rallyId: number; landingFrame: number; frames: number[]; analysisSha256: string; coaching: ShotCoaching };
export function LossReview({ data, videoUrl, replay, onReview, selected, onSelect }: { data: ReviewData; videoUrl: string; replay: (value: Omit<ReplayWindow, 'token'>) => void; onReview:(outcomes:Record<number,string>,report:LossReport|null,selected:number|null)=>void; selected:number|null;onSelect:(id:number|null)=>void }) {
  const endpoint = `${videoUrl.replace(/\/video$/, '')}/landing`;
  const rallies = data.rallies.filter(r => r.end !== null);
  const [outcomes, setOutcomes] = useState<Record<number,string>>({});
  const [report, setReport] = useState<LossReport | null>(null);
  const activeReport = report?.rallyId === selected ? report : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const rally = rallies.find(r => r.id === selected);
  const ending = data.endingReview?.find(e => e.rallyId === selected);
  const losses = rallies.filter(r => outcomes[r.id] === 'lost');
  useEffect(() => {onReview(outcomes,report,selected);}, [outcomes,report,selected,onReview]);
  useEffect(() => {
    let cancelled = false;
    fetch(`${endpoint}?losses=1`).then(async response => {
      if (!response.ok) throw new Error('Could not load rally outcomes.');
      const saved = await response.json();
      if (saved.analysisSha256 !== data.analysisSha256) throw new Error('Rally outcomes belong to a different analysis.');
      if (!cancelled) { setOutcomes(saved.outcomes); const firstLoss=rallies.find(r => saved.outcomes[r.id] === 'lost');if(firstLoss)onSelect(firstLoss.id); setReady(true); }
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  // The saved analysis does not change within this mounted review.
  }, [endpoint, data.analysisSha256, onSelect]);
  useEffect(() => {
    let cancelled = false;
    setReport(null);
    if (!rally || outcomes[rally.id] !== 'lost') return;
    fetch(`${endpoint}?frame=${Math.round(rally.end! * data.fps)}&rally=${rally.id}`).then(async response => {
      if (!response.ok || response.status === 204) return;
      const saved = await response.json();
      if (!cancelled && saved.rallyId === rally.id && saved.analysisSha256 === data.analysisSha256) setReport(saved);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [selected, outcomes, endpoint, data.analysisSha256, data.fps]);
  async function mark(id: number, outcome: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rallyId:id,outcome})});
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error);
      setOutcomes(previous => ({...previous,[id]:outcome}));
      if (outcome === 'lost') onSelect(id);
      else if (selected === id) { setReport(null); }
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not save outcome.'); }
    finally { setBusy(false); }
  }
  async function generate() {
    if (!rally || busy || outcomes[rally.id] !== 'lost') return;
    setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rallyId:rally.id})});
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error);
      if (saved.rallyId !== rally.id || saved.analysisSha256 !== data.analysisSha256 || saved.frames?.length !== 5) throw new Error('AI evidence does not match this rally.');
      setReport(saved);
    } catch(e) { setError(e instanceof Error ? e.message : 'Explanation failed.'); }
    finally { setBusy(false); }
  }
  return <section className="loss-review" aria-label="Lost rally review" aria-busy={busy}>
    <div className="review-event-heading"><div><span className="intro-label">NEAR PLAYER · ENDING REVIEW</span><h3>{losses.length} lost {losses.length === 1 ? 'rally' : 'rallies'}</h3></div></div>
    <div className="loss-tabs" role="group" aria-label="Lost rallies">{losses.map((r,index) => <button type="button" key={r.id} disabled={busy} aria-pressed={selected === r.id} onClick={() => {onSelect(r.id);setError('');replay({start:Math.max(r.start,r.end!-3),end:r.end!});}}>Loss {index+1} · {r.end!.toFixed(1)} s</button>)}</div>
    {ready && !losses.length && <p>No confirmed losses yet. Mark a completed rally as Lost below to review its ending.</p>}
    {!ready && !error && <p role="status">Loading saved outcomes…</p>}
    {rally && outcomes[rally.id] === 'lost' && <div className="loss-selected">
      <div className="loss-title"><h4>What happened before {rally.end!.toFixed(1)} s?</h4><button type="button" onClick={() => replay({start:rally.start,end:rally.end!})}>Replay full rally</button><button type="button" onClick={() => replay({start:Math.max(rally.start,rally.end!-3),end:rally.end!})}>Replay final seconds</button></div>
      {ending?.evidence ? <div className="loss-observation"><button type="button" onClick={() => replay({start:ending.evidence!.time,end:ending.evidence!.time,paused:true})}>Show attempt at {ending.evidence.time.toFixed(3)} s</button><p>{readable(ending.status)} · {ending.evidence.pose}</p></div> : <p>Attempt or distance evidence is unavailable.</p>}
      <div className="loss-explanation"><h4>Possible attempt & why it failed</h4>
      {ending?.evidence && <AttemptPhoto key={`${data.analysisSha256}-${ending.evidence.frame}`} data={data} videoUrl={videoUrl} evidence={ending.evidence}/>}

        {activeReport?.coaching.status === 'experimental' && activeReport.coaching.answer ? <><p>{activeReport.coaching.answer.visibleEvidence}</p><h5>Try next time</h5><p>{activeReport.coaching.answer.coaching}</p><details className="loss-uncertainty"><summary>What these frames cannot prove</summary><p>{activeReport.coaching.answer.uncertainty}</p></details></> : <p>{activeReport?.coaching.reason ?? 'The local AI reviews only the final frames of this lost rally, not every shot.'}</p>}
        <button type="button" disabled={busy || !ready} onClick={() => void generate()}>{busy ? 'Reviewing ending locally…' : activeReport?.coaching.status === 'experimental' ? 'Review ending again' : 'Explain this loss with local AI'}</button>
        <p>Outcome marked by you. Intent is an interpretation; the end marker is a shuttle stop estimate, not exact first touch. Distances are image measurements, not metres.</p>
      </div>
      {activeReport && <details className="loss-frames"><summary>See the five frames used by the AI</summary><div className="contact-frames">{activeReport.frames.map(frame => <figure key={frame}><img src={`${endpoint}?frame=${activeReport.landingFrame}&image=${frame}`} width={data.width} height={data.height} alt={`Near-player ending evidence at ${(frame/data.fps).toFixed(3)} seconds`} loading="lazy"/><figcaption>{(frame/data.fps).toFixed(3)} s</figcaption></figure>)}</div><p>{activeReport.coaching.model} · five frames bounded inside this rally and after the preceding detected hit.</p></details>}
    </div>}
    <details className="loss-outcomes"><summary>Correct rally outcomes</summary><p>Only completed rallies are listed. Walking/tossing windows with no ending are excluded. Won and Unknown receive no AI loss explanation.</p>{rallies.map((r,index) => <label key={r.id}>Rally {index+1} · {r.start.toFixed(1)}–{r.end!.toFixed(1)} s <select aria-label={`Outcome for rally ${r.id}`} disabled={busy || !ready} value={outcomes[r.id] ?? 'unknown'} onChange={e => void mark(r.id,e.target.value)}><option value="unknown">Unknown</option><option value="won">Won</option><option value="lost">Lost</option></select></label>)}</details>
    <p role="status" aria-live="polite">{error || (busy ? 'The local model may take a few minutes. Your video stays on this computer.' : '')}</p>
  </section>;
}
