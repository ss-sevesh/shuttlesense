"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AnalysisCamera, type ReplayWindow } from "@/components/analysis-camera";
import { CourtMap } from "@/components/court-map";
import { LossReview, type LossReport } from "@/components/loss-review";
import { movementHeatmap, nearestIndex, parseReviews, reviewStorageKey, validInterval, type HumanReviews, type ReviewData, type Side } from "@/lib/analysis-review";

import { hitPoseAngles } from "@/lib/pose-angles";
import { MatchReport } from "./match-report";

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4,"0")}`;
export function AnalysisReview({ data, videoUrl }: { data: ReviewData; videoUrl: string }) {
  const [time, setTime] = useState(0);
  const [lossReviews, setLossReviews] = useState<{outcomes:Record<number,string>;explanations:Record<number,LossReport>}>({outcomes:{},explanations:{}});
  const [posePage, setPosePage] = useState(0);
  const onLossReview = useCallback((outcomes:Record<number,string>, report:LossReport|null) => {
    setLossReviews(previous => ({outcomes,explanations:{...previous.explanations,...(report ? {[report.rallyId]:report} : {})}}));
  }, []);
  const onTime = useCallback((time: number) => setTime(time), []);
  const [replay, setReplay] = useState<ReplayWindow | null>(null);
  const side: Side = "near";
  const [tab, setTab] = useState("poses");
  const [combine, setCombine] = useState(false);
  const [heatMode, setHeatMode] = useState("live");
  const [combinedIds, setCombinedIds] = useState(data.rallies.filter(r=>r.end!==null).map(r=>r.id));
  const [rallyId, setRallyId] = useState<number | null>(data.rallies.find(r=>r.end!==null)?.id ?? null);
  useEffect(()=>{setPosePage(0);},[rallyId]);
  const [reviews, setReviews] = useState<HumanReviews>({ shots: {}, rallies: {} });
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const storageKey = reviewStorageKey(data);
  useEffect(() => {
    try { setReviews(parseReviews(localStorage.getItem(storageKey), data)); } catch { setMessage("Browser storage is unavailable. Download your review to keep it."); }
    setLoaded(true);
  }, [storageKey, data]);
  function save(next: HumanReviews) {
    setReviews(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setMessage("Review saved on this browser. Download JSON to keep a copy."); }
    catch { setMessage("Browser storage could not save your review. Download JSON before leaving."); }
  }
  function play(start: number, end: number) { setReplay(previous => ({ start: Math.max(0,start), end: Math.min(data.duration,end), token: (previous?.token ?? 0)+1 })); }
  const sampleIndex = nearestIndex(data.samples, time, 1.5 / data.poseSampleHz);
  const person = sampleIndex >= 0 ? data.samples[sampleIndex].people.find(person => person.side === side) : null;
  const rally = data.rallies.find(r=>r.id===rallyId);
  const eligible = data.rallies.filter(r=>r.end!==null || reviews.rallies[r.id]);
  const windows = useMemo<[number,number][]>(()=>data.rallies.filter(r=>(r.end!==null || reviews.rallies[r.id]) && (combine ? combinedIds.includes(r.id) : r.id===rallyId)).map(r=>[reviews.rallies[r.id]?.start ?? r.start,reviews.rallies[r.id]?.end ?? r.end!]),[data,reviews.rallies,combine,combinedIds,rallyId]);
  const map = useMemo(() => movementHeatmap(data,side,heatMode==='live'?time:data.duration,windows), [data,side,time,heatMode,windows]);
  const showPosition=heatMode==='live' && windows.some(([start,end])=>time>=start && time<end);
  const inRally = (time:number) => rally ? time>=(reviews.rallies[rally.id]?.start ?? rally.start) && time<(reviews.rallies[rally.id]?.end ?? rally.end ?? rally.reviewStop) : false;
  const poses = (data.hitPoses ?? []).filter(p=>inRally(p.time));
  const posePageCount = Math.max(1,Math.ceil(poses.length/5));
  const poseRows = poses.slice(Math.min(posePage,posePageCount-1)*5,(Math.min(posePage,posePageCount-1)+1)*5);
  function reviewRally(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rally || !loaded) return;
    const form = new FormData(event.currentTarget);
    const start = Number(form.get("rally-start")), end = Number(form.get("rally-end"));
    if (!form.get("rally-start") || !form.get("rally-end") || !validInterval(start,end,data.duration)) {
      setMessage(`Enter a start and a later end between 0 and ${data.duration.toFixed(1)} seconds.`);
      event.currentTarget.querySelector<HTMLInputElement>('[name="rally-end"]')?.focus();
      return;
    }
    save({ ...reviews, rallies: { ...reviews.rallies, [rally.id]: { start, end, reviewedAt: new Date().toISOString() } } });
  }
  function download() {
    const blob = new Blob([JSON.stringify({ videoSha256: data.videoSha256, analysisSha256: data.analysisSha256, pipelineVersion: data.pipelineVersion, focusSide: data.focusSide, fps: data.fps, fileName: data.fileName, duration: data.duration, options: data.options, modelShots: data.shots, modelRallies: data.rallies, groundLanding: data.groundLanding, courtLines: data.courtLines, hitPoses: data.hitPoses, endingReview: data.endingReview, humanReviews: reviews, lossReviews: {...lossReviews,explanations:Object.fromEntries(Object.entries(lossReviews.explanations).filter(([id]) => lossReviews.outcomes[Number(id)] === 'lost'))} },null,2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = "shuttlesense-reviewed.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  return <div className="analysis-review">
    <header className="review-heading"><div><h2>Your recording</h2><p>{data.fileName} | {clock(data.duration)}</p></div><button type="button" onClick={download}>Download reviewed JSON</button></header>
    <div className="review-workspace loss-workspace">
      <div className="rally-map-controls">
        <label>Selected rally <select aria-label="Selected rally" value={rallyId ?? ''} onChange={e=>{setRallyId(Number(e.target.value));setPosePage(0);}}>{!eligible.some(r=>r.id===rallyId)&&<option value={rallyId ?? ''} disabled>Verify a window below</option>}{eligible.map((r,index)=><option key={r.id} value={r.id}>Rally {index+1} · {clock(reviews.rallies[r.id]?.start ?? r.start)}–{clock(reviews.rallies[r.id]?.end ?? r.end!)}</option>)}</select></label>
        <label><input type="checkbox" checked={combine} onChange={e=>setCombine(e.target.checked)}/> Combine rallies</label>
        <div role="group" aria-label="Heatmap timing"><button type="button" aria-pressed={heatMode==='live'} onClick={()=>setHeatMode('live')}>Live</button><button type="button" aria-pressed={heatMode==='total'} onClick={()=>setHeatMode('total')}>Rally total</button></div>
        {combine && <fieldset className="combined-rallies"><legend>Rallies to combine</legend>{eligible.map((r,index)=><label key={r.id}><input type="checkbox" checked={combinedIds.includes(r.id)} onChange={e=>setCombinedIds(ids=>e.target.checked?[...ids,r.id]:ids.filter(id=>id!==r.id))}/> Rally {index+1}</label>)}</fieldset>}
        {!eligible.length && <p>No completed or verified rallies yet. No between-point movement is included.</p>}
      </div><div className="review-main"><AnalysisCamera data={data} videoUrl={videoUrl} replay={replay} onTime={onTime}/>
        <section className="review-heatmap"><h3>{combine ? `${windows.length} combined rallies` : 'Selected rally'}</h3><CourtMap grid={map.grid} position={showPosition ? person?.court : undefined}/><p>{number.format(map.seconds)} / {number.format(map.windowSeconds)} s tracked · {heatMode==='live'?'live':'total'}. Only selected rally time. Shade: 0–5 s/cell; dot: current position.</p></section>
      </div>
      <aside className="review-sidebar" aria-label="Selected loss explanation and attempt photo"><LossReview data={data} videoUrl={videoUrl} selected={rallyId} onSelect={setRallyId} onReview={onLossReview} replay={value=>setReplay(previous=>({...value,token:(previous?.token ?? 0)+1}))}/></aside>
    </div>
    <MatchReport data={data} videoUrl={videoUrl} reviews={reviews} outcomes={lossReviews.outcomes}/>
    <details className="review-technical"><summary>Technical details: poses &amp; rally boundaries</summary>
      <p>Supporting evidence for {rally ? `rally ${rally.start.toFixed(1)}-${(rally.end ?? rally.reviewStop).toFixed(1)} s` : 'the selected rally'}. Predictions and body poses are estimates.</p>
      <div className="review-tab-controls" role="group" aria-label="Review category"><button type="button" aria-pressed={tab==='poses'} onClick={()=>setTab('poses')}>Hit poses</button><button type="button" aria-pressed={tab==='rallies'} onClick={()=>setTab('rallies')}>Rally boundaries</button></div>
      {tab==='poses' && <section className="review-events" aria-label="Near-side hit poses"><h3>Near-side hit poses</h3><p>Raised arm: wrist above shoulder. Torso level: between shoulder and hip. Low arm: at or below hip. These are body positions, not shot names or confirmed racket contact.</p>
        {poseRows.length ? <><div className="review-table-wrap"><table className="review-shot-table"><caption>Five pose frames per page, inside this rally.</caption><thead><tr><th scope="col">Timestamp</th><th scope="col">Visible pose</th><th scope="col">Replay</th></tr></thead><tbody>{poseRows.map(event=><tr key={event.frame}><td><button type="button" onClick={()=>setReplay(previous=>({start:event.time,end:event.time,token:(previous?.token ?? 0)+1,paused:true}))}>Show pose at {event.time.toFixed(3)} s</button></td><td>{event.pose}<details className="pose-angle-details"><summary>View body angles</summary><dl className="pose-angle-list">{Object.entries(hitPoseAngles(data,event)).map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value===null ? "Unknown" : `${value.toFixed(1)} degrees`}</dd></div>)}</dl><p>Camera-dependent 2D estimates; low-confidence landmarks stay Unknown. Wrist angles use the index finger as a proxy. Racket-face angle is unavailable.</p></details></td><td><button type="button" onClick={()=>play(event.time-.6,event.time+.6)}>Replay pose at {event.time.toFixed(3)} s</button></td></tr>)}</tbody></table></div><nav className="review-pagination" aria-label="Pose pages"><button type="button" disabled={posePage<=0} onClick={()=>setPosePage(p=>p-1)}>Previous</button><span>Page {Math.min(posePage+1,posePageCount)} of {posePageCount}</span><button type="button" disabled={posePage+1>=posePageCount} onClick={()=>setPosePage(p=>p+1)}>Next</button></nav></> : <p>No hit-pose evidence is available in this rally.</p>}
      </section>}
      {tab==='rallies' && <section className="review-events" aria-label="Rally windows"><h3>Correct the rally boundaries</h3>{<label>Review rally window <select value={rallyId ?? ''} onChange={e=>setRallyId(Number(e.target.value))}>{data.rallies.map(r=><option key={r.id} value={r.id}>{clock(r.start)}-{r.end===null?'Unknown':clock(r.end)}</option>)}</select></label>}{rally ? <div className="review-selected" key={rally.id}><div><p>Estimated start: {clock(rally.start)}. Estimated ending: {rally.end===null?'Unknown':clock(rally.end)}.</p><button type="button" onClick={()=>{const human=reviews.rallies[rally.id];play(human?.start ?? rally.start,human?.end ?? rally.end ?? rally.reviewStop);}}>Replay this window</button></div><form onSubmit={reviewRally}><label htmlFor="rally-start">Observed start (seconds)</label><input id="rally-start" name="rally-start" type="number" min="0" max={data.duration} step="0.001" required defaultValue={reviews.rallies[rally.id]?.start ?? rally.start}/><label htmlFor="rally-end">Observed end (seconds)</label><input id="rally-end" name="rally-end" type="number" min="0" max={data.duration} step="0.001" required defaultValue={reviews.rallies[rally.id]?.end ?? rally.end ?? ''}/><button type="submit" disabled={!loaded}>Save verified window</button></form></div> : <p>No completed rally boundary is available.</p>}</section>}
    </details>
    <p className="review-feedback" role="status" aria-live="polite">{message}</p>
    {data.limitations.length>0&&<details className="review-limitations"><summary>Analysis limitations</summary><ul>{data.limitations.map((value,index)=><li key={index}>{value}</li>)}</ul></details>}
  </div>;
}
