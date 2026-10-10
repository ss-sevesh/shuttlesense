"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AnalysisCamera, type ReplayWindow } from "@/components/analysis-camera";
import { CourtMap } from "@/components/court-map";
import { ContactEvidence } from "@/components/contact-evidence";
import { LandingCoaching } from "@/components/landing-coaching";
import { canonicalShot, nearestIndex, parseReviews, readable, reviewReason, reviewStorageKey, shotTypes, validInterval, type HumanReviews, type ReviewData, type Side } from "@/lib/analysis-review";

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4,"0")}`;
const percent = (value: number, total: number) => total ? `${number.format(100 * value / total)}%` : "Unavailable";
export function AnalysisReview({ data, videoUrl }: { data: ReviewData; videoUrl: string }) {
  useEffect(() => {
    if (window.location.hash === "#camera-values") {
      const values = document.getElementById("camera-values");
      values?.focus();
      values?.scrollIntoView({ block: "center" });
    }
  }, []);
  const [time, setTime] = useState(0);
  const onTime = useCallback((time: number) => setTime(time), []);
  const [replay, setReplay] = useState<ReplayWindow | null>(null);
  const [side, setSide] = useState<Side>("near");
  const [tab, setTab] = useState("shots");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(data.shots[0]?.id ?? null);
  const [rallyId, setRallyId] = useState<number | null>(data.rallies[0]?.id ?? null);
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
  const map = useMemo(() => {
    const grid: number[][] = Array.from({ length: 8 }, () => Array(6).fill(0));
    let seconds = 0;
    data.samples.forEach(sample => sample.people.filter(person => person.side === side).forEach(person => {
      const [x,y] = person.court;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return;
      const weight = Math.max(0, Math.min(1/data.poseSampleHz, data.duration-sample.time));
      grid[Math.min(7,Math.floor(y*8))][Math.min(5,Math.floor(x*6))] += weight;
      seconds += weight;
    }));
    return { grid, seconds };
  }, [data,side]);
  const filtered = data.shots.filter(shot => filter === "all" || (filter === "labels" ? shot.predictedType !== null : filter === "reviewed" ? !!reviews.shots[shot.id] : !reviews.shots[shot.id]));
  const pageCount = Math.max(1,Math.ceil(filtered.length/20));
  const displayed = filtered.slice(Math.min(page,pageCount-1)*20,(Math.min(page,pageCount-1)+1)*20);
  const shot = data.shots.find(shot => shot.id === selected);
  const rally = data.rallies.find(rally => rally.id === rallyId);
  const accepted = data.shots.filter(shot => shot.predictedType !== null).length;
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
    const blob = new Blob([JSON.stringify({ videoSha256: data.videoSha256, analysisSha256: data.analysisSha256, pipelineVersion: data.pipelineVersion, focusSide: data.focusSide, fps: data.fps, fileName: data.fileName, duration: data.duration, modelShots: data.shots, modelRallies: data.rallies, groundLanding: data.groundLanding, humanReviews: reviews },null,2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = "shuttlesense-reviewed.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  return <div className="analysis-review">
    {data.focusSide === "near" && <p>Near-player analysis: contact frames, pose measurements, movement, and local vision coaching.</p>}
    <header className="review-heading"><div><h2>Review your recording</h2><p>{data.fileName} · {clock(data.duration)} · {data.width} × {data.height}</p></div><button type="button" onClick={download}>Download reviewed JSON</button></header>
    <dl className="review-summary">
      <div><dt>Contact candidates</dt><dd>{data.shots.length}</dd></div>
      <div><dt>Model shot labels</dt><dd>{accepted}<small>{data.shots.length-accepted} unknown</small></dd></div>
      <div><dt>Possible rally starts</dt><dd>{data.rallies.length}<small>{data.rallies.filter(rally => rally.end !== null).length} estimated endings</small></dd></div>
      <div><dt>Your reviewed shots</dt><dd>{Object.keys(reviews.shots).length}<small>{Object.keys(reviews.rallies).length} rally windows reviewed</small></dd></div>
    </dl>
    <div className="review-workspace">
      <div className="review-main"><AnalysisCamera data={data} videoUrl={videoUrl} replay={replay} onTime={onTime}/>
        <LandingCoaching videoUrl={videoUrl} fps={data.fps} duration={data.duration} time={time} analysisSha256={data.analysisSha256}/>
        {data.groundLanding && <section className="review-events" aria-label="Possible shuttle landings">
          <h3>Possible shuttle landings</h3><p>{data.groundLanding.reason}</p>
          {data.groundLanding.status === "experimental" && (data.groundLanding.candidates.length ?
            <div className="review-table-wrap"><table className="review-shot-table"><caption>Replay each candidate to verify ground contact before marking a rally end.</caption>
              <thead><tr><th scope="col">Time</th><th scope="col">Evidence</th></tr></thead><tbody>{data.groundLanding.candidates.map(item =>
                <tr key={item.frame}><td><button type="button" onClick={() => play(item.time-1,item.time+1)}>Replay possible landing at {clock(item.time)}</button></td><td>Floor overlap followed by a short stop; ground contact unconfirmed.</td></tr>)}</tbody></table></div> :
            <p>No landing candidates passed the checks. Rally endings remain unknown.</p>)}
        </section>}
        <div className="review-tab-controls" role="group" aria-label="Review category"><button type="button" aria-pressed={tab === "shots"} onClick={() => setTab("shots")}>Shot types</button><button type="button" aria-pressed={tab === "rallies"} onClick={() => setTab("rallies")}>Rally windows</button></div>
        {tab === "shots" ? <section className="review-events" aria-label="Shot contacts">
          <div className="review-event-heading"><h3>Check the contact</h3><label>Show <select value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="all">All contacts</option><option value="labels">Model labels</option><option value="needs">Needs your review</option><option value="reviewed">Reviewed by you</option></select></label></div>
          {shot && <div className="review-selected" key={shot.id}><div><span>Contact {shot.id} · {clock(shot.time)} · {readable(shot.side)} player</span><h4>{readable(shot.predictedType)}</h4><p>Model score: {shot.score === null ? "Unavailable" : percent(shot.score,1)}. This score is not measured accuracy.</p><p>{reviewReason(shot.reason)}</p><p className="review-status">{shot.playStatus === "outside_play" ? "Outside a detected play window" : shot.playStatus === "end_uncertain_review" ? "Rally ending is uncertain; this could be after the point" : readable(shot.playStatus)}</p><button type="button" onClick={() => play(shot.time-.6,shot.time+.8)}>Replay this contact</button></div>
            <form onSubmit={reviewShot}><label htmlFor="review-shot-label">What do you see?</label><select id="review-shot-label" name="shot-label" defaultValue={reviews.shots[shot.id]?.label ?? (shot.predictedType ? canonicalShot(shot.predictedType) : "unknown")}>{shotTypes.map(type => <option key={type} value={type}>{readable(type)}</option>)}<option value="not playing">Not a playing shot / shuttle toss</option><option value="unknown">Cannot tell</option></select><button type="submit" disabled={!loaded}>Save shot review</button>{reviews.shots[shot.id] && <p>You marked: {readable(reviews.shots[shot.id].label)}</p>}</form>
          </div>}
          {shot && <ContactEvidence shot={shot} videoUrl={videoUrl} fps={data.fps}/>}
          {displayed.length ? <div className="review-table-wrap"><table className="review-shot-table"><caption>{filtered.length} contacts in this filter. Select a contact to inspect it.</caption><thead><tr><th scope="col">Time</th><th scope="col">Player</th><th scope="col">Model label</th><th scope="col">Score</th><th scope="col">Your review</th></tr></thead><tbody>{displayed.map(item => <tr key={item.id} data-selected={item.id === selected}><td><button type="button" aria-pressed={item.id === selected} aria-label={`Review contact ${item.id} at ${clock(item.time)}`} onClick={() => { setSelected(item.id); play(item.time-.6,item.time+.8); }}>{clock(item.time)}</button></td><td>{readable(item.side)}</td><td>{readable(item.predictedType)}</td><td>{item.score === null ? "Unavailable" : percent(item.score,1)}</td><td>{reviews.shots[item.id] ? readable(reviews.shots[item.id].label) : "Needs review"}</td></tr>)}</tbody></table></div> : <p>No contacts match this filter.</p>}
          <nav className="review-pagination" aria-label="Contact pages"><button type="button" disabled={page <= 0} onClick={() => setPage(page-1)}>Previous</button><span>Page {Math.min(page+1,pageCount)} of {pageCount}</span><button type="button" disabled={page+1 >= pageCount} onClick={() => setPage(page+1)}>Next</button></nav>
        </section> : <section className="review-events" aria-label="Rally windows"><h3>Verify the start and end</h3><p>A possible serve start is a review cue. A window with an unknown ending may include walking or tossing.</p>
          {data.rallies.length ? <><label htmlFor="review-rally-picker">Review window</label><select id="review-rally-picker" value={rallyId ?? ""} onChange={e => setRallyId(Number(e.target.value))}>{data.rallies.map(rally => <option key={rally.id} value={rally.id}>Window {rally.id} · {clock(rally.start)} · {rally.end === null ? "Ending unknown" : "Estimated ending"}</option>)}</select>
            {rally && <div className="review-selected" key={rally.id}><div><h4>Window {rally.id}</h4><dl><div><dt>Possible start</dt><dd>{clock(rally.start)}</dd></div><div><dt>Model ending</dt><dd>{rally.end === null ? "Unknown" : clock(rally.end)}</dd></div><div><dt>Contact candidates</dt><dd>{rally.hitCandidates}</dd></div></dl><button type="button" onClick={() => { const human = reviews.rallies[rally.id]; play(human?.start ?? rally.start,human?.end ?? rally.end ?? rally.reviewStop); }}>Replay this window</button>{rally.end === null && <p>Replay stops at {clock(rally.reviewStop)} for review. That timestamp is not a detected rally end.</p>}</div>
              <form onSubmit={reviewRally}><label htmlFor="rally-start">Observed start (seconds)</label><input id="rally-start" name="rally-start" type="number" min="0" max={data.duration} step="0.001" required autoComplete="off" defaultValue={Number((reviews.rallies[rally.id]?.start ?? rally.start).toFixed(3))}/><button type="button" onClick={e => { const input = e.currentTarget.form?.elements.namedItem("rally-start") as HTMLInputElement; if (input) input.value = time.toFixed(3); }}>Use current time for start</button><label htmlFor="rally-end">Observed end (seconds)</label><input id="rally-end" name="rally-end" type="number" min="0" max={data.duration} step="0.001" required autoComplete="off" defaultValue={reviews.rallies[rally.id]?.end != null || rally.end != null ? Number((reviews.rallies[rally.id]?.end ?? rally.end!).toFixed(3)) : ""}/><button type="button" onClick={e => { const input = e.currentTarget.form?.elements.namedItem("rally-end") as HTMLInputElement; if (input) input.value = time.toFixed(3); }}>Use current time for end</button><button type="submit" disabled={!loaded}>Save verified window</button>{reviews.rallies[rally.id] && <p>Your window: {clock(reviews.rallies[rally.id].start)} to {clock(reviews.rallies[rally.id].end)}</p>}</form>
            </div>}</> : <p>No possible service starts were found. Shot contacts are still available for review.</p>}
        </section>}
      </div>
      <aside className="review-sidebar" aria-label="Tracking values and heatmap">
        <section id="camera-values" className="review-live" tabIndex={-1} aria-label="Camera values"><div className="review-event-heading"><h3>Camera values</h3><span>{clock(time)}</span></div>{data.focusSide === "near" ? <p>Near player</p> : <label htmlFor="review-side">Player <select id="review-side" value={side} onChange={e => setSide(e.target.value as Side)}><option value="near">Near player</option><option value="far">Far player</option></select></label>}<p>{person ? `Tracked player #${person.trackId} · ${person.poseDetected ? "Pose observed" : "Pose unavailable"}` : "Player tracking unavailable at this frame"}</p>
          <dl className="review-measurements">{([['Left elbow','leftElbow'],['Right elbow','rightElbow'],['Left knee','leftKnee'],['Right knee','rightKnee'],['Wrist speed','wristSpeed']] as const).map(([label,key]) => <div key={key}><dt>{label}</dt><dd>{person?.measurements?.[key] == null ? "Unavailable" : `${number.format(person.measurements[key]!)} ${key === "wristSpeed" ? "body heights/s" : "°"}`}</dd></div>)}</dl><p>Angles come from visible 2D landmarks. Wrist speed is relative to box height, not metres per second.</p>
        </section>
        <section className="review-heatmap"><h3>{readable(side)} player movement</h3><CourtMap grid={map.grid}/><p>{number.format(map.seconds)} seconds of in-court positions. Brighter cells indicate more time. All activity is included, including between points.</p></section>
        <section className="review-quality"><h3>Data availability</h3><dl className="review-measurements"><div><dt>Near tracking</dt><dd>{percent(data.metrics.nearTracked,data.metrics.sampleCount)}</dd></div>{data.focusSide !== "near" && <div><dt>Far tracking</dt><dd>{percent(data.metrics.farTracked,data.metrics.sampleCount)}</dd></div>}<div><dt>Near poses</dt><dd>{percent(data.metrics.nearPoses,data.metrics.sampleCount)}</dd></div>{data.focusSide !== "near" && <div><dt>Far poses</dt><dd>{percent(data.metrics.farPoses,data.metrics.sampleCount)}</dd></div>}<div><dt>Shuttle proposals</dt><dd>{percent(data.metrics.shuttleDetected,data.metrics.shuttleFrames)}</dd></div></dl><p>Availability measures how often data exists. It does not measure correctness.</p></section>
      </aside>
    </div>
    <p className="review-feedback" role="status" aria-live="polite">{message}</p>
    {data.limitations.length > 0 && <details className="review-limitations"><summary>Analysis limitations</summary><ul>{data.limitations.map((value,index) => <li key={index}>{value}</li>)}</ul></details>}
  </div>;
}
