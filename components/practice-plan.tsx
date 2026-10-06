"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Clock, DownloadSimple, X } from "@phosphor-icons/react";
import { drills } from "@/lib/demo";
import { CourtMap } from "./court-map";

export function PracticePlan({ compact = false, onViewPlan }: { compact?: boolean; onViewPlan?: () => void }) {
  const [selected, setSelected] = useState<typeof drills[number]>(drills[0]);
  const [complete, setComplete] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try { const saved: unknown = JSON.parse(localStorage.getItem("shuttlesense-drills") || "[]"); if (Array.isArray(saved)) setComplete(saved.filter((id): id is string => typeof id === "string" && drills.some(drill => drill.id === id))); } catch { setStatus("Practice progress is available for this visit."); }
  }, []);
  function toggle(id: string) {
    const next = complete.includes(id) ? complete.filter(value => value !== id) : [...complete, id];
    setComplete(next);
    try { localStorage.setItem("shuttlesense-drills", JSON.stringify(next)); setStatus(next.includes(id) ? "Drill marked complete." : "Drill marked incomplete."); } catch { setStatus("Progress updated for this visit; your browser could not save it."); }
  }
  function download() {
    const text = "ShuttleSense | Sample practice plan\nBased on fictional demo insights, not analysis of your video.\n\n" + drills.map(drill => `${drill.title} | ${drill.minutes} minutes | ${drill.sets}\n${drill.steps.join("\n")}\nSuccess cue: ${drill.cue}`).join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "shuttlesense-practice-plan.txt"; anchor.click(); URL.revokeObjectURL(url);
    setStatus("Sample practice plan downloaded.");
  }
  return <section className={`panel practice-panel ${compact ? "compact" : "full-practice"}`} aria-labelledby="practice-heading">
    <div className="panel-heading"><div><h2 id="practice-heading">Your next session</h2><p>Less guessing. More purposeful practice.</p></div><span className="subtle-tag"><Clock size={14}/>24 min</span></div>
    {!compact && <div className="practice-intro"><CourtMap mode="drill"/><div><span className="focus-label">Start with footwork</span><h3>A quicker first step.<br/>A stronger next rally.</h3><p>This sample plan prioritizes recovery, then shot depth. Warm up first and work at a pace that keeps your movement balanced.</p><button className="primary-button" onClick={download}>Download Plan <DownloadSimple size={18}/></button></div></div>}
    <div className="drill-list">{drills.map((drill, index) => <div className={`drill-row ${complete.includes(drill.id) ? "completed" : ""}`} key={drill.id}>
      <span className="drill-number">{(index + 1).toString().padStart(2, "0")}</span>
      <button className="drill-open" onClick={() => {setSelected(drill); dialog.current?.showModal();}}><strong>{drill.title}</strong><span>{drill.sets} <span className="meta-separator">/</span> {drill.minutes} min</span></button>
      {compact ? <button className="icon-button" aria-label={`View ${drill.title} drill`} onClick={() => {setSelected(drill); dialog.current?.showModal();}}><ArrowUpRight size={19}/></button> : <button className="completion-button" aria-label={`Mark ${drill.title} ${complete.includes(drill.id) ? "incomplete" : "complete"}`} aria-pressed={complete.includes(drill.id)} onClick={() => toggle(drill.id)}>{complete.includes(drill.id) && <Check size={17}/>}</button>}
    </div>)}</div>
    {compact ? <button className="text-button full-width" onClick={onViewPlan}>Open Practice Plan <ArrowUpRight size={17}/></button> : <p className="practice-disclaimer">Sample drills for demonstrating the coaching experience. Stop if a movement causes pain.</p>}
    <span className="sr-only" role="status">{status}</span>
    <dialog ref={dialog} className="modal drill-modal" aria-labelledby="drill-title"><div className="modal-header"><span className="focus-label">{selected.focus} <span className="meta-separator">/</span> {selected.minutes} min</span><button className="icon-button" aria-label="Close drill" onClick={() => dialog.current?.close()}><X size={22}/></button></div><h2 id="drill-title">{selected.title}</h2><p className="modal-subtitle">{selected.subtitle}</p><div className="drill-instructions"><CourtMap mode="drill"/><ol>{selected.steps.map(step => <li key={step}>{step}</li>)}</ol></div><div className="success-cue"><Check size={20}/><p><strong>Your success cue</strong>{selected.cue}</p></div><button className="primary-button full-width" onClick={() => {toggle(selected.id); dialog.current?.close();}}>{complete.includes(selected.id) ? "Mark Incomplete" : "Mark Complete"} <Check size={18}/></button><p className="drill-sample-note">Illustrative drill from the sample match.</p></dialog>
  </section>;
}
