import { test, expect } from '@playwright/test';
import { movementHeatmap, type ReviewPerson } from '../lib/analysis-review';

test('live heat uses elapsed samples only and rebuilds correctly after rewind', () => {
  const person = (side: 'near' | 'far', court: [number,number]) => ({side,court} as ReviewPerson);
  const data = {poseSampleHz:2,duration:2,samples:[
    {time:0,people:[person('near',[0,0]),person('far',[1,1])]},
    {time:.5,people:[person('near',[1,1])]},
    {time:1,people:[person('near',[-1,.5])]},
    {time:1.5,people:[person('near',[.5,.5])]},
  ]};
  expect(movementHeatmap(data,'near',0).seconds).toBe(0);
  const partial = movementHeatmap(data,'near',.25);
  expect(partial.seconds).toBe(.25); expect(partial.grid[0][0]).toBe(.25);
  expect(partial.grid[7][5]).toBe(0);
  const forward = movementHeatmap(data,'near',1.75);
  expect(forward.seconds).toBe(1.25); expect(forward.grid[7][5]).toBe(.5);
  expect(movementHeatmap(data,'near',.25)).toEqual(partial);
  expect(movementHeatmap(data,'near',1.75)).toEqual(forward);
  expect(movementHeatmap(data,'near',10).seconds).toBe(1.5);
  expect(movementHeatmap(data,'far',1.75).seconds).toBe(.5);
});
