import assert from 'node:assert/strict';
import { nearestIndex, validInterval, parseReviews, reviewStorageKey, reviewReason, canonicalShot, isReviewData } from '../lib/analysis-review.ts';

assert.equal(nearestIndex([], 0, .1), -1);
assert.equal(nearestIndex([{time:0},{time:1}], .95, .1), 1);
assert.equal(nearestIndex([{time:0},{time:1}], .5, .1), -1);
assert.equal(validInterval(1,2,3), true);
for (const [start,end] of [[2,1],[-1,2],[1,4],[NaN,2]]) assert.equal(validInterval(start,end,3), false);
const data = {duration:3,shots:[{id:1}],rallies:[{id:1}],analysisSha256:'a'.repeat(64)};
assert.deepEqual(parseReviews('{broken',data),{shots:{},rallies:{}});
const restored = parseReviews(JSON.stringify({shots:{1:{label:'netshot',reviewedAt:'today'}},rallies:{1:{start:2,end:1,reviewedAt:'today'}}}),data);
assert.equal(restored.shots[1].label,'net shot');
assert.deepEqual(restored.rallies,{});
assert.notEqual(reviewStorageKey(data),reviewStorageKey({...data,analysisSha256:'b'.repeat(64)}));
assert.equal(canonicalShot('long_serve'),'long serve');
assert.match(reviewReason('Model score was below acceptance threshold.'),/score.*threshold/);
assert.match(reviewReason('Model predicted an unknown shot class.'),/unknown shot class/);
assert.match(reviewReason('The predicted player side did not match the contact.'),/player side/);
console.log('Review synchronization, interval validation, reasons and stored corrections passed.');
const contact = {method:'wrist_distance',status:'estimated',frame:5,seedFrame:4,wrist:'left',distancePx:3,distanceHeights:.03,windowFrames:[0,10],frames:[3,4,5,6,7],measurements:{elbow:150,armExtension:150,bodyLean:30,armElevation:90,racketFace:null}};
const report = {videoSha256:'a'.repeat(64),analysisSha256:'b'.repeat(64),fileName:'test.mp4',duration:1,width:32,height:32,fps:30,poseSampleHz:30,samples:[],shuttle:[],shots:[{contact}],rallies:[],limitations:[],metrics:{}};
assert.equal(isReviewData({...report,options:{yolo:true,shuttle:true,ground:true,pose:false,shots:false,llm:false}}),true);
assert.equal(isReviewData({...report,options:{yolo:true,shuttle:false,ground:true,pose:false,shots:false,llm:false}}),false);
assert.equal(isReviewData(report),true);
assert.equal(isReviewData({...report,shots:[{}]}),true); // Saved legacy reports remain readable.
for (const invalid of [{...contact,frame:NaN},{...contact,frames:[3,4,9,6,7]},{...contact,measurements:{...contact.measurements,elbow:Infinity}},{...contact,status:'identity_switch'}]) {
  assert.equal(isReviewData({...report,shots:[{contact:invalid}]}),false);
}
assert.equal(isReviewData({...report,shots:[null]}),false);
const hitPose = {frame:5,time:5/30,trackId:1,status:'estimated_contact',pose:'Raised arm',reason:'estimated',measurements:{elbow:120,bodyLean:null}};
const courtLines = {method:'white_fit',reason:'Verify',segments:[{start:0,end:1,lines:[{name:'Singles left',points:[[.1,.5],[.1,.9]],support:.9}]}]};
assert.equal(isReviewData({...report,hitPoses:[hitPose],courtLines}),true);
for (const bad of [{frame:100},{time:.9},{status:'confirmed_hit'},{measurements:{elbow:Infinity,bodyLean:0}}]) assert.equal(isReviewData({...report,hitPoses:[{...hitPose,...bad}]}),false);
assert.equal(isReviewData({...report,courtLines:{...courtLines,segments:[{start:0,end:4,lines:[]}]}}),false);
const ground = {status:'experimental',model:'segformer',revision:'pinned',reason:'Needs review',candidates:[{frame:5,time:5/30,point:[10,10],status:'possible_landing',holdFrames:6,floorScore:.8}]};
assert.equal(isReviewData({...report,groundLanding:ground}),true);
assert.equal(isReviewData({...report,groundLanding:{...ground,status:'unavailable',candidates:[]}}),true);
for (const bad of [{frame:-1},{time:NaN},{point:[33,10]},{floorScore:2},{holdFrames:0},{status:'confirmed'}]) {
  assert.equal(isReviewData({...report,groundLanding:{...ground,candidates:[{...ground.candidates[0],...bad}]}}),false);
}
assert.equal(isReviewData({...report,groundLanding:null}),false);
assert.equal(isReviewData({...report,shots:[{contact,coaching:{status:'experimental',answer:{shotType:'smash',visibleEvidence:{},uncertainty:'unknown',coaching:'Practice'}}}]}),false);
