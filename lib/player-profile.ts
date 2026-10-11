export const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const;
export const emptyProfile = {
  name:'',age:null as number|null,heightCm:null as number|null,weightKg:null as number|null,
  level:'',format:'',hand:'',goals:'',weeklyPlay:'',availableDays:[] as string[],timeSlots:'',
  sessionMinutes:null as number|null,courtAccess:false,gymAccess:false,recoveryNotes:'',timezone:'',
  dietaryPattern:'',allergies:'',cuisine:'',foodBudget:'',healthConsent:false,
  conditions:'',injuries:'',restrictions:'',clearanceAdvised:false,
};
export type PlayerProfile = typeof emptyProfile;
export const healthFields = ['conditions','injuries','restrictions'] as const;

export function validateProfile(input:unknown):PlayerProfile {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Invalid profile.');
  const raw=input as Record<string,unknown>, result={...emptyProfile,availableDays:[] as string[]};
  if(Object.keys(raw).some(k=>!Object.hasOwn(emptyProfile,k)))throw new Error('Unknown profile field.');
  for(const key of Object.keys(emptyProfile) as (keyof PlayerProfile)[]) {
    const value=raw[key] ?? emptyProfile[key];
    if(key==='availableDays') {
      if(!Array.isArray(value)||value.length>7||value.some(d=>!days.includes(d))||new Set(value).size!==value.length)throw new Error('Choose valid availability days.');
      result.availableDays=value;
    } else if(['age','heightCm','weightKg','sessionMinutes'].includes(key)) {
      const limits:Record<string,[number,number]>={age:[1,120],heightCm:[50,250],weightKg:[10,350],sessionMinutes:[10,120]};
      const [min,max]=limits[key];
      if(value!==null && (typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(key==='age'&&!Number.isInteger(value))))throw new Error('Invalid '+key+'.');
      Object.assign(result,{[key]:value});
    } else if(typeof emptyProfile[key]==='boolean') {
      if(typeof value!=='boolean')throw new Error('Invalid '+key+'.');
      Object.assign(result,{[key]:value});
    } else {
      if(typeof value!=='string'||value.length>(key==='name'?80:600)||/[\u0000-\u001f]/.test(value))throw new Error('Invalid '+key+'.');
      Object.assign(result,{[key]:value.trim()});
    }
  }
  for(const [key,values] of Object.entries({level:['','beginner','intermediate','advanced'],format:['','singles','doubles','both'],hand:['','left','right'],dietaryPattern:['','omnivore','vegetarian','vegan']}))
    if(!values.includes(String(result[key as keyof PlayerProfile])))throw new Error('Invalid '+key+'.');
  if(!result.healthConsent) {for(const key of healthFields)result[key]='';result.clearanceAdvised=false;}
  return result;
}
