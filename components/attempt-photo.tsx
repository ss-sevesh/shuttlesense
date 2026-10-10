"use client";

import { useEffect, useState } from 'react';
import type { EndingReview, ReviewData } from '@/lib/analysis-review';
import { attemptBones, attemptPhotoGeometry } from '@/lib/attempt-photo';

export function AttemptPhoto({ data, videoUrl, evidence, readOnly=false, label='Exact attempt photo' }: {data:ReviewData;videoUrl:string;evidence:NonNullable<EndingReview['evidence']>;readOnly?:boolean;label?:string}) {
  const [racket, setRacket] = useState<[number,number]|null>(null);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState('');
  const key = `shuttlesense-racket-${data.analysisSha256}-${evidence.frame}`;
  useEffect(() => {
    try { const saved=JSON.parse(localStorage.getItem(key) ?? 'null'); if(Array.isArray(saved)&&saved.length===2&&saved.every(v=>Number.isFinite(v)&&v>=0&&v<=1))setRacket(saved as [number,number]); }
    catch { /* Optional manual annotation. */ }
  },[key]);
  function mark(point:[number,number]|null) {
    setRacket(point);
    try { if(point)localStorage.setItem(key,JSON.stringify(point));else localStorage.removeItem(key); }
    catch {setError('Racket mark could not be saved in this browser.');}
  }
  const point=racket ?? evidence.wristPoint;
  const gap=Math.hypot((point[0]-evidence.shuttlePoint[0])*data.width,(point[1]-evidence.shuttlePoint[1])*data.height);
  const {person,left,top,width,height}=attemptPhotoGeometry(data,evidence,point);
  const PhotoSurface=readOnly?'div':'button';
  return <figure className="attempt-photo" aria-label={label}>
    <PhotoSurface type={readOnly?undefined:'button'} className="attempt-photo-image" style={{aspectRatio:`${width}/${height}`}} aria-label={readOnly?undefined:marking?'Mark racket head on attempt photo':'Attempt photo with highlighted pose and shuttle gap'} onClick={event=>{
      if(!marking || event.detail===0)return;
      const box=event.currentTarget.getBoundingClientRect();
      mark([Math.max(0,Math.min(1,(left+(event.clientX-box.left)/box.width*width)/data.width)),Math.max(0,Math.min(1,(top+(event.clientY-box.top)/box.height*height)/data.height))]);
    }} onKeyDown={event=>{
      if(!marking || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();const origin=racket ?? evidence.wristPoint;
      mark([Math.max(0,Math.min(1,origin[0]+(event.key==='ArrowLeft'?-5:event.key==='ArrowRight'?5:0)/data.width)),Math.max(0,Math.min(1,origin[1]+(event.key==='ArrowUp'?-5:event.key==='ArrowDown'?5:0)/data.height))]);
    }}>
      <img style={{position:'absolute',width:`${data.width/width*100}%`,maxWidth:'none',left:`${-left/width*100}%`,top:`${-top/height*100}%`}} src={`${videoUrl.replace(/\/video$/,'')}/frames/${evidence.frame}`} width={data.width} height={data.height} alt={`Exact attempt frame ${evidence.frame} at ${evidence.time.toFixed(3)} seconds`} onError={()=>setError('Attempt photo could not load. Reload the review to retry.')}/>
      <svg viewBox={`${left} ${top} ${width} ${height}`} aria-hidden="true">
        {person && attemptBones.map(([a,b])=>person.scores[a]>=.3&&person.scores[b]>=.3?<line key={`${a}-${b}`} x1={person.landmarks[a][0]*data.width} y1={person.landmarks[a][1]*data.height} x2={person.landmarks[b][0]*data.width} y2={person.landmarks[b][1]*data.height} stroke="#b9f58d" strokeWidth="3"/>:null)}
        <g stroke="#ffbf69" strokeWidth="3" fill="none" data-attempt-distance={racket?'manual-racket':'wrist-proxy'}><line x1={point[0]*data.width} y1={point[1]*data.height} x2={evidence.shuttlePoint[0]*data.width} y2={evidence.shuttlePoint[1]*data.height} strokeDasharray="7 5"/><circle cx={point[0]*data.width} cy={point[1]*data.height} r="8"/><circle cx={evidence.shuttlePoint[0]*data.width} cy={evidence.shuttlePoint[1]*data.height} r="8"/></g>
        <text x={((point[0]+evidence.shuttlePoint[0])/2)*data.width} y={Math.max(24,((point[1]+evidence.shuttlePoint[1])/2)*data.height-12)} textAnchor="middle" fontSize="24" fill="white" stroke="#18251b" strokeWidth="4" paintOrder="stroke">{gap.toFixed(1)} px</text>
      </svg>
    </PhotoSurface>
    <figcaption><strong>{evidence.time.toFixed(3)} s · frame {evidence.frame}</strong><p>{racket?'Manually marked racket head → tracked shuttle':'Wrist proxy → tracked shuttle'}: <strong>{gap.toFixed(1)} px</strong> in the original frame. {racket?'Image gap, not a confirmed contact distance.':readOnly?'Proxy gap, not a physical racket distance.':'Mark the racket head to measure its gap instead.'}</p></figcaption>
    <details className="attempt-photo-condition"><summary>Why this photo?</summary><p>Smallest visible wrist-to-shuttle gap relative to player height, from continuous tracking within the final two seconds before the estimated rally end. This is not a confirmed ground-touch or racket-contact frame.</p></details>
    {!readOnly&&<div className="attempt-photo-controls"><button type="button" aria-pressed={marking} onClick={()=>setMarking(!marking)}>{marking?'Finish marking':'Mark racket head'}</button>{racket&&<button type="button" onClick={()=>mark(null)}>Reset racket mark</button>}</div>}
    {marking&&<p>Click the racket head in this photo, or focus the photo and use arrow keys to move the mark by 5 pixels.</p>}
    {error&&<p role="status">{error}</p>}
  </figure>;
}
