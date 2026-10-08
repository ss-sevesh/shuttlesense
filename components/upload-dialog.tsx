"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, FileVideo, UploadSimple, X } from "@phosphor-icons/react";
import { UploadAnalysis } from "@/components/upload-analysis";

export function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; file: File } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open && dialog.current?.open) dialog.current?.close(); }, [open]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  function select(file?: File) {
    if (!file) return;
    setError("");
    if (!/\.(mp4|mov|webm)$/i.test(file.name) || (file.type && !["video/mp4", "video/quicktime", "video/webm"].includes(file.type))) { setError("Choose an MP4, MOV, or WebM video."); return; }
    if (file.size > 100 * 1024 * 1024 || file.size === 0) { setError("Choose a non-empty video smaller than 100 MB."); return; }
    setLoading(true);
    setPreview({ url: URL.createObjectURL(file), name: file.name, file });
  }
  return <dialog className="modal upload-modal" ref={dialog} onClose={onClose} aria-labelledby="upload-heading">
    <div className="modal-header"><span className="modal-mark"><UploadSimple size={24}/></span><button className="icon-button" aria-label="Close upload" onClick={() => dialog.current?.close()}><X size={22}/></button></div>
    <h2 id="upload-heading">Upload a Recording to Review</h2><p className="modal-subtitle">Keep both players and the full court visible. Review actual shot predictions, player posture and rally candidates.</p>
    <div className={`dropzone ${dragging ? "dragging" : ""}`} onDragOver={event => {event.preventDefault(); setDragging(true);}} onDragLeave={() => setDragging(false)} onDrop={event => {event.preventDefault(); setDragging(false); select(event.dataTransfer.files[0]);}}>
      <FileVideo size={40} weight="light"/><h3>Drop your match video here</h3><p>MP4, MOV, or WebM. Up to 100 MB.</p><button className="primary-button" onClick={() => input.current?.click()}>Choose Video <UploadSimple size={17}/></button>
      <input ref={input} type="file" name="match-video" aria-label="Match video" tabIndex={-1} accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="sr-only" onChange={event => {select(event.target.files?.[0]); event.target.value = "";}}/>
    </div>
    <p className="inline-error" role="alert">{error}</p>
    {preview && <section className="local-preview" aria-label="Local video preview" aria-busy={loading}>
      <div className="preview-file"><FileVideo size={19}/><strong>{preview.name}</strong><span>{loading ? "Loading…" : "Local preview"}</span></div>
      {loading && <div className="video-skeleton" role="status">Loading your preview…</div>}
      <UploadAnalysis key={preview.url} file={preview.file} url={preview.url} onReady={() => setLoading(false)} onError={() => {setLoading(false); setError("Your browser could not play this file. Try a WebM or H.264 MP4 recording.");}}/>
    </section>}
    <div className="privacy-note"><CheckCircle size={19}/><p>Your video stays on this device. Full analysis keeps a local copy so you can reopen the review; your corrections are saved in this browser. Nothing is uploaded to a hosted analysis service.</p></div>
  </dialog>;
}
