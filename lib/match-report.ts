import { hitPoseAngles } from './pose-angles';
import { movementHeatmap, validInterval, type HumanReviews, type ReviewData } from './analysis-review';

export type ReportAnswer = {summary:string;observations:string;training:string;uncertainty:string};
export type MatchReportData = {status:'experimental';analysisSha256:string;evidenceSha256:string;model:string;revision:string;generatedAt:string;answer:ReportAnswer;rallyReports:{rallyId:number;start:number;end:number;answer:ReportAnswer}[]};

export function reportEvidence(data:ReviewData,reviews:HumanReviews,outcomes:Record<number,string>,losses:Record<number,unknown>) {
  const round=(value:number)=>Math.round(value*1000)/1000;
  const poses=(data.hitPoses ?? []).map(event=>({...event,angles:Object.fromEntries(Object.entries(hitPoseAngles(data,event)).map(([name,value])=>[name,value===null?null:round(value)]))}));
  const rallies=data.rallies.map(r=>{
    const window=reviews.rallies[r.id];
    const start=window?.start ?? r.start, end=window?.end ?? r.end;
    const eligible=end!==null && validInterval(start,end,data.duration);
    const inside=(time:number)=>eligible && time>=start && time<end!;
    const map=movementHeatmap(data,'near',data.duration,eligible?[[start,end!]]:[]);
    const timeline=[];
    // One-second temporal summaries retain movement order; every hit gets its exact-frame angles below.
    if(eligible) for(let t=start;t<end!;t+=1) {
      const rows=data.samples.filter(s=>s.time>=t && s.time<Math.min(t+1,end!));
      const players=rows.flatMap(s=>s.people.filter(p=>p.side==='near'));
      const valid=players.filter(p=>p.court.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
      const shuttle=data.shuttle.filter(s=>s.time>=t && s.time<Math.min(t+1,end!) && s.point);
      timeline.push({start:round(t),end:round(Math.min(t+1,end!)),nearTracked:players.length,nearPoses:players.filter(p=>p.poseDetected).length,
        courtMean:valid.length?[0,1].map(i=>round(valid.reduce((sum,p)=>sum+p.court[i],0)/valid.length)):null,
        shuttleVisible:shuttle.length,shuttleFirst:shuttle[0]?.point ?? null,shuttleLast:shuttle.at(-1)?.point ?? null});
    }
    const ending=data.endingReview?.find(e=>e.rallyId===r.id);
    const endingInWindow=ending?.evidence && inside(ending.evidence.time);
    return {id:r.id,start:round(start),end:end===null?null:round(end),eligible,outcome:outcomes[r.id] ?? 'unknown',
      boundarySource:window?'user_verified':'detector_estimate',startStatus:r.startStatus,endStatus:r.endStatus,
      hitPoses:poses.filter(p=>inside(p.time)),movement:{trackedSeconds:round(map.seconds),grid:map.grid.map(row=>row.map(round)),timeline},
      ending:endingInWindow?{...ending,lastShot:ending?.lastShot?{time:ending.lastShot.time,status:ending.lastShot.status}:null}:null,endingExplanation:endingInWindow && outcomes[r.id]==='lost'?losses[r.id] ?? null:null};
  });
  return {schemaVersion:'match-report-v5',model:'Qwen/Qwen3-VL-2B-Instruct',modelRevision:'89644892e4d85e24eaac8bacfd4f463576704203',analysisSha256:data.analysisSha256,videoSha256:data.videoSha256,
    recording:{fileName:data.fileName,duration:data.duration,width:data.width,height:data.height,fps:data.fps,focusSide:'near'},
    interpretation:'Estimated rally boundaries and contact candidates; camera-dependent 2D angles. Null means unknown. Court x=left to right, y=far to near. Wrist angles use a finger proxy. No racket-face angle, first ground touch, physical distance or proven intent. Temporal tracks are one-second summaries; all hit poses have exact-frame angles. Fresh report prompts exclude cached AI interpretations and legacy shot labels; these remain source-appendix material. modelRequests lists actual section prompts.',
    rallies,allHitPoses:poses,excludedPoseCount:poses.filter(p=>!rallies.some(r=>r.eligible&&p.time>=r.start&&p.time<r.end!)).length,
    groundLanding:data.groundLanding ?? null,courtLines:data.courtLines ?? null,limitations:data.limitations};
}
