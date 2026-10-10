"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AnalysisCamera, type ReplayWindow } from "@/components/analysis-camera";
import { CourtMap } from "@/components/court-map";
import { LossReview, type LossReport } from "@/components/loss-review";
import { canonicalShot, movementHeatmap, nearestIndex, parseReviews, readable, reviewReason, reviewStorageKey, shotTypes, validInterval, type HumanReviews, type ReviewData, type ReviewShot, type Side } from "@/lib/analysis-review";

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4,"0")}`;
export function AnalysisReview({ data, videoUrl }: { data: ReviewData; videoUrl: string }) {
  const [time, setTime] = useState(0);
  const [lossReviews, setLossReviews] = useState<{outcomes:Record<number,string>;explanations:Record<number,LossReport>}>({outcomes:{},explanations:{}});
  const [lossRally, setLossRally] = useState<number|null>(null);
  const [posePage, setPosePage] = useState(0);
  const onLossReview = useCallback((outcomes:Record<number,string>, report:LossReport|null, selected:number|null) => {
    setLossReviews(previous => ({outcomes,explanations:{...previous.explanations,...(report ? {[report.rallyId]:report} : {})}}));
    setLossRally(selected);
  }, []);
  const onTime = useCallback((time: number) => setTime(time), []);
  const [replay, setReplay] = useState<ReplayWindow | null>(null);
  const side: Side = "near";
  const [tab, setTab] = useState(data.options?.shots === false ? "rallies" : "shots");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(data.shots[0]?.id ?? null);
  const [rallyId, setRallyId] = useState<number | null>(data.rallies.find(r=>r.end!==null)?.id ?? null);
  useEffect(()=>{setPage(0);setPosePage(0);if(lossRally!==null)setRallyId(lossRally);},[lossRally]);
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
  function playShot(shot: ReviewShot) { play(shot.classificationWindow?.[0] ?? shot.time-.6,shot.classificationWindow?.[1] ?? shot.time+.8); }
  const sampleIndex = nearestIndex(data.samples, time, 1.5 / data.poseSampleHz);
  const person = sampleIndex >= 0 ? data.samples[sampleIndex].people.find(person => person.side === side) : null;
  const map = useMemo(() => movementHeatmap(data,side,time), [data,side,time]);
  const rally = data.rallies.find(r=>r.id===(lossRally ?? rallyId));
  const attempt = data.endingReview?.find(e=>e.rallyId===rally?.id)?.evidence;
  const evidenceEnd = rally ? Math.min(rally.end ?? rally.reviewStop,attempt ? attempt.time+.5 : data.duration) : 0;
  const inRally = (time:number) => rally ? time>=rally.start && time<evidenceEnd : false;
  const poses = (data.hitPoses ?? []).filter(p=>inRally(p.time));
  const posePageCount = Math.max(1,Math.ceil(poses.length/5));
  const poseRows = poses.slice(Math.min(posePage,posePageCount-1)*5,(Math.min(posePage,posePageCount-1)+1)*5);
  const filtered = data.shots.filter(shot => inRally(shot.time) && ['possible_play','estimated_play_window'].includes(shot.playStatus) && (filter === "all" || (filter === "labels" ? shot.predictedType !== null : filter === "reviewed" ? !!reviews.shots[shot.id] : !reviews.shots[shot.id])));
  const pageCount = Math.max(1,Math.ceil(filtered.length/5));
  const displayed = filtered.slice(Math.min(page,pageCount-1)*5,(Math.min(page,pageCount-1)+1)*5);
  const shot = filtered.find(shot=>shot.id===selected) ?? null;
  function reviewShot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shot || !loaded) return;
    const label = String(new FormData(event.currentTarget).get("shot-label"));
    if (![...shotTypes,"unknown","not playing"].includes(label)) return;
    save({ ...reviews, shots: { ...reviews.shots, [shot.id]: { label, reviewedAt: new Date().toISOString() } } });
  }
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
      <div className="review-main"><AnalysisCamera data={data} videoUrl={videoUrl} replay={replay} onTime={onTime}/>
        <section className="review-heatmap"><h3>{readable(side)} player movement</h3><CourtMap grid={map.grid} position={person?.court}/><p>{number.format(map.seconds)} s tracked so far. Updates with playback and rewinds with the video. Dot: current position.</p></section>
      </div>
      <aside className="review-sidebar" aria-label="Selected loss explanation and attempt photo"><LossReview data={data} videoUrl={videoUrl} onReview={onLossReview} replay={value=>setReplay(previous=>({...value,token:(previous?.token ?? 0)+1}))}/></aside>
    </div>
    <details className="review-technical"><summary>Technical details: shots, poses &amp; rally boundaries</summary>
      <p>Supporting evidence for {rally ? `rally ${rally.start.toFixed(1)}-${(rally.end ?? rally.reviewStop).toFixed(1)} s` : 'the selected rally'}. Predictions and body poses are estimates.</p>
      <div className="review-tab-controls" role="group" aria-label="Review category"><button type="button" aria-pressed={tab==='poses'} onClick={()=>setTab('poses')}>Hit poses</button><button type="button" aria-pressed={tab==='shots'} onClick={()=>setTab('shots')}>Shot types</button><button type="button" aria-pressed={tab==='rallies'} onClick={()=>setTab('rallies')}>Rally boundaries</button></div>
      {tab==='poses' && <section className="review-events" aria-label="Near-side hit poses"><h3>Near-side hit poses</h3><p>Raised arm: wrist above shoulder. Torso level: between shoulder and hip. Low arm: at or below hip. These are body positions, not shot names or confirmed racket contact.</p>
        {poseRows.length ? <><div className="review-table-wrap"><table className="review-shot-table"><caption>Five pose frames per page, inside this rally.</caption><thead><tr><th scope="col">Timestamp</th><th scope="col">Visible pose</th><th scope="col">Replay</th></tr></thead><tbody>{poseRows.map(event=><tr key={event.frame}><td><button type="button" onClick={()=>setReplay(previous=>({start:event.time,end:event.time,token:(previous?.token ?? 0)+1,paused:true}))}>Show pose at {event.time.toFixed(3)} s</button></td><td>{event.pose}{event.measurements.elbow!==null&&<p>Elbow: {event.measurements.elbow.toFixed(1)} degrees</p>}</td><td><button type="button" onClick={()=>play(event.time-.6,event.time+.6)}>Replay pose at {event.time.toFixed(3)} s</button></td></tr>)}</tbody></table></div><nav className="review-pagination" aria-label="Pose pages"><button type="button" disabled={posePage<=0} onClick={()=>setPosePage(p=>p-1)}>Previous</button><span>Page {Math.min(posePage+1,posePageCount)} of {posePageCount}</span><button type="button" disabled={posePage+1>=posePageCount} onClick={()=>setPosePage(p=>p+1)}>Next</button></nav></> : <p>No hit-pose evidence is available in this rally.</p>}
      </section>}
      {tab==='shots' && <section className="review-events" aria-label="Shot contacts"><div className="review-event-heading"><h3>Estimated shots in this rally</h3><label>Show <select value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">All playing contacts</option><option value="labels">Model labels</option><option value="needs">Needs review</option><option value="reviewed">Reviewed by you</option></select></label></div><p>Pretrained BST uses frames after the previous detected hit, including preparation and follow-through. Unknown means no accepted shot label.</p>
        {shot && <form className="review-shot-correction" key={shot.id} onSubmit={reviewShot}><label htmlFor="review-shot-label">Correct shot at {clock(shot.time)}</label><select id="review-shot-label" name="shot-label" defaultValue={reviews.shots[shot.id]?.label ?? (shot.predictedType?canonicalShot(shot.predictedType):'unknown')}>{shotTypes.map(type=><option key={type} value={type}>{readable(type)}</option>)}<option value="not playing">Not playing / shuttle toss</option><option value="unknown">Cannot tell</option></select><button type="submit" disabled={!loaded}>Save shot review</button><p>{reviewReason(shot.reason)}</p></form>}
        {displayed.length ? <div className="review-table-wrap"><table className="review-shot-table"><caption>Five playing contacts per page; walking/toss candidates outside this rally are excluded.</caption><thead><tr><th scope="col">Timestamp</th><th scope="col">Estimated shot</th><th scope="col">Your correction</th></tr></thead><tbody>{displayed.map(item=><tr key={item.id}><td><button type="button" aria-pressed={item.id===selected} aria-label={`Review contact ${item.id} at ${clock(item.time)}`} onClick={()=>{setSelected(item.id);playShot(item);}}>{clock(item.time)}</button></td><td>{readable(item.predictedType)}</td><td>{reviews.shots[item.id]?readable(reviews.shots[item.id].label):'Unreviewed'}</td></tr>)}</tbody></table></div> : <p>No playing contacts match this filter.</p>}
        <nav className="review-pagination" aria-label="Contact pages"><button type="button" disabled={page<=0} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {Math.min(page+1,pageCount)} of {pageCount}</span><button type="button" disabled={page+1>=pageCount} onClick={()=>setPage(p=>p+1)}>Next</button></nav>
      </section>}
      {tab==='rallies' && <section className="review-events" aria-label="Rally windows"><h3>Correct the rally boundaries</h3>{lossRally===null&&<label>Review completed rally <select value={rallyId ?? ''} onChange={e=>setRallyId(Number(e.target.value))}>{data.rallies.filter(r=>r.end!==null).map(r=><option key={r.id} value={r.id}>{clock(r.start)}-{clock(r.end!)}</option>)}</select></label>}{rally ? <div className="review-selected" key={rally.id}><div><p>Estimated start: {clock(rally.start)}. Estimated ending: {rally.end===null?'Unknown':clock(rally.end)}.</p><button type="button" onClick={()=>{const human=reviews.rallies[rally.id];play(human?.start ?? rally.start,human?.end ?? rally.end ?? rally.reviewStop);}}>Replay this window</button></div><form onSubmit={reviewRally}><label htmlFor="rally-start">Observed start (seconds)</label><input id="rally-start" name="rally-start" type="number" min="0" max={data.duration} step="0.001" required defaultValue={reviews.rallies[rally.id]?.start ?? rally.start}/><label htmlFor="rally-end">Observed end (seconds)</label><input id="rally-end" name="rally-end" type="number" min="0" max={data.duration} step="0.001" required defaultValue={reviews.rallies[rally.id]?.end ?? rally.end ?? ''}/><button type="submit" disabled={!loaded}>Save verified window</button></form></div> : <p>No completed rally boundary is available.</p>}</section>}
    </details>
    <p className="review-feedback" role="status" aria-live="polite">{message}</p>
    {data.limitations.length>0&&<details className="review-limitations"><summary>Analysis limitations</summary><ul>{data.limitations.map((value,index)=><li key={index}>{value}</li>)}</ul></details>}
  </div>;
}
