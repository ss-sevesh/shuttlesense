import type { ReviewData, ReviewPerson } from './analysis-review';

const joints: Record<string,[number,number,number]> = {
  'Left shoulder':[13,11,23], 'Right shoulder':[14,12,24],
  'Left elbow':[11,13,15], 'Right elbow':[12,14,16],
  'Left wrist (finger proxy)':[13,15,19], 'Right wrist (finger proxy)':[14,16,20],
  'Left hip':[11,23,25], 'Right hip':[12,24,26],
  'Left knee':[23,25,27], 'Right knee':[24,26,28],
  'Left ankle':[25,27,31], 'Right ankle':[26,28,32],
};

export function poseAngles(person: ReviewPerson | undefined, width:number, height:number): Record<string,number|null> {
  return Object.fromEntries(Object.entries(joints).map(([name,indices])=>{
    if (!person?.poseDetected || indices.some(i=>!person.landmarks[i]?.every(Number.isFinite) || !(person.scores[i]>=.5))) return [name,null];
    const [a,b,c]=indices.map(i=>[person.landmarks[i][0]*width,person.landmarks[i][1]*height]);
    const u=[a[0]-b[0],a[1]-b[1]], v=[c[0]-b[0],c[1]-b[1]];
    const norm=Math.hypot(...u)*Math.hypot(...v);
    return [name,norm>1e-6 ? Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/norm)))*180/Math.PI : null];
  }));
}

export function hitPoseAngles(data:ReviewData,event:NonNullable<ReviewData['hitPoses']>[number]): Record<string,number|null> {
  // Exact frame and identity only: adjacent frames can belong to another movement.
  const sample=data.samples.find(s=>Math.round(s.time*data.fps)===event.frame);
  const person=sample?.people.find(p=>p.side==='near' && p.trackId===event.trackId);
  return {...poseAngles(person,data.width,data.height),'Contact elbow':event.measurements.elbow,
    'Body lean':event.measurements.bodyLean,
    'Arm elevation':(event.measurements as {armElevation?:number|null}).armElevation ?? null};
}
