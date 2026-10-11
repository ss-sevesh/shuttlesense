"use client";
import { useEffect,useState,type FormEvent } from 'react';
import { days,emptyProfile,healthFields,type PlayerProfile as Profile } from '@/lib/player-profile';

export function PlayerProfile() {
  const [profile,setProfile]=useState<Profile>({...emptyProfile}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{let cancelled=false;fetch('/api/profile',{headers:{'Content-Type':'application/json'}}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error);if(!cancelled)setProfile(result.profile??{...emptyProfile});}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[]);
  async function save(event:FormEvent) {
    event.preventDefault();setBusy(true);setError('');setMessage('');
    try{const response=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(profile)});const result=await response.json();if(!response.ok)throw new Error(result.error);setProfile(result.profile);setMessage('Profile saved on this computer.');}
    catch(e){setError(e instanceof Error?e.message:'Save failed.');}finally{setBusy(false);}
  }
  async function remove() {
    setBusy(true);setError('');setMessage('');
    try{const response=await fetch('/api/profile',{method:'DELETE'});if(!response.ok)throw new Error('Deletion failed. Retry.');setProfile({...emptyProfile});setMessage('Profile deleted. Saved recordings are independent.');}
    catch(e){setError(e instanceof Error?e.message:'Deletion failed.');}finally{setBusy(false);}
  }
  function text(key:keyof Profile,label:string,type='text') {
    return <label className="profile-field" key={key}>{label}<input type={type} value={String(profile[key]??'')} maxLength={key==='name'?80:600} onChange={e=>setProfile({...profile,[key]:type==='number'?(e.target.value===''?null:Number(e.target.value)):e.target.value})}/></label>;
  }
  function select(key:'level'|'format'|'hand'|'dietaryPattern',label:string,values:string[]) {
    return <label className="profile-field">{label}<select value={profile[key]} onChange={e=>setProfile({...profile,[key]:e.target.value})}><option value="">Prefer not to say</option>{values.map(v=><option key={v} value={v}>{v}</option>)}</select></label>;
  }
  return <section className="panel profile-panel"><h2>Your local player profile</h2><p>Every field is optional. Details are stored in local files on this computer, outside browser storage and shared vectors. This is not an encrypted vault or a protected account.</p>
    {loading?<p role="status">Loading profile…</p>:<form onSubmit={save}><fieldset disabled={busy||!!error&&loading}><legend>Player and goals</legend><div className="profile-grid">{text('name','Display name')}{text('age','Age in years','number')}{text('heightCm','Height (cm)','number')}{text('weightKg','Weight (kg)','number')}{select('level','Badminton level',['beginner','intermediate','advanced'])}{select('format','Game format',['singles','doubles','both'])}{select('hand','Dominant hand',['left','right'])}{text('goals','Goals')}{text('weeklyPlay','Current weekly play')}</div></fieldset>
    <fieldset disabled={busy}><legend>Availability and recovery</legend><div className="profile-days">{days.map(day=><label key={day}><input type="checkbox" checked={profile.availableDays.includes(day)} onChange={e=>setProfile({...profile,availableDays:e.target.checked?[...profile.availableDays,day]:profile.availableDays.filter(d=>d!==day)})}/>{day}</label>)}</div><div className="profile-grid">{text('timeSlots','Available time slots')}{text('sessionMinutes','Session length (10–120 minutes)','number')}{text('timezone','Timezone (optional)')}{text('recoveryNotes','Sleep / recovery notes')}<label><input type="checkbox" checked={profile.courtAccess} onChange={e=>setProfile({...profile,courtAccess:e.target.checked})}/> Court access</label><label><input type="checkbox" checked={profile.gymAccess} onChange={e=>setProfile({...profile,gymAccess:e.target.checked})}/> Gym access</label></div></fieldset>
    <fieldset disabled={busy}><legend>Food preferences</legend><div className="profile-grid">{select('dietaryPattern','Dietary pattern',['omnivore','vegetarian','vegan'])}{text('allergies','Allergies / intolerances (or none)')}{text('cuisine','Preferred cuisine')}{text('foodBudget','Food budget (optional)')}</div><p>Height and weight do not set calorie targets.</p></fieldset>
    <fieldset disabled={busy}><legend>Optional health details</legend><p>Skip this section to keep using review, reports and chat. This form does not provide medical screening or clearance.</p><label><input type="checkbox" checked={profile.healthConsent} onChange={e=>setProfile({...profile,healthConsent:e.target.checked,...(!e.target.checked?{conditions:'',injuries:'',restrictions:'',clearanceAdvised:false}:{})})}/> I consent to using these optional health details in local chat.</label>{profile.healthConsent&&<><div className="profile-grid">{healthFields.map(k=>text(k,k==='conditions'?'Relevant conditions':k==='injuries'?'Current pain / injury':'Clinician exercise / food restrictions'))}</div><label><input type="checkbox" checked={profile.clearanceAdvised} onChange={e=>setProfile({...profile,clearanceAdvised:e.target.checked})}/> A clinician has advised clearance before activity</label></>}</fieldset>
    <div className="profile-actions"><button className="primary-button" disabled={busy} type="submit">{busy?'Saving…':'Save profile'}</button><button type="button" className="secondary-button" disabled={busy} onClick={remove}>Delete profile</button></div></form>}{error&&<p role="alert" className="inline-error">{error}</p>}{message&&<p role="status">{message}</p>}
  </section>;
}
