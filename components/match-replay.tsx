"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowCounterClockwise, CornersOut, Path, Pause, Play } from "@phosphor-icons/react";
import { formatTime, issues, type Rally } from "@/lib/demo";

export function MatchReplay({ rally }: { rally: Rally }) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [trail, setTrail] = useState(true);
  useEffect(() => { setElapsed(0); setPlaying(false); }, [rally.id]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setElapsed(value => Math.min(value + .25, rally.duration)), 250);
    return () => window.clearInterval(timer);
  }, [playing, rally.duration]);
  useEffect(() => { if (elapsed >= rally.duration) setPlaying(false); }, [elapsed, rally.duration]);
  const progress = elapsed / rally.duration;
  const issue = issues.find(item => item.id === rally.issue);
  return <section className="panel replay-panel" aria-labelledby="replay-heading">
    <div className="panel-heading"><div><h2 id="replay-heading">A closer look</h2><p>Your selected rally, in context.</p></div><span className="subtle-tag">Rally {rally.id.toString().padStart(2, "0")}</span></div>
    <div className="replay-image" id="replay-stage">
      <Image src="/images/demo-court.webp" alt="Generated illustration of two club players on an indoor badminton court; this is not match footage" width={1536} height={1024} preload sizes="(max-width: 768px) 100vw, 58vw"/>
      {trail && <svg viewBox="0 0 800 450" preserveAspectRatio="none" className="movement-overlay" role="img" aria-label="Animated sample movement trail, not detected from this still"><path d="M370 360Q305 322 334 294T415 270L496 237" fill="none" stroke="#c8f294" strokeWidth="3" strokeDasharray="7 5"/><circle cx={370 + progress * 126} cy={360 - progress * 123} r="10" fill="#c8f294" stroke="#163c2d" strokeWidth="3"/></svg>}
      <button className="big-play" aria-label={playing ? "Pause movement demo" : "Play movement demo"} onClick={() => { if (elapsed >= rally.duration) setElapsed(0); setPlaying(!playing); }}>{playing ? <Pause weight="fill"/> : <Play weight="fill"/>}</button>
      <div className="image-meta"><span><span className="record-square"/>Illustrative still</span><span className="image-rally">{rally.outcome === "lost" ? "Lost rally" : "Won rally"}</span></div>
    </div>
    <div className="replay-controls">
      <button className="icon-button" aria-label="Restart movement demo" onClick={() => {setElapsed(0); setPlaying(false);}}><ArrowCounterClockwise size={19}/></button>
      <span className="time-display">{formatTime(elapsed)} <span>/ {formatTime(rally.duration)}</span></span>
      <input aria-label="Demo movement progress" type="range" min="0" max={rally.duration} step=".25" value={elapsed} onChange={event => setElapsed(Number(event.target.value))}/>
      <button className={`icon-button ${trail ? "is-on" : ""}`} aria-label="Show movement trail" aria-pressed={trail} onClick={() => setTrail(!trail)}><Path size={20}/></button>
      <button className="icon-button" aria-label="Expand replay" onClick={() => { const el = document.getElementById("replay-stage"); if (document.fullscreenElement) void document.exitFullscreen(); else void el?.requestFullscreen().catch(() => {}); }}><CornersOut size={20}/></button>
    </div>
    <div className="replay-note"><span className="green-dash"/>Sample trail animation. Upload your video for real playback.</div>
    <div className="rally-context"><strong>{issue?.title || (rally.outcome === "won" ? "You won this sample rally" : "A rally worth reviewing")}</strong><p>{issue?.description || "No specific coaching pattern is assigned to this fictional rally. Select another point to explore the sample insights."}</p></div>
  </section>;
}
