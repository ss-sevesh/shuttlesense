"use client";

import { useState, type FormEvent } from 'react';
import type { Measurements, ShotCoaching } from '@/lib/analysis-review';

type LandingReport = { landingFrame: number; fps: number; frames: number[]; analysisSha256: string; videoSha256: string; pose: { frame: number; poseTime: number | null; trackId: number | null; court: [number, number] | null; measurements: Measurements | null }[]; coaching: ShotCoaching };

export function LandingCoaching({ videoUrl, fps, duration, time, analysisSha256 }: { videoUrl: string; fps: number; duration: number; time: number; analysisSha256: string }) {
  const endpoint = `${videoUrl.replace(/\/video$/, '')}/landing`;
  const [landingTime, setLandingTime] = useState('');
  const [report, setReport] = useState<LandingReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setReport(null);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frame: Math.round(Number(landingTime) * fps) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Coaching could not complete.');
      if (result.analysisSha256 !== analysisSha256 || !Array.isArray(result.frames) || result.frames.length !== 5 || !result.coaching) throw new Error('The returned evidence does not match this analysis.');
      setReport(result);
    } catch (error) { setError(error instanceof Error ? error.message : 'Coaching could not complete.'); }
    finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'shuttlesense-before-landing.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const pose = report?.pose.at(-1);
  return <section className="contact-evidence landing-coaching" aria-label="Before-landing coaching" aria-busy={busy}>
    <h3>Coaching before the shuttle lands</h3>
    <p>Pause the replay where you see the shuttle reach the ground, then use that time. Five earlier frames from the preceding second will be sent to the local AI.</p>
    <form onSubmit={submit}><label htmlFor="landing-time">Observed landing time (seconds)</label><input id="landing-time" type="number" min="1" max={(Math.ceil(duration * fps) - 1) / fps} step="any" required value={landingTime} disabled={busy} onChange={e => setLandingTime(e.target.value)}/><button type="button" disabled={busy} onClick={() => setLandingTime((Math.round(time * fps) / fps).toFixed(6))}>Use replay time for landing</button><button type="submit" disabled={busy || !landingTime}>{busy ? 'Reviewing earlier frames…' : 'Send pre-landing frames to AI'}</button></form>
    <p role="status">{busy ? 'Local AI is reviewing the near player. This can take a few minutes.' : error}</p>
    {report && <><p>Selected landing: frame {report.landingFrame} at {(report.landingFrame / report.fps).toFixed(3)}s. This is your selected time, not an automatically confirmed landing.</p>
      <div className="contact-frames">{report.frames.map(frame => <figure key={frame}><img src={`${endpoint}?frame=${report.landingFrame}&image=${frame}`} alt={`Near-player evidence before selected landing, frame ${frame}`} loading="lazy"/><figcaption>{(frame / report.fps).toFixed(3)}s · frame {frame}</figcaption></figure>)}</div>
      <p>{pose?.court && pose.poseTime != null ? `Near player position sampled at ${pose.poseTime.toFixed(3)}s: x ${pose.court[0].toFixed(2)}, y ${pose.court[1].toFixed(2)} (normalized court coordinates).` : 'Near-player court position unavailable.'}</p>
      <dl className="review-measurements">{([['Left elbow', 'leftElbow'], ['Right elbow', 'rightElbow'], ['Left knee', 'leftKnee'], ['Right knee', 'rightKnee']] as const).map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{pose?.measurements?.[key] == null ? 'Unavailable' : `${pose.measurements[key]!.toFixed(1)}°`}</dd></div>)}</dl>
      {report.coaching.status === 'experimental' && report.coaching.answer ? <><h4>What the AI observed</h4><p>{report.coaching.answer.visibleEvidence}</p><h4>Possible alternative</h4><p>{report.coaching.answer.coaching}</p><p>Uncertainty: {report.coaching.answer.uncertainty}</p></> : <p>{report.coaching.reason || 'Coaching unavailable.'}</p>}
      <button type="button" onClick={download}>Download before-landing review</button>
    </>}
    <p>Advice is experimental. These frames may not show the earlier stroke or a chance to return the shuttle; an alternative cannot be guaranteed to change the outcome.</p>
  </section>;
}
