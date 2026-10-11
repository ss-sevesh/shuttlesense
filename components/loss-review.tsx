"use client";

import { useEffect, useRef, useState } from 'react';
import type { ReviewData, ShotCoaching } from '@/lib/analysis-review';
import { readable } from '@/lib/analysis-review';
import type { ReplayWindow } from './analysis-camera';
import { AttemptPhoto } from './attempt-photo';
import { shuttleContext } from '@/lib/shuttle-context';

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
  const context = ending?.evidence ? shuttleContext(data,ending.evidence.frame) : null;
  const losses = rallies.filter(r => outcomes[r.id] === 'lost');
  const currentSelection = useRef(selected);
  useEffect(()=>{currentSelection.current=selected;},[selected]);
  useEffect(() => {onReview(outcomes,report,selected);}, [outcomes,report,selected,onReview]);
  useEffect(() => {
    let cancelled = false;
    fetch(`${endpoint}?losses=1`).then(async response => {
      if (!response.ok) throw new Error('Could not load rally outcomes.');
      const saved = await response.json();
      if (saved.analysisSha256 !== data.analysisSha256) throw new Error('Rally outcomes belong to a different analysis.');
      if (!cancelled) { setOutcomes(saved.outcomes); const firstLoss=rallies.find(r => saved.outcomes[r.id] === 'lost');if(firstLoss && currentSelection.current===selected)onSelect(firstLoss.id); setReady(true); }
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
    <div className="review-event-heading"><div><span className="intro-label">NEAR PLAYER · ENDING REVIEW</span><h3>{losses.length ? `${losses.length} lost ${losses.length === 1 ? 'rally' : 'rallies'}` : rallies.length ? 'Mark your rally outcomes' : 'No completed rally windows'}</h3><p>{rallies.length} completed rally windows detected</p></div></div>
    <div className="loss-tabs" role="group" aria-label="Lost rallies">{losses.map((r,index) => <button type="button" key={r.id} disabled={busy} aria-pressed={selected === r.id} onClick={() => {onSelect(r.id);setError('');replay({start:Math.max(r.start,r.end!-3),end:r.end!});}}>Loss {index+1} · {r.end!.toFixed(1)} s</button>)}</div>
    {ready && !losses.length && <p>{rallies.length ? 'No confirmed losses yet. Mark a completed rally as Lost below to review its ending.' : 'No completed rally windows were detected. Open Technical details to verify a window before reviewing an outcome.'}</p>}
    {ready && !losses.length && <div className="detected-rallies" role="group" aria-label="Detected rally replays">{rallies.map((r,index)=><button type="button" key={r.id} onClick={()=>{onSelect(r.id);replay({start:r.start,end:r.end!});}}>Replay detected rally {index+1}</button>)}</div>}
    {!ready && !error && <p role="status">Loading saved outcomes…</p>}
    {rally && <div className="loss-selected">
      <div className="loss-title"><h4>What happened before {rally.end!.toFixed(1)} s?</h4><button type="button" onClick={() => replay({start:rally.start,end:rally.end!})}>Replay full rally</button><button type="button" onClick={() => replay({start:Math.max(rally.start,rally.end!-3),end:rally.end!})}>Replay final seconds</button></div>
      {ending?.evidence ? <div className="loss-observation"><button type="button" onClick={() => replay({start:ending.evidence!.time,end:ending.evidence!.time,paused:true})}>Show attempt at {ending.evidence.time.toFixed(3)} s</button><p>{readable(ending.status)} · {ending.evidence.pose}</p></div> : <p>Attempt or distance evidence is unavailable.</p>}
      <div className="loss-explanation"><h4>Shuttle &amp; visible attempt</h4>
      {ending?.evidence && <AttemptPhoto key={`${data.analysisSha256}-${ending.evidence.frame}`} data={data} videoUrl={videoUrl} evidence={ending.evidence}/>}

        {activeReport?.coaching.status === 'experimental' && activeReport.coaching.answer ? <><p>{activeReport.coaching.answer.visibleEvidence}</p><h5>Try next time</h5><p>{activeReport.coaching.answer.coaching}</p><details className="loss-uncertainty"><summary>What these frames cannot prove</summary><p>{activeReport.coaching.answer.uncertainty}</p></details></> : ending?.evidence ? <><p>At {ending.evidence.time.toFixed(3)} s, the near player's estimated pose is {ending.evidence.pose}.{context && 'horizontal' in context ? ` The tracked shuttle is ${context.horizontal} and ${context.vertical}${context.wristGapPx===null ? '.' : `, with a wrist-proxy image gap of ${context.wristGapPx.toFixed(1)} px.`}` : ' Same-frame shuttle/player relation is unavailable.'} Possible reading: an attempted return; intent and contact remain unverified.</p><h5>Try next time</h5><p>{context && 'horizontal' in context && context.horizontal!=='within player box width' ? `As optional positioning practice, shadow a step towards ${context.horizontal}, then recover in balance.` : 'As optional practice, shadow the displayed arm position, then reset into a balanced ready stance.'} Review this exact attempt frame alongside the ending replay; this is a practice suggestion, not a verified cause or correction for the outcome.</p>{activeReport?.coaching.reason && <p>{activeReport.coaching.reason}</p>}</> : <p>No reliable attempt photo or pose explanation is available for this ending.</p>}
        {outcomes[rally.id]==='lost' && <button type="button" disabled={busy || !ready} onClick={() => void generate()}>{busy ? 'Reviewing ending locally…' : activeReport?.coaching.status === 'experimental' ? 'Review ending again' : 'Explain this loss with local AI'}</button>}
        <p>Outcome: {outcomes[rally.id] ?? 'unknown'}{outcomes[rally.id] && outcomes[rally.id]!=='unknown' ? ' · marked by you' : ' · not yet marked'}. Intent is an interpretation; the end marker is a shuttle stop estimate, not exact first touch. Distances are image measurements, not metres.</p>
      </div>
      {activeReport && <details className="loss-frames"><summary>See the five frames used by the AI</summary><div className="contact-frames">{activeReport.frames.map(frame => <figure key={frame}><img src={`${endpoint}?frame=${activeReport.landingFrame}&image=${frame}`} width={data.width} height={data.height} alt={`Near-player ending evidence at ${(frame/data.fps).toFixed(3)} seconds`} loading="lazy"/><figcaption>{(frame/data.fps).toFixed(3)} s</figcaption></figure>)}</div><p>{activeReport.coaching.model} · five frames bounded inside this rally and after the preceding detected hit.</p></details>}
    </div>}
    <details className="loss-outcomes" open={ready && !losses.length}><summary>Correct rally outcomes</summary><p>Only completed rallies are listed. Walking/tossing windows with no ending are excluded. Won and Unknown receive no AI loss explanation.</p>{rallies.map((r,index) => <label key={r.id}>Rally {index+1} · {r.start.toFixed(1)}–{r.end!.toFixed(1)} s <select aria-label={`Outcome for rally ${r.id}`} disabled={busy || !ready} value={outcomes[r.id] ?? 'unknown'} onChange={e => void mark(r.id,e.target.value)}><option value="unknown">Unknown</option><option value="won">Won</option><option value="lost">Lost</option></select></label>)}</details>
    <p role="status" aria-live="polite">{error || (busy ? 'The local model may take a few minutes. Your video stays on this computer.' : '')}</p>
  </section>;
}
