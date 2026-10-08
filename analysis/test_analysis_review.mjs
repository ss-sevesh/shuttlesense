import assert from 'node:assert/strict';
import { nearestIndex, validInterval, parseReviews, reviewStorageKey, reviewReason, canonicalShot } from '../lib/analysis-review.ts';

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
