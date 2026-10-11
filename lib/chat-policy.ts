import type {PlayerProfile} from './player-profile';
import type {ChatSource,ChatContext} from './chat-context';
import {referenceSources} from './chat-context';
export type ChatAnswer={answer:string;citations:string[];sources:ChatSource[];mode:'evidence'|'guidance'|'scope';};
const medical=/\b(pain|injur\w*|symptom\w*|diagnos\w*|medicat\w*|prescri\w*|disease\w*|diabet\w*|treat\w*|rehab\w*|clearance|cleared|supplement\w*|steroid\w*|chest|faint\w*|dizz\w*|pregnan\w*|blood|calori\w*|fasting|weight.?loss|lose.?weight|cutting|detox|dosage|drug\w*)\b/i;
const food=/\b(food|eat|eating|meal\w*|diet\w*|nutrition|snack\w*|allerg\w*|fuel\w*|hydrati\w*)\b/i;
const schedule=/\b(schedule|weekly|week|routine|plan|session\w*|training|practi[cs]e|drill\w*|exercise\w*|workout\w*)\b/i;
function response(answer:string,ids:string[],mode:ChatAnswer['mode']='guidance'):ChatAnswer {
  return {answer,citations:ids,sources:referenceSources.filter(s=>ids.includes(s.id)),mode};
}
export function checkedGuidance(question:string,profile:PlayerProfile):ChatAnswer|null {
  if(medical.test(question))return response('I can discuss badminton evidence and general practice or food education, but cannot provide diagnosis, treatment diets, medication or supplement advice, rehabilitation, weight-loss programs or medical clearance. Discuss symptoms, injuries and clinician restrictions with an appropriate healthcare professional; seek urgent help for severe or sudden symptoms.',[],'scope');
  const wantsFood=food.test(question),wantsSchedule=schedule.test(question);
  if(!wantsFood&&!wantsSchedule)return null;
  if(profile.healthConsent&&(profile.clearanceAdvised||profile.conditions||profile.injuries||profile.restrictions))return response('Your consented health details include a condition, injury or clinician restriction. I will not generate a personal food or activity plan that could override it. Ask your clinician or sports dietitian which activities and foods are appropriate. Match evidence remains available.',[],'scope');
  if(wantsFood) {
    if(!profile.allergies.trim())return response('Before food examples, add your allergies/intolerances (or “none”) and dietary pattern in Player Profile. General AIS education covers fueling and recovery; it does not prescribe a personal diet.',['ais-nutrition']);
    const allergens=profile.allergies.toLowerCase().split(/[,;/]+/).map(s=>s.trim());
    const known=new Set(['none','no allergies','milk','dairy','lactose','egg','eggs','peanut','peanuts','tree nuts','nuts','soy','soya','wheat','gluten','fish','shellfish','sesame']);
    if(allergens.some(a=>!known.has(a)))return response('I cannot reliably match the listed allergy or intolerance to the small reviewed food catalog. Please check suitable foods with a sports dietitian; I will not guess an allergy-safe menu.',['ais-recipes']);
    if(!profile.dietaryPattern)return response('Add your dietary pattern in Player Profile so food examples fit it.',['ais-nutrition']);
    const examples=[{name:'Rice, lentils and cooked vegetables',allergens:[] as string[],vegan:true},
      {name:'Oats with plain yogurt and fruit',allergens:['milk','dairy','lactose','wheat','gluten'],vegan:false},
      {name:'Rice with egg and vegetables',allergens:['egg','eggs'],vegan:false}];
    const allowed=examples.filter(e=>(profile.dietaryPattern!=='vegan'||e.vegan)&&!allergens.some(a=>e.allergens.includes(a))).map(e=>e.name);
    return response('Illustrative everyday food combinations to consider: '+allowed.join('; ')+'. These are app examples informed by general fueling/recovery education, not AIS recipes or a treatment diet. Check every actual ingredient, label and preparation for your listed allergies and cross-contact; no example is certified allergy-safe. Adapt ingredients to your cuisine and budget. No calorie or weight-loss target is set.'+(profile.age!==null&&profile.age<18?' For a young player, involve a parent/carer and a qualified dietitian for individual needs.':''),['ais-nutrition','ais-recipes']);
  }
  if(!profile.availableDays.length||!profile.timeSlots.trim()||profile.sessionMinutes===null)return response('Add available days, time slots and a 10–120 minute session length in Player Profile before drafting a week. A plan should fit those limits and leave room for recovery.',['bwf-footwork','ais-recovery']);
  // shortcut: one beginner session template; extend only with reviewed coaching templates.
  const minutes=Math.min(profile.sessionMinutes,30), warm=Math.min(5,Math.floor(minutes/3)),cool=warm,practice=minutes-warm-cool;
  const ordered=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].filter(d=>profile.availableDays.includes(d));
  const chosen=ordered.filter((day,index)=>{const gap=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].indexOf(day)-['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].indexOf(ordered[0]);return index===0||Math.min(gap,7-gap)>1;}).slice(0,2);
  return response('Draft for the available days '+chosen.join(' and ')+': '+minutes+' minutes per session ('+warm+' minutes comfortable warm-up, '+practice+' minutes gentle ready-position / split-step and return-to-base practice, '+cool+' minutes easy cool-down). Use only a listed time slot; the app does not book or assume a start time. '+(profile.courtAccess?'Use your available court.':'Without court access, use a clear, non-slip space for gentle shadow movement.')+' Keep other days for recovery or your usual activity; this draft is not an extra load prescription. Adapt it with a coach to your level and goals; stop if uncomfortable.'+(profile.age!==null&&profile.age<18?' A parent/carer and coach should supervise young players.':''),['bwf-footwork','ais-recovery']);
}
export function exactEvidence(question:string,context:ChatContext):ChatAnswer|null {
  if(!/\b(outcomes?|won|lost|wins?|losses|how many|duration|length|timestamps?|seconds?|pixels?|angles?|gap|boundar\w*|start|end)\b/i.test(question))return null;
  if(!context.facts.length)return response('Select a recording to look up its exact evidence.',[],'scope');
  const summary=JSON.parse(context.facts[0].text),windowId=/\b(?:rally|window)\s+(\d+)\b/i.exec(question),timestamp=/\b(\d+(?:\.\d+)?)\s*(?:s\b|seconds?)/i.exec(question);
  const facts=context.facts.slice(1).filter(s=>(!windowId||s.rallyId===Number(windowId[1]))&&(!timestamp||Math.abs((s.time??-1)-Number(timestamp[1]))<0.002));
  if(timestamp||/\b(pixels?|gap|angles?)\b/i.test(question)) {
    const specific=facts.filter(s=>s.id.startsWith('pose-')||s.id.startsWith('ending-')).slice(0,10);
    return {answer:specific.length?'Exact supplied image evidence (camera-dependent estimates; contact and physical distance remain unverified):\n'+specific.map(s=>s.title+': '+s.text).join('\n'):'No matching exact measurement is available. Check the selected recording and timestamp.',citations:specific.map(s=>s.id),sources:specific,mode:'evidence'};
  }
  const rallies=summary.rallies.filter((r:{id:number})=>!windowId||r.id===Number(windowId[1]));
  const answer='Selected recording length: '+summary.duration+' seconds. '+rallies.length+' completed or verified windows in this selection.\n'+rallies.map((r:{id:number;start:number;end:number;outcome:string;outcomeSource:string})=>`Window ${r.id}: ${r.start}–${r.end} s; ${r.outcome} (${r.outcomeSource}).`).join('\n')+'\nOutcomes are user markings. Contact, intent and the cause of a loss remain unverified.';
  return {answer,citations:['recording',...facts.filter(s=>s.id.startsWith('rally-')).map(s=>s.id)],sources:[context.facts[0],...facts.filter(s=>s.id.startsWith('rally-'))],mode:'evidence'};
}
export function validateGenerated(answer:unknown,sources:ChatSource[]):ChatAnswer {
  const result=answer as {answer:string;citations:string[]};
  if(!result||typeof result.answer!=='string'||!result.answer.trim()||result.answer.length>4000||!Array.isArray(result.citations)||!result.citations.length||result.citations.some(id=>typeof id!=='string'||!sources.some(s=>s.id===id)))throw new Error('Local answer failed citation checks. Retry.');
  // Medical, personal-plan and unsupported-impact output fails closed before display or history.
  if(medical.test(result.answer)||/\b(?:eat|drink|take|consume|increase|decrease|restrict|cut|skip|fast|medicines?|pills?|capsules?|cure|heal|fracture|rupture|ligament|insulin|ibuprofen|creatine|kratom)\b|\b(?:perform|do)\s+\d|\b(?:mg|kcal|calories|metres|meters)\b|\b(?:confirmed|proven|definite)\s+(?:impact|contact|cause)|\b(?:you should|you must|you need to|your injury|your disease)\b/i.test(result.answer))throw new Error('Local answer failed scope checks. Ask about recording evidence or use the checked food/schedule questions.');
  const cited=sources.filter(s=>result.citations.includes(s.id)).map(s=>s.text).join(' ');
  const numbers=(cited.match(/\b\d+(?:\.\d+)?\b/g)??[]).map(Number);
  if((result.answer.match(/\b\d+(?:\.\d+)?\b/g)??[]).some(n=>!numbers.includes(Number(n)))||/\b(because|caused|missed|late|fault|mistake)\b|contact (?:occurred|was made)|\b(?:proves|establishes)\b/i.test(result.answer))throw new Error('Local answer asserted an unsupported number or cause. Ask for exact evidence.');
  return {...result,sources:sources.filter(s=>result.citations.includes(s.id)),mode:'evidence'};
}
