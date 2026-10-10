"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle, UploadSimple } from "@phosphor-icons/react";
import { AnalysisReview } from "@/components/analysis-review";
import { isReviewData, type ReviewData } from "@/lib/analysis-review";
import { defaultAnalysisOptions, type AnalysisOptions } from "@/lib/analysis-options";

type Job = { id: string; status: "queued" | "processing" | "complete" | "failed"; stage: string; progress: number; error?: string; result?: ReviewData };

export function AnalysisJobProgress({ id, onComplete }: { id: string; onComplete: (data: ReviewData, id: string) => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/analysis/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
        const next = await response.json();
        if (!response.ok) throw new Error(next.error || "The analysis could not be loaded. Retry the connection.");
        if (!next || !["queued", "processing", "complete", "failed"].includes(next.status) ||
            typeof next.stage !== "string" || !Number.isFinite(next.progress)) throw new Error("The server returned an incomplete status. Retry the connection.");
        setJob(next); setError("");
        if (next.status === "complete") {
          const data = next.result;
          if (!isReviewData(data)) {
            throw new Error("The analysis report is incomplete. Please analyze the video again.");
          }
          onComplete(data, id);
        } else if (next.status !== "failed") timer = setTimeout(poll, 2000);
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "The analysis connection failed. Retry it below.");
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id, onComplete, retry]);
  return <section className="analysis-job-progress" aria-label="Video analysis progress" aria-busy={!error && job?.status !== "failed"}>
    <div className="job-progress-heading"><strong>{job?.stage || "Connecting to Your Analysis…"}</strong><span>{Math.round(Math.max(0, Math.min(100, job?.progress ?? 0)))}%</span></div>
    <progress aria-label="Analysis progress" max="100" value={Math.max(0, Math.min(100, job?.progress ?? 0))}/>
    <p role="status">{job?.status === "failed" ? job.error || "Analysis failed. Choose a readable video and try again." : "Your entire clip is processed locally. Tracking may take several minutes; you can keep this review open."}</p>
    {error && <><p className="inline-error" role="alert">{error}</p><button className="secondary-button" onClick={() => setRetry(value => value + 1)}>Retry Connection</button></>}
    <a className="text-button" href={`/review/${encodeURIComponent(id)}`} target="_blank" rel="noopener">Open Analysis in Its Own Page <ArrowUpRight size={16} aria-hidden="true"/></a>
  </section>;
}

export function StartShotAnalysis({ file, corners, onMarkCourt, onComplete }: { file: File; corners: [number, number][]; onMarkCourt: () => void; onComplete: (data: ReviewData, id: string) => void }) {
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  const [options, setOptions] = useState<AnalysisOptions>({ ...defaultAnalysisOptions });
  function toggle(key: keyof AnalysisOptions, checked: boolean) {
    const next = { ...options, [key]: checked };
    if (checked && key === 'llm') next.shots = true;
    if (checked && next.shots) next.pose = next.shuttle = true;
    if (checked && next.pose) next.yolo = true;
    if (checked && key === 'ground') next.shuttle = true;
    if (!next.yolo) next.pose = false;
    if (!next.shuttle) next.ground = false;
    if (!next.pose || !next.shuttle) next.shots = false;
    if (!next.shots) next.llm = false;
    setOptions(next);
  }
  async function start() {
    if (busy) return;
    if (corners.length !== 4) { onMarkCourt(); return; }
    setBusy(true); setError(""); setFailed(false);
    const form = new FormData(); form.set("video", file); form.set("corners", JSON.stringify(corners.flat())); form.set("options", JSON.stringify(options));
    try {
      const response = await fetch("/api/analysis", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The video could not be uploaded. Please try again.");
      if (typeof result.id !== "string" || !/^[a-f0-9-]{36}$/.test(result.id)) throw new Error("The server did not return an analysis ID. Please try again.");
      setId(result.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed. Please try again."); setFailed(true);
    } finally { setBusy(false); }
  }
  return <section className="shot-upload-start" aria-label="Shot and rally analysis">
    {!id && <fieldset disabled={busy}><legend>Analysis options</legend><p>Choose what runs before generating results. Required features enable together.</p>
      {([['yolo', 'YOLO player tracking'], ['shuttle', 'Shuttle tracking (TrackNet)'], ['ground', 'Ground segmentation and touch candidates'], ['pose', 'Body pose'], ['shots', 'Shot classification'], ['llm', 'LLM coaching and frame extraction']] as const).map(([key,label]) =>
        <label key={key} style={{ display: 'block' }}><input type="checkbox" checked={options[key]} onChange={event => toggle(key,event.target.checked)}/>{label}</label>)}
    </fieldset>}
    {!id && <><div><span className="intro-label">YOUR VIDEO · REAL ANALYSIS</span><h3>Review Your Shots & Rallies</h3><p>See player posture, shuttle detections and predicted shot types. Confirm or correct what you observe.</p></div>
      <button className="primary-button" disabled={busy} onClick={() => void start()}><UploadSimple size={17} aria-hidden="true"/>{busy ? "Uploading Video…" : failed ? "Retry Shots & Rallies" : "Analyze Shots & Rallies"}</button></>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {id && <AnalysisJobProgress key={id} id={id} onComplete={onComplete}/>}
  </section>;
}

export function SavedAnalysisReview({ id }: { id: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const ready = useCallback((result: ReviewData) => setData(result), []);
  return <main id="main" className="saved-analysis main-content"><a className="skip-link" href="#review-content">Skip to review</a><a className="text-button" href="/">Back to Workspace <ArrowUpRight size={16} aria-hidden="true"/></a>
    <div className="page-heading"><div><div className="intro-label">YOUR VIDEO REVIEW</div><h1>{data?.options?.shots === false ? 'Check the Rally Boundaries.' : 'Check the Contact. Choose the Shot.'}</h1><p>Watch the evidence, then confirm the rally boundaries.</p></div>{data && <span className="review-badge"><CheckCircle size={16} aria-hidden="true"/>Analysis Ready</span>}</div>
    <div id="review-content">{data ? <AnalysisReview key={data.analysisSha256} data={data} videoUrl={`/api/analysis/${encodeURIComponent(id)}/video`}/> : <AnalysisJobProgress id={id} onComplete={ready}/>}</div>
  </main>;
}
