import assert from 'node:assert/strict';
import {analogDistance,selectAnalogRows,historicalAnalogs,analogQueryArgs} from '../server/market_broker_analogs';

const anchor={keys:['a','b','c','d','e','f'],values:[50,50,60,48,51,20],scales:[25,25,25,20,20,20]};
const equal={...anchor,values:[50,50,60,48,51,20]};
const other={...anchor,values:[55,40,60,68,51,20]};
assert.equal(analogDistance(anchor,equal),0,'identical contemporaneous features match exactly');
assert.ok((analogDistance(anchor,other)??0)>0,'different features cannot have zero distance');
assert.equal(analogDistance(anchor,{...anchor,values:[null,null,60,null,null,null]}),null,'single available input cannot create false similarity');
const candidates=[
  {id:1,at:100000,distance:0.05},
  {id:2,at:100300,distance:0.04}, // picks this one; nearby event must be excluded
  {id:3,at:150000,distance:0.11},
  {id:4,at:160000,distance:3},    // dissimilar even if independent
  {id:5,at:200000,distance:0.25}
];
const selected=selectAnalogRows(candidates,36,14400,1.3);
assert.deepEqual(selected.map(x=>x.id),[2,3,5]);
assert.ok(selected.every((x,i)=>selected.slice(i+1).every(y=>Math.abs(x.at-y.at)>=14400)));
assert.deepEqual(analogQueryArgs('spot','BTC','SHORT','NO_TRADE',1,2),['BTC','SHORT','NO_TRADE',1,2]);
assert.deepEqual(analogQueryArgs('perps','BTC','SHORT','SHORT',1,2),['BTC','SHORT',1,2]);
const unsupported=await historicalAnalogs('INVALID_PAIR','perps');
assert.equal(unsupported.sourceStatus,'UNAVAILABLE');
assert.equal(unsupported.outcomes.length,0);
console.log('PASS: feature matching, minimum feature coverage, anti-duplicate spacing, distance threshold, unsupported source fail-close');
