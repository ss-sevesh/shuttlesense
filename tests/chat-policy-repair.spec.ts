import {test,expect} from '@playwright/test';
import {checkedGuidance,exactEvidence,endingEvidence,savedProfileAnswer,validateGenerated} from '../lib/chat-policy';
import {referenceSources,type ChatContext} from '../lib/chat-context';
import {emptyProfile} from '../lib/player-profile';

const noRecording:ChatContext={analysisId:'coach',evidenceHash:'test',reportEvidenceHash:'test',hasReport:false,sources:[],facts:[]};
test('general technique questions avoid recording lookup and weekly templates',()=>{
  for(const question of ['How do I start moving for a net shot?','Why did I lose?', 'What is the difference between a clear and a drop?'])expect(exactEvidence(question,noRecording)).toBeNull();
  for(const question of ['Explain a split-step drill','How do I practice grip changes?','What is the recovery phase in training?'])expect(checkedGuidance(question,emptyProfile)).toBeNull();
  expect(checkedGuidance('Draft a weekly practice schedule',emptyProfile)?.answer).toContain('available days');
  expect(exactEvidence('What is the duration of this recording?',noRecording)?.answer).toContain('Select a recording');
});
test('ending explanations select original same-frame evidence without inventing a cause or outcome',()=>{
  const facts=[
    {id:'recording',kind:'original_evidence',title:'Recording',text:'{}'},
    {id:'rally-3',kind:'original_evidence',title:'First window',rallyId:3,time:29.433,text:JSON.stringify({outcome:'lost',outcomeSource:'user_marked'})},
    {id:'rally-5',kind:'original_evidence',title:'Second window',rallyId:5,time:58.233,text:JSON.stringify({outcome:'unknown',outcomeSource:'unmarked'})},
    {id:'ending-3',kind:'original_evidence',title:'Ending',rallyId:3,time:39.467,text:JSON.stringify({frame:1184,pose:'Arm at torso level (left wrist proxy)'})},
    {id:'pose-3-1184',kind:'original_evidence',title:'Pose',rallyId:3,time:39.467,text:JSON.stringify({frame:1184,shuttle:{status:'tracked_image_estimate',time:39.467,horizontal:'camera-left of player box',vertical:'within player box height',wristGapPx:48.1}})},
    {id:'pose-3-100',kind:'original_evidence',title:'Earlier pose',rallyId:3,time:30,text:JSON.stringify({frame:100,shuttle:{wristGapPx:999}})},
  ];
  const context={...noRecording,facts,sources:facts},answer=endingEvidence('Why did I lose the first rally? What does the evidence show?',context)!;
  expect(answer.answer).toContain('Window 3: lost (user marked)');expect(answer.answer).toContain('48.1 pixels');expect(answer.answer).toContain('remain unverified');expect(answer.answer).not.toContain('999');expect(answer.citations).toEqual(['rally-3','ending-3','pose-3-1184']);
  expect(endingEvidence('Explain the ending in the second rally',context)?.answer).toContain('unknown');
  expect(endingEvidence('Explain the ending',context)?.answer).toContain('Choose');
  expect(exactEvidence('Show the exact ending image gap at 39.467 seconds.',context)?.answer).toContain('48.1');
  expect(endingEvidence('What is a split step?',context)).toBeNull();
  for(const shuttle of [{status:'unavailable',wristGapPx:null},{status:'tracked_image_estimate',time:39.467,horizontal:'camera-left',vertical:'within player box height',wristGapPx:null}]){
    const missing={...context,facts:facts.map(s=>s.id==='pose-3-1184'?{...s,text:JSON.stringify({frame:1184,shuttle})}:s)};
    const answer=endingEvidence('Explain the first rally ending',missing)!.answer;
    expect(answer).toContain('unavailable');expect(answer).not.toContain('null pixels');expect(answer).not.toContain('undefined');
  }
});
test('saved profile recall and schedule followups use stored details without a new questionnaire',()=>{
  const profile={...emptyProfile,level:'intermediate',goals:'Improve backhand consistency',availableDays:['Monday','Thursday'],timeSlots:'18:00',sessionMinutes:25};
  expect(savedProfileAnswer('What is my badminton level and what days can I play?',profile)?.answer).toBe('Level: intermediate. Available days: Monday, Thursday.');
  expect(savedProfileAnswer('What goal did I save in my profile?',profile)?.answer).toBe('Goal: Improve backhand consistency.');
  expect(savedProfileAnswer('What are my goals?',profile)?.answer).toContain('backhand');
  expect(savedProfileAnswer('Explain how to improve my level',profile)).toBeNull();
  const full=checkedGuidance('Make a weekly schedule',profile)!,brief=checkedGuidance('Make a weekly schedule. Make that shorter',profile)!;
  expect(brief.answer).toContain('backhand');expect(brief.answer).toContain('Monday and Thursday');expect(brief.answer.length).toBeLessThan(full.answer.length);
});
test('ordinary reference explanations pass while invented numbers and impact causes fail',()=>{
  const citations=['bwf-footwork'];
  expect(validateGenerated({answer:'You need to return to a ready position because it prepares the next movement.',citations},referenceSources).answer).toContain('ready position');
  expect(validateGenerated({answer:'1. Ready position.\n2. Split steps.',citations},referenceSources).answer).toContain('Split steps');
  expect(()=>validateGenerated({answer:'Repeat for 99 seconds.',citations},referenceSources)).toThrow('number');
  expect(()=>validateGenerated({answer:'Contact was made.',citations},referenceSources)).toThrow();
  const evidence=[{id:'rally-1',kind:'original_evidence',title:'Rally',text:'User marked lost.'}];
  expect(()=>validateGenerated({answer:'You lost because you were late.',citations:['rally-1']},evidence)).toThrow('cause');
  expect(()=>validateGenerated({answer:'Take medication.',citations},referenceSources)).toThrow('scope');
  expect(()=>validateGenerated({answer:'You should do split-step practice every day.',citations},referenceSources)).toThrow('scope');
  expect(()=>validateGenerated({answer:'You lost because you were late.',citations},referenceSources)).toThrow('cause');
  for(const answer of ['Your late recovery caused the loss.','You missed the shuttle due to late positioning.'])expect(()=>validateGenerated({answer,citations},referenceSources)).toThrow('cause');
  expect(validateGenerated({answer:'A split step helps because your feet are ready to move.',citations},referenceSources).answer).toContain('ready');
});
