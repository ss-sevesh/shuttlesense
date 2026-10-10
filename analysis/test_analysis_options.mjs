import assert from 'node:assert/strict';
import { analysisOptions, defaultAnalysisOptions } from '../lib/analysis-options.ts';
assert.deepEqual(analysisOptions(undefined), defaultAnalysisOptions);
assert.equal(analysisOptions(undefined).llm, false);
for (const invalid of [null, [], {}, {...defaultAnalysisOptions,llm:true}, {...defaultAnalysisOptions,shuttle:false}, {...defaultAnalysisOptions,yolo:false,pose:true}, {...defaultAnalysisOptions,pose:'false'}, {...defaultAnalysisOptions,toString:true}, {...defaultAnalysisOptions,other:true}]) assert.throws(() => analysisOptions(invalid));
assert.equal(analysisOptions({...defaultAnalysisOptions,yolo:false,pose:false}).yolo, false);
assert.equal(analysisOptions({...defaultAnalysisOptions,ground:false,shuttle:false}).shuttle, false);
assert.equal(analysisOptions({...defaultAnalysisOptions,pose:true,shots:true,llm:true}).llm, true);
console.log('Analysis defaults, switches and dependency validation passed.');
