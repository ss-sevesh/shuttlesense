import type {ReviewData,ReviewPerson} from './analysis-review';
import type {MatchReportData} from './match-report';
export const demoHash='d'.repeat(64);
export function demoPlayer(time:number):ReviewPerson {
  const x=640+120*Math.sin(time),y=490;
  const offsets:Record<number,[number,number]>={11:[-22,-115],12:[22,-115],13:[-50,-75],14:[50,-75],15:[-72,-110],16:[72,-40],19:[-80,-120],20:[85,-30],23:[-18,-45],24:[18,-45],25:[-25,-5],26:[25,-5],27:[-30,35],28:[30,35],31:[-42,40],32:[42,40]};
  return {side:'near',trackId:1,box:[(x-90)/1280,(y-140)/720,180/1280,190/720],court:[(x-290)/700,.8],poseDetected:true,
    landmarks:Array.from({length:33},(_,i)=>[(x+(offsets[i]?.[0]??0))/1280,(y+(offsets[i]?.[1]??-140))/720]),scores:Array(33).fill(.95)};
}
export const demoData:ReviewData={
  videoSha256:demoHash,analysisSha256:demoHash,fileName:'Synthetic feature demo — not match analysis',duration:12,width:1280,height:720,fps:30,poseSampleHz:30,cached:true,focusSide:'near',
  samples:Array.from({length:360},(_,frame)=>({time:frame/30,people:[demoPlayer(frame/30)]})),
  shuttle:Array.from({length:360},(_,frame)=>({time:frame/30,point:[(640+180*Math.cos(frame/30*3))/1280,(350+60*Math.sin(frame/30*3))/720] as [number,number]})),
  shots:[],options:{yolo:true,shuttle:true,ground:true,pose:true,shots:false,llm:false,ending:true},
  rallies:[{id:1,start:1,end:5,reviewStop:5,hitCandidates:5,startStatus:'synthetic',endStatus:'synthetic'}, {id:2,start:7,end:11,reviewStop:11,hitCandidates:5,startStatus:'synthetic',endStatus:'synthetic'}],
  hitPoses:[1.5,2,2.5,3,4,7.5,8,8.5,9,10].map(time=>({frame:time*30,time,trackId:1,status:'synthetic',pose:'Synthetic raised-arm example',reason:'demo only',measurements:{elbow:120,bodyLean:10}})),
  endingReview:[4.5,10.5].map((time,index)=>{
    const wrist=demoPlayer(time).landmarks[15] as [number,number];
    const shuttle:[number,number]=[(640+180*Math.cos(time*3))/1280,(350+60*Math.sin(time*3))/720];
    const dx=(wrist[0]-shuttle[0])*1280,dy=(wrist[1]-shuttle[1])*720,distance=Math.hypot(dx,dy);
    return {rallyId:index+1,endTime:time+.5,windowStart:time-1.5,windowEnd:time+.5,status:'synthetic',summary:'Synthetic attempt example',lastShot:null,
      evidence:{frame:time*30,time,distancePx:distance,distanceHeights:distance/190,horizontalOffsetPx:dx,wristPoint:wrist,shuttlePoint:shuttle,pose:'Synthetic reaching posture'}};
  }),
  courtLines:{method:'synthetic',reason:'Generated diagram, not detected court lines',segments:[{start:0,end:12,lines:[{name:'left',points:[[290/1280,220/720],[150/1280,620/720]],support:1},{name:'right',points:[[990/1280,220/720],[1130/1280,620/720]],support:1},{name:'baseline',points:[[150/1280,620/720],[1130/1280,620/720]],support:1}]}]},
  metrics:{sampleCount:360,nearTracked:360,farTracked:0,nearPoses:360,farPoses:0,shuttleFrames:360,shuttleDetected:360},
  limitations:['Every statistic, pose, outcome and coaching paragraph in this demo is synthetic. No model runs. Demo outcomes reset when you reload.']
};
const answer={summary:'Synthetic demonstration: two rally windows are available for review.',observations:'Example at 4.5 s: the displayed near-player pose and shuttle point illustrate a reach. This paragraph is sample copy, not AI analysis.',training:'Sample drill: practise a balanced split step, a short reach and recovery to base. Try two sets of six repetitions at a comfortable pace.',uncertainty:'These generated diagrams cannot establish shot intent, contact, first ground touch, or a real performance problem.'};
export const demoReport:MatchReportData={status:'experimental',analysisSha256:demoHash,evidenceSha256:demoHash,model:'Synthetic report preview — no inference',revision:'demo',generatedAt:'2026-10-10T00:00:00Z',answer,rallyReports:demoData.rallies.map(r=>({rallyId:r.id,start:r.start,end:r.end!,outcome:'lost',answer}))};
export const demoLoss=(id:number)=>({rallyId:id,analysisSha256:demoHash,landingFrame:id===1?150:330,frames:id===1?[105,116,127,138,149]:[285,296,307,318,329],coaching:{status:'experimental',model:'Synthetic explanation',answer:{shotType:'unknown',visibleEvidence:answer.observations,coaching:answer.training,uncertainty:answer.uncertainty}}});
