import type { ReviewData } from './analysis-review';

// Same-frame image evidence only: never compare court-floor positions with shuttle pixels.
export function shuttleContext(data: ReviewData, frame: number, trackId?: number) {
  const time=frame/data.fps;
  const sample=data.samples.find(s=>Math.round(s.time*data.fps)===frame);
  const player=sample?.people.find(p=>p.side==='near' && (trackId===undefined || p.trackId===trackId));
  const shuttle=data.shuttle.find(s=>Math.round(s.time*data.fps)===frame)?.point;
  const base={frame,time:Math.round(time*1000)/1000,trackId:player?.trackId ?? null};
  if(!player || !shuttle) return {...base,status:'unavailable',reason:'Same-frame near player or tracked shuttle missing',shuttlePoint:null,wristGapPx:null};
  const [x,y]=shuttle;
  const [left,top,width,height]=player.box;
  const horizontal=x<left?'camera-left of player box':x>left+width?'camera-right of player box':'within player box width';
  const vertical=y<top?'above player box':y>top+height?'below player box':'within player box height';
  const wrists=player.poseDetected?[15,16].filter(i=>player.scores[i]>=.5):[];
  const gaps=wrists.map(i=>Math.hypot((player.landmarks[i][0]-x)*data.width,(player.landmarks[i][1]-y)*data.height));
  const closest=gaps.length?gaps.indexOf(Math.min(...gaps)):-1;
  return {...base,status:'tracked_image_estimate',horizontal,vertical,
    shuttlePoint:[x,y],playerBox:player.box,court:player.court,
    wrist:closest<0?null:wrists[closest]===15?'left':'right',
    wristGapPx:closest<0?null:Math.round(gaps[closest]*10)/10,
    wristPoint:closest<0?null:player.landmarks[wrists[closest]]};
}
