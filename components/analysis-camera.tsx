"use client";

import { useEffect, useRef, useState } from "react";
import { nearestIndex, type ReviewData } from "@/lib/analysis-review";

export type ReplayWindow = { start: number; end: number; token: number; paused?: boolean };
const bones = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
export function AnalysisCamera({ data, videoUrl, replay, onTime }: { data: ReviewData; videoUrl: string; replay: ReplayWindow | null; onTime: (time: number) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const bound = useRef<number | null>(null);
  const [time, setTime] = useState(0);
  const [boxes, setBoxes] = useState(data.options?.yolo !== false);
  const [poses, setPoses] = useState(data.options?.pose !== false);
  const [shuttle, setShuttle] = useState(data.options?.shuttle !== false);
  const [lines, setLines] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let frame = 0, previous = -1;
    const update = () => {
      const player = video.current;
      if (player) {
        if (bound.current !== null && player.currentTime >= bound.current) { player.pause(); bound.current = null; }
        const current = Math.round(player.currentTime * 30) / 30;
        if (current !== previous) { previous = current; setTime(current); onTime(current); }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [onTime]);
  useEffect(() => {
    if (!replay || !video.current) return;
    bound.current = replay.end;
    video.current.currentTime = replay.start;
    if (replay.paused) { video.current.pause(); bound.current = null; return; }
    video.current.play().catch(error => { if (error.name !== "AbortError") setError("Press Play to start this review window."); });
  }, [replay]);
  const sample = nearestIndex(data.samples, time, 1.5 / data.poseSampleHz);
  const shuttleIndex = nearestIndex(data.shuttle, time, 1.5 / data.fps);
  const point = shuttleIndex >= 0 ? data.shuttle[shuttleIndex].point : null;
  return <section className="review-camera" aria-label="Video and tracking overlays">
    <div className="review-camera-frame" style={{ position: "relative", aspectRatio: `${data.width}/${data.height}` }}>
      <video ref={video} src={videoUrl} controls playsInline preload="metadata" aria-label={`Match recording: ${data.fileName}`} style={{ width: "100%", height: "100%", display: "block" }} onError={() => setError("Video could not load. Reload the analysis and try again.")} onSeeking={() => { if (video.current && bound.current !== null && video.current.currentTime > bound.current) bound.current = null; }} />
      <svg viewBox={`0 0 ${data.width} ${data.height}`} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {lines && data.courtLines?.segments.find(segment => time >= segment.start && time < segment.end)?.lines.map(line => <g key={line.name} data-court-line={line.name}><title>{line.name}</title><polyline points={line.points.map(([x,y]) => `${x*data.width},${y*data.height}`).join(' ')} fill="none" stroke="#67e9ff" strokeWidth="3"/></g>)}
        {sample >= 0 && data.samples[sample].people.map(person => {
          const [x,y,w,h] = person.box;
          const color = person.side === "near" ? "#b9f58d" : "#ffe09a";
          return <g key={`${person.side}-${person.trackId}`} stroke={color} fill="none" strokeWidth="2">
            {boxes && <><rect x={x*data.width} y={y*data.height} width={w*data.width} height={h*data.height}/><text x={x*data.width} y={Math.max(14,y*data.height-5)} fill={color} stroke="none" fontSize="13">{person.side === "near" ? "Near" : "Far"} · #{person.trackId}</text></>}
            {poses && person.poseDetected && bones.map(([a,b]) => person.landmarks[a] && person.landmarks[b] && person.scores[a] >= .3 && person.scores[b] >= .3 ? <line key={`${a}-${b}`} x1={person.landmarks[a][0]*data.width} y1={person.landmarks[a][1]*data.height} x2={person.landmarks[b][0]*data.width} y2={person.landmarks[b][1]*data.height}/> : null)}
          </g>;
        })}
        {shuttle && point && <circle cx={point[0]*data.width} cy={point[1]*data.height} r="5" fill="#b9f58d" stroke="#183522" strokeWidth="2"/>}
      </svg>
    </div>
    <div className="review-overlay-controls">
      <label><input type="checkbox" checked={boxes} onChange={e => setBoxes(e.target.checked)}/> Player boxes</label>
      <label><input type="checkbox" checked={poses} onChange={e => setPoses(e.target.checked)}/> Body pose</label>
      <label><input type="checkbox" checked={shuttle} onChange={e => setShuttle(e.target.checked)}/> Shuttle</label>
      {data.courtLines && <label><input type="checkbox" checked={lines} onChange={e => setLines(e.target.checked)}/> Near-side court lines</label>}
      <button type="button" onClick={() => { bound.current = null; video.current?.play().catch(() => setError("Press the video Play control to continue.")); }}>Play full video</button>
    </div>
    <p className="review-media-description">Boxes identify tracked players. Lines show visible body landmarks; the dot shows a shuttle proposal. Missing detections stay hidden.</p>
    {data.courtLines && <p>{data.courtLines.reason} Cyan highlights show fitted white markings and disappear outside court views.</p>}
    {error && <p role="status">{error}</p>}
  </section>;
}
