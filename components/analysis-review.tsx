"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AnalysisCamera, type ReplayWindow } from "@/components/analysis-camera";
import { CourtMap } from "@/components/court-map";
import { ContactEvidence } from "@/components/contact-evidence";
import { LandingCoaching } from "@/components/landing-coaching";
import { canonicalShot, movementHeatmap, nearestIndex, parseReviews, readable, reviewReason, reviewStorageKey, shotTypes, validInterval, type HumanReviews, type ReviewData, type ReviewShot, type Side } from "@/lib/analysis-review";

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
  const [tab, setTab] = useState(data.options?.shots === false ? "rallies" : "shots");
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
  function playShot(shot: ReviewShot) { play(shot.classificationWindow?.[0] ?? shot.time-.6,shot.classificationWindow?.[1] ?? shot.time+.8); }
  const sampleIndex = nearestIndex(data.samples, time, 1.5 / data.poseSampleHz);
  const person = sampleIndex >= 0 ? data.samples[sampleIndex].people.find(person => person.side === side) : null;
  const map = useMemo(() => movementHeatmap(data,side,time), [data,side,time]);
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
    const blob = new Blob([JSON.stringify({ videoSha256: data.videoSha256, analysisSha256: data.analysisSha256, pipelineVersion: data.pipelineVersion, focusSide: data.focusSide, fps: data.fps, fileName: data.fileName, duration: data.duration, options: data.options, modelShots: data.shots, modelRallies: data.rallies, groundLanding: data.groundLanding, courtLines: data.courtLines, hitPoses: data.hitPoses, endingReview: data.endingReview, humanReviews: reviews },null,2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = "shuttlesense-reviewed.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  return <div className="analysis-review">
    {data.focusSide === "near" && <p>Near-player analysis: court markings, hit candidates, pose measurements and movement.</p>}
    <header className="review-heading"><div><h2>Review your recording</h2><p>{data.fileName} · {clock(data.duration)} · {data.width} × {data.height}</p></div><button type="button" onClick={download}>Download reviewed JSON</button></header>
    {data.options && <p>Enabled: {Object.entries(data.options).filter(([,enabled]) => enabled).map(([key]) => ({ yolo: 'YOLO players', shuttle: 'shuttle tracking', ground: 'ground checks', pose: 'body pose', shots: 'shot classification', llm: 'LLM coaching', ending: 'near-player ending review' })[key]).join(', ')}.</p>}
    {data.sceneSummary && <p>{data.sceneSummary.courtSegments.length} court-view segments; {(data.sceneSummary.excludedFrames/data.fps).toFixed(1)} seconds excluded from rally tracking because the court view was unavailable.</p>}
    <dl className="review-summary">
      <div><dt>{data.hitPoses ? 'Hit-pose candidates' : 'Contact candidates'}</dt><dd>{data.hitPoses?.length ?? data.shots.length}</dd></div>
      <div><dt>Model shot labels</dt><dd>{accepted}<small>{data.shots.length-accepted} unknown</small></dd></div>
      <div><dt>Possible rally starts</dt><dd>{data.rallies.length}<small>{data.rallies.filter(rally => rally.end !== null).length} estimated endings</small></dd></div>
      <div><dt>Your reviewed shots</dt><dd>{Object.keys(reviews.shots).length}<small>{Object.keys(reviews.rallies).length} rally windows reviewed</small></dd></div>
    </dl>
    <div className="review-workspace">
      <div className="review-main"><AnalysisCamera data={data} videoUrl={videoUrl} replay={replay} onTime={onTime}/>
        {data.hitPoses && <section className="review-events" aria-label="Near-side hit poses"><h3>Near-side hit poses</h3><p>Pretrained MediaPipe body landmarks with wrist/shuttle contact estimates. Timestamps identify observed frames, not confirmed impact. Raised arm means the wrist is above the shoulder; torso level means between shoulder and hip; low arm means at or below the hip. These describe visible arm position, not shot classifications.</p>
          {data.hitPoses.length ? <div className="review-table-wrap"><table className="review-shot-table"><caption>Select a timestamp to pause at its pose frame, or replay the movement.</caption><thead><tr><th scope="col">Timestamp / frame</th><th scope="col">Pose</th><th scope="col">Evidence</th><th scope="col">Replay</th></tr></thead><tbody>{data.hitPoses.map(event => <tr key={event.frame}><td><button type="button" onClick={() => setReplay(previous => ({ start: event.time, end: event.time, token: (previous?.token ?? 0)+1, paused: true }))}>Show pose at {event.time.toFixed(3)} s · frame {event.frame}</button></td><td>{event.pose}{event.measurements.elbow != null && <p>Elbow: {event.measurements.elbow.toFixed(1)}°</p>}{event.measurements.bodyLean != null && <p>Body lean: {event.measurements.bodyLean.toFixed(1)}°</p>}</td><td>{readable(event.status)} · {readable(event.reason)}</td><td><button type="button" onClick={() => play(event.time-.6,event.time+.6)}>Replay pose at {event.time.toFixed(3)} s</button></td></tr>)}</tbody></table></div> : <p>No near-side hit poses passed the checks{data.options?.pose === false ? ' because body pose was disabled' : ''}. Missing evidence remains unknown.</p>}
        </section>}
        {data.endingReview && <section className="review-events" aria-label="Near-player ending review"><h3>Near player before the ending</h3><p>Observed movement before possible ground stops. Evidence selects the closest visible wrist-to-shuttle separation within the final two seconds. Distances are in the image, not metres or physical reach. Intent, first ground touch and in/out remain unconfirmed.</p>
          <div className="review-table-wrap"><table className="review-shot-table"><caption>Inspect the final movement; an opposite-side shuttle can explain separation without proving why the player let it pass.</caption><thead><tr><th scope="col">Window / timestamp</th><th scope="col">Visible movement</th><th scope="col">Separation / last shot</th></tr></thead><tbody>{data.endingReview.map(item => <tr key={item.rallyId}><td>Window {item.rallyId}{item.evidence && <p><button type="button" onClick={() => setReplay(previous => ({start:item.evidence!.time,end:item.evidence!.time,token:(previous?.token ?? 0)+1,paused:true}))}>Show ending evidence at {item.evidence.time.toFixed(3)} s</button></p>}<button type="button" onClick={() => play(item.windowStart,item.windowEnd)}>Replay ending of window {item.rallyId}</button></td><td>{readable(item.status)}<p>{item.summary}</p>{item.evidence && <p>{item.evidence.pose}</p>}</td><td>{item.evidence ? <>{item.evidence.distancePx.toFixed(1)} px ({item.evidence.distanceHeights.toFixed(2)} player box heights)<p>Shuttle {Math.abs(item.evidence.horizontalOffsetPx).toFixed(1)} px to camera-{item.evidence.horizontalOffsetPx >= 0 ? 'right' : 'left'} of the torso.</p></> : 'Distance unavailable'}{item.lastShot && <p>Last near-player shot: {readable(item.lastShot.type)} at {item.lastShot.time.toFixed(3)} s ({readable(item.lastShot.status)}). This does not identify the intended missed shot.</p>}</td></tr>)}</tbody></table></div>
        </section>}
        {data.options?.llm !== false && <LandingCoaching videoUrl={videoUrl} fps={data.fps} duration={data.duration} time={time} analysisSha256={data.analysisSha256}/>}
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
          {data.shots.some(item => item.classificationWindow) && <p>Pretrained BST-0 uses body movement and shuttle trajectory after the previous detected hit, including this hit and follow-through, stopping before the next detected hit or camera cut. Missing hit detections can leave mixed movements; uncertain predictions stay Unknown.</p>}
          {shot && <div className="review-selected" key={shot.id}><div><span>Contact {shot.id} · {clock(shot.time)} · {readable(shot.side)} player</span><h4>{readable(shot.predictedType)}</h4><p>Model score: {shot.score === null ? "Unavailable" : percent(shot.score,1)}. This score is not measured accuracy.</p><p>{reviewReason(shot.reason)}</p>{shot.classificationWindow && <p>BST frames: {shot.classificationWindow[0].toFixed(3)} to {shot.classificationWindow[1].toFixed(3)} s (end excluded).</p>}<p className="review-status">{shot.playStatus === "outside_play" ? "Outside a detected play window" : shot.playStatus === "end_uncertain_review" ? "Rally ending is uncertain; this could be after the point" : readable(shot.playStatus)}</p><button type="button" onClick={() => playShot(shot)}>Replay this contact</button></div>
            <form onSubmit={reviewShot}><label htmlFor="review-shot-label">What do you see?</label><select id="review-shot-label" name="shot-label" defaultValue={reviews.shots[shot.id]?.label ?? (shot.predictedType ? canonicalShot(shot.predictedType) : "unknown")}>{shotTypes.map(type => <option key={type} value={type}>{readable(type)}</option>)}<option value="not playing">Not a playing shot / shuttle toss</option><option value="unknown">Cannot tell</option></select><button type="submit" disabled={!loaded}>Save shot review</button>{reviews.shots[shot.id] && <p>You marked: {readable(reviews.shots[shot.id].label)}</p>}</form>
          </div>}
          {shot && data.options?.llm !== false && <ContactEvidence shot={shot} videoUrl={videoUrl} fps={data.fps}/>}
          {displayed.length ? <div className="review-table-wrap"><table className="review-shot-table"><caption>{filtered.length} contacts in this filter. Select a contact to inspect it.</caption><thead><tr><th scope="col">Time</th><th scope="col">Player</th><th scope="col">Model label</th><th scope="col">Score</th><th scope="col">Your review</th></tr></thead><tbody>{displayed.map(item => <tr key={item.id} data-selected={item.id === selected}><td><button type="button" aria-pressed={item.id === selected} aria-label={`Review contact ${item.id} at ${clock(item.time)}`} onClick={() => { setSelected(item.id); playShot(item); }}>{clock(item.time)}</button></td><td>{readable(item.side)}</td><td>{readable(item.predictedType)}</td><td>{item.score === null ? "Unavailable" : percent(item.score,1)}</td><td>{reviews.shots[item.id] ? readable(reviews.shots[item.id].label) : "Needs review"}</td></tr>)}</tbody></table></div> : <p>No contacts match this filter.</p>}
          <nav className="review-pagination" aria-label="Contact pages"><button type="button" disabled={page <= 0} onClick={() => setPage(page-1)}>Previous</button><span>Page {Math.min(page+1,pageCount)} of {pageCount}</span><button type="button" disabled={page+1 >= pageCount} onClick={() => setPage(page+1)}>Next</button></nav>
        </section> : <section className="review-events" aria-label="Rally windows"><h3>Verify the start and end</h3><p>{data.options?.shots === false ? 'Windows group sustained shuttle motion. Gaps and camera cuts bound replay; ground contact remains unconfirmed.' : 'A possible serve start is a review cue. A window with an unknown ending may include walking or tossing.'}</p>
          {data.rallies.length ? <><label htmlFor="review-rally-picker">Review window</label><select id="review-rally-picker" value={rallyId ?? ""} onChange={e => setRallyId(Number(e.target.value))}>{data.rallies.map(rally => <option key={rally.id} value={rally.id}>Window {rally.id} · {clock(rally.start)} · {rally.end === null ? "Ending unknown" : "Estimated ending"}</option>)}</select>
            {rally && <div className="review-selected" key={rally.id}><div><h4>Window {rally.id}</h4><dl><div><dt>Possible start</dt><dd>{clock(rally.start)}</dd></div><div><dt>Model ending</dt><dd>{rally.end === null ? "Unknown" : clock(rally.end)}</dd></div><div><dt>Contact candidates</dt><dd>{rally.hitCandidates}</dd></div></dl><button type="button" onClick={() => { const human = reviews.rallies[rally.id]; play(human?.start ?? rally.start,human?.end ?? rally.end ?? rally.reviewStop); }}>Replay this window</button>{rally.end === null && <p>Replay stops at {clock(rally.reviewStop)} for review. That timestamp is not a detected rally end.</p>}</div>
              <form onSubmit={reviewRally}><label htmlFor="rally-start">Observed start (seconds)</label><input id="rally-start" name="rally-start" type="number" min="0" max={data.duration} step="0.001" required autoComplete="off" defaultValue={Number((reviews.rallies[rally.id]?.start ?? rally.start).toFixed(3))}/><button type="button" onClick={e => { const input = e.currentTarget.form?.elements.namedItem("rally-start") as HTMLInputElement; if (input) input.value = time.toFixed(3); }}>Use current time for start</button><label htmlFor="rally-end">Observed end (seconds)</label><input id="rally-end" name="rally-end" type="number" min="0" max={data.duration} step="0.001" required autoComplete="off" defaultValue={reviews.rallies[rally.id]?.end != null || rally.end != null ? Number((reviews.rallies[rally.id]?.end ?? rally.end!).toFixed(3)) : ""}/><button type="button" onClick={e => { const input = e.currentTarget.form?.elements.namedItem("rally-end") as HTMLInputElement; if (input) input.value = time.toFixed(3); }}>Use current time for end</button><button type="submit" disabled={!loaded}>Save verified window</button>{reviews.rallies[rally.id] && <p>Your window: {clock(reviews.rallies[rally.id].start)} to {clock(reviews.rallies[rally.id].end)}</p>}</form>
            </div>}</> : <p>{data.options?.shots === false ? 'No sustained shuttle-motion windows were found. Inspect the tracking and ground candidates.' : 'No possible service starts were found. Shot contacts are still available for review.'}</p>}
        </section>}
      </div>
      <aside className="review-sidebar" aria-label="Tracking values and heatmap">
        <section id="camera-values" className="review-live" tabIndex={-1} aria-label="Camera values"><div className="review-event-heading"><h3>Camera values</h3><span>{clock(time)}</span></div>{data.focusSide === "near" ? <p>Near player</p> : <label htmlFor="review-side">Player <select id="review-side" value={side} onChange={e => setSide(e.target.value as Side)}><option value="near">Near player</option><option value="far">Far player</option></select></label>}<p>{person ? `Tracked player #${person.trackId} · ${person.poseDetected ? "Pose observed" : "Pose unavailable"}` : "Player tracking unavailable at this frame"}</p>
          <dl className="review-measurements">{([['Left elbow','leftElbow'],['Right elbow','rightElbow'],['Left knee','leftKnee'],['Right knee','rightKnee'],['Wrist speed','wristSpeed']] as const).map(([label,key]) => <div key={key}><dt>{label}</dt><dd>{person?.measurements?.[key] == null ? "Unavailable" : `${number.format(person.measurements[key]!)} ${key === "wristSpeed" ? "body heights/s" : "°"}`}</dd></div>)}</dl><p>Angles come from visible 2D landmarks. Wrist speed is relative to box height, not metres per second.</p>
        </section>
        <section className="review-heatmap"><h3>{readable(side)} player movement</h3><CourtMap grid={map.grid} position={person?.court}/><p>{number.format(map.seconds)} seconds of in-court positions up to the current video time. Heat builds during playback and rewinds when you seek back. The dot shows the current approximate position.</p></section>
        <section className="review-quality"><h3>Data availability</h3><dl className="review-measurements"><div><dt>Near tracking</dt><dd>{percent(data.metrics.nearTracked,data.metrics.sampleCount)}</dd></div>{data.focusSide !== "near" && <div><dt>Far tracking</dt><dd>{percent(data.metrics.farTracked,data.metrics.sampleCount)}</dd></div>}<div><dt>Near poses</dt><dd>{percent(data.metrics.nearPoses,data.metrics.sampleCount)}</dd></div>{data.focusSide !== "near" && <div><dt>Far poses</dt><dd>{percent(data.metrics.farPoses,data.metrics.sampleCount)}</dd></div>}<div><dt>Shuttle proposals</dt><dd>{percent(data.metrics.shuttleDetected,data.metrics.shuttleFrames)}</dd></div></dl><p>Availability measures how often data exists. It does not measure correctness.</p></section>
      </aside>
    </div>
    <p className="review-feedback" role="status" aria-live="polite">{message}</p>
    {data.limitations.length > 0 && <details className="review-limitations"><summary>Analysis limitations</summary><ul>{data.limitations.map((value,index) => <li key={index}>{value}</li>)}</ul></details>}
  </div>;
}
