"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CourtMap } from "@/components/court-map";

type Point = [number, number];
type Person = { box: [number, number, number, number]; court: Point; side: "near" | "far" };
type Result = { duration: number; analyzedSeconds: number; sampleHz: number; samples: { time: number; people: Person[] }[] };
const cornersOrder = ["far-left", "far-right", "near-right", "near-left"];

export function UploadAnalysis({ file, url, onReady, onError }: { file: File; url: string; onReady: () => void; onError: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const request = useRef<AbortController | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [picking, setPicking] = useState(false);
  const [cursor, setCursor] = useState<Point>([.5, .5]);
  const [result, setResult] = useState<Result | null>(null);
  const [sample, setSample] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [side, setSide] = useState("near");
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!result) return;
    let frame = 0;
    const update = () => {
      const time = video.current?.currentTime ?? 0;
      let index = -1;
      if (time < result.analyzedSeconds) {
        for (let i = 0; i < result.samples.length && result.samples[i].time <= time + .001; i++) index = i;
        if (index >= 0 && time - result.samples[index].time > 1.5 / result.sampleHz) index = -1;
      }
      setSample(previous => previous === index ? previous : index);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [result]);
  const grid = useMemo(() => {
    const cells: number[][] = Array.from({ length: 8 }, () => Array(6).fill(0));
    result?.samples.forEach(sample => sample.people.filter(person => person.side === side).forEach(person => {
      const [x, y] = side === "far" ? [1-person.court[0], 1-person.court[1]] : person.court;
      cells[Math.min(7, Math.floor(y*8))][Math.min(5, Math.floor(x*6))] += Math.min(1/result.sampleHz, result.analyzedSeconds-sample.time);
    }));
    return cells;
  }, [result, side]);
  async function analyze() {
    if (corners.length !== 4 || busy) return;
    setError("");
    if (file.size > 100 * 1024 * 1024) { setError("Use a video under 100 MB for the analysis demo."); return; }
    setBusy(true); setResult(null);
    video.current?.pause();
    const controller = new AbortController(); request.current = controller;
    const form = new FormData(); form.set("video", file); form.set("corners", JSON.stringify(corners.flat()));
    try {
      const response = await fetch("/api/analyze-demo", { method: "POST", body: form, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed. Please try again.");
      if (!Array.isArray(data.samples) || !(data.analyzedSeconds > 0) || !(data.sampleHz > 0)) throw new Error("Analysis returned an invalid result.");
      setResult(data);
      if (video.current) video.current.currentTime = 0;
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Analysis failed.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const boxes = result && sample >= 0 ? result.samples[sample].people : [];
  return <div className="upload-analysis">
    <div className="analysis-layout">
      <div>
        <div className="analysis-video">
          <video ref={video} src={url} controls={!picking} playsInline preload="auto" onLoadedMetadata={onReady} onError={onError}/>
          {!picking && result && <svg className="analysis-boxes" viewBox="0 0 1000 1000" preserveAspectRatio="none" role="img" aria-label={`${boxes.length} detected people in court at this video time`}>
            {boxes.map((person, index) => <rect key={index} data-side={person.side} x={person.box[0]*1000} y={person.box[1]*1000} width={person.box[2]*1000} height={person.box[3]*1000} fill="none" stroke={person.side === "near" ? "#ffe766" : "#67e9ff"} strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>)}</svg>}
          {picking && <button className="corner-picker" aria-label={`Mark ${cornersOrder[corners.length]} court corner. Arrow keys move the crosshair; Enter marks it.`}
            onKeyDown={event => {
              const offsets: Record<string, Point> = { ArrowLeft: [-.01,0], ArrowRight: [.01,0], ArrowUp: [0,-.01], ArrowDown: [0,.01] };
              if (offsets[event.key]) { event.preventDefault(); const delta = offsets[event.key]; setCursor(point => [Math.max(0,Math.min(1,point[0]+delta[0])),Math.max(0,Math.min(1,point[1]+delta[1]))]); }
            }}
            onClick={event => {
              const rect = event.currentTarget.getBoundingClientRect();
              const point: Point = event.detail === 0 ? cursor : [(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height];
              setCorners(previous => [...previous,point]);
              if (corners.length === 3) setPicking(false);
            }}>
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={corners.map(p => `${p[0]*1000},${p[1]*1000}`).join(" ")} fill="none" stroke="#ffe766" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
              {corners.map((point,index) => <g key={index}><circle cx={point[0]*1000} cy={point[1]*1000} r="9" fill="#ffe766"/><text x={point[0]*1000+14} y={point[1]*1000} fill="#fff" fontSize="30">{index+1}</text></g>)}
              <path d={`M${cursor[0]*1000-15} ${cursor[1]*1000}h30 M${cursor[0]*1000} ${cursor[1]*1000-15}v30`} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
            </svg>
          </button>}
        </div>
        <div className="analysis-actions">
          <button className="text-button" disabled={busy} onClick={() => { if (video.current) { video.current.pause(); video.current.currentTime = 0; } setCorners([]); setPicking(true); setResult(null); setError(""); }}> {corners.length ? "Reset court corners" : "Mark court corners"}</button>
          <button className="primary-button" disabled={corners.length !== 4 || busy || picking} onClick={analyze}>{busy ? "Analyzing…" : "Show boxes & heatmap"}</button>
        </div>
        <p className="analysis-status" role="status">{busy ? "Detecting players in the first 30 seconds. This may take up to 90 seconds…" : picking ? `Click the ${cornersOrder[corners.length]} singles-court corner (${corners.length+1}/4). Or use arrow keys and Enter.` : result ? `Ready · ${result.analyzedSeconds.toFixed(1)} seconds analyzed. Play the video to see the boxes.` : corners.length === 4 ? "Court marked. Ready to analyze." : "Mark the four court corners on the first frame, clockwise from far-left. Use a fixed full-court view."}</p>
        <p className="inline-error" role="alert">{error}</p>
      </div>
      {result && <section className="analysis-map" aria-labelledby="upload-heatmap-heading">
        <h3 id="upload-heatmap-heading">Approximate movement heatmap</h3>
        <label>Show court side <select value={side} onChange={event => setSide(event.target.value)}><option value="near">Near side · yellow boxes</option><option value="far">Far side · blue boxes</option></select></label>
        <CourtMap grid={grid}/>
        <div className="heatmap-legend"><span>Less time</span><div/><span>More time</span></div>
        <p>{grid.flat().reduce((a,b) => a+b,0).toFixed(1)} seconds of detected positions. Box-bottom estimates; people on this side, not a verified player identity.</p>
      </section>}
    </div>
    {result && <p className="analysis-status">Demo: boxes sampled at {result.sampleHz.toFixed(0)} Hz; only the first 30 seconds are analyzed. Use a fixed camera and avoid edits or side changes.</p>}
  </div>;
}
