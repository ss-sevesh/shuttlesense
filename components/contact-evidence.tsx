"use client";

import { useState } from "react";
import { readable, type ReviewShot } from "@/lib/analysis-review";

function EvidenceImage({ src, frame, contact }: { src: string; frame: number; contact: boolean }) {
  const [failed, setFailed] = useState(false);
  return <figure>{failed ? <p>Frame image unavailable</p> : <img src={src} alt={`Frame ${frame}${contact ? ", estimated contact" : ""}`} loading="lazy" onError={() => setFailed(true)}/>}<figcaption>{contact ? "Estimated contact · " : "Frame "}{frame}</figcaption></figure>;
}

export function ContactEvidence({ shot, videoUrl, fps }: { shot: ReviewShot; videoUrl: string; fps: number }) {
  const evidence = shot.contact;
  if (!evidence) return <p>This saved analysis predates frame-distance contact measurements. A new analysis is needed.</p>;
  return <section className="contact-evidence" aria-label="Contact frame evidence">
    <h4>Estimated contact and frame evidence</h4>
    <p>{evidence.frame === null ? `Timing unavailable: ${readable(evidence.status)}.` : `Frame ${evidence.frame} · ${(evidence.frame / fps).toFixed(3)} seconds · ${evidence.wrist} wrist proxy`}</p>
    <p>Wrist–shuttle distance: {evidence.distancePx === null ? "Unavailable" : `${evidence.distancePx.toFixed(1)} pixels`}. This is an estimate of impact timing.</p>
    <dl className="review-measurements">{([['Elbow / arm extension', 'elbow'], ['Body lean from image vertical', 'bodyLean'], ['Upper-arm elevation from torso', 'armElevation'], ['Racket face', 'racketFace']] as const).map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{evidence.measurements[key] === null ? "Unavailable" : `${evidence.measurements[key]!.toFixed(1)}°`}</dd></div>)}</dl>
    <p>Measurements use landmarks at the selected frame. Camera perspective affects these 2D angles.</p>
    <div className="contact-frames">{evidence.frames.map((frame, index) => frame === null ? <figure key={`missing-${index}`}><p>Frame outside recording</p></figure> : <EvidenceImage key={`${shot.id}-${frame}`} src={`${videoUrl.replace(/\/video$/, "")}/frames/${frame}`} frame={frame} contact={frame === evidence.frame}/>)}</div>
    <h4>Local vision coaching</h4>
    {shot.coaching?.status === "experimental" && shot.coaching.answer ? <><p>Suggested shot: {readable(shot.coaching.answer.shotType)} · experimental</p><p>{shot.coaching.answer.visibleEvidence}</p><p>{shot.coaching.answer.coaching}</p><p>Uncertainty: {shot.coaching.answer.uncertainty}</p></> : <p>{shot.coaching?.reason || "Coaching unavailable."}</p>}
  </section>;
}
