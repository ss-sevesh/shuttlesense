"use client";

import { useEffect, useState } from 'react';
import { nearestIndex, type EndingReview, type ReviewData } from '@/lib/analysis-review';

export function AttemptPhoto({ data, videoUrl, evidence }: {data:ReviewData;videoUrl:string;evidence:NonNullable<EndingReview['evidence']>}) {
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
  const index=nearestIndex(data.samples,evidence.time,.5/data.fps);
  const person=index>=0 ? data.samples[index].people.find(p=>p.side==='near'&&p.poseDetected) : null;
  const left=person?Math.max(0,Math.min(person.box[0],evidence.shuttlePoint[0],point[0])*data.width-32):0;
  const top=person?Math.max(0,Math.min(person.box[1],evidence.shuttlePoint[1],point[1])*data.height-32):0;
  const right=person?Math.min(data.width,Math.max(person.box[0]+person.box[2],evidence.shuttlePoint[0],point[0])*data.width+32):data.width;
  const bottom=person?Math.min(data.height,Math.max(person.box[1]+person.box[3],evidence.shuttlePoint[1],point[1])*data.height+32):data.height;
  const width=right-left,height=bottom-top;
  const bones=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
  return <figure className="attempt-photo" aria-label="Exact attempt photo">
    <button type="button" className="attempt-photo-image" style={{aspectRatio:`${width}/${height}`}} aria-label={marking?'Mark racket head on attempt photo':'Attempt photo with highlighted pose and shuttle gap'} onClick={event=>{
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
        {person && bones.map(([a,b])=>person.scores[a]>=.3&&person.scores[b]>=.3?<line key={`${a}-${b}`} x1={person.landmarks[a][0]*data.width} y1={person.landmarks[a][1]*data.height} x2={person.landmarks[b][0]*data.width} y2={person.landmarks[b][1]*data.height} stroke="#b9f58d" strokeWidth="3"/>:null)}
        <g stroke="#ffbf69" strokeWidth="3" fill="none" data-attempt-distance={racket?'manual-racket':'wrist-proxy'}><line x1={point[0]*data.width} y1={point[1]*data.height} x2={evidence.shuttlePoint[0]*data.width} y2={evidence.shuttlePoint[1]*data.height} strokeDasharray="7 5"/><circle cx={point[0]*data.width} cy={point[1]*data.height} r="8"/><circle cx={evidence.shuttlePoint[0]*data.width} cy={evidence.shuttlePoint[1]*data.height} r="8"/></g>
        <text x={((point[0]+evidence.shuttlePoint[0])/2)*data.width} y={Math.max(24,((point[1]+evidence.shuttlePoint[1])/2)*data.height-12)} textAnchor="middle" fontSize="24" fill="white" stroke="#18251b" strokeWidth="4" paintOrder="stroke">{gap.toFixed(1)} px</text>
      </svg>
    </button>
    <figcaption><strong>{evidence.time.toFixed(3)} s · frame {evidence.frame}</strong><p>{racket?'Manually marked racket head → tracked shuttle':'Wrist proxy → tracked shuttle'}: <strong>{gap.toFixed(1)} px</strong> in the original frame. {racket?'Image gap, not a confirmed contact distance.':'Mark the racket head to measure its gap instead.'}</p></figcaption>
    <div className="attempt-photo-controls"><button type="button" aria-pressed={marking} onClick={()=>setMarking(!marking)}>{marking?'Finish marking':'Mark racket head'}</button>{racket&&<button type="button" onClick={()=>mark(null)}>Reset racket mark</button>}</div>
    {marking&&<p>Click the racket head in this photo, or focus the photo and use arrow keys to move the mark by 5 pixels.</p>}
    {error&&<p role="status">{error}</p>}
  </figure>;
}
