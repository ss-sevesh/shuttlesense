import { nearestIndex, type EndingReview, type ReviewData } from './analysis-review';

export const attemptBones=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

export function attemptPhotoGeometry(data:ReviewData,evidence:NonNullable<EndingReview['evidence']>,point:[number,number]) {
  const index=nearestIndex(data.samples,evidence.time,.5/data.fps);
  const person=index>=0?data.samples[index].people.find(p=>p.side==='near'&&p.poseDetected):null;
  const left=person?Math.max(0,Math.min(person.box[0],evidence.shuttlePoint[0],point[0])*data.width-32):0;
  const top=person?Math.max(0,Math.min(person.box[1],evidence.shuttlePoint[1],point[1])*data.height-32):0;
  const right=person?Math.min(data.width,Math.max(person.box[0]+person.box[2],evidence.shuttlePoint[0],point[0])*data.width+32):data.width;
  const bottom=person?Math.min(data.height,Math.max(person.box[1]+person.box[3],evidence.shuttlePoint[1],point[1])*data.height+32):data.height;
  return {person,left,top,width:right-left,height:bottom-top};
}
