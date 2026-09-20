import { describe, it, expect } from 'vitest';
import { parseReqReferences, planUnblockSweep, planCloseCascade, decideDependencyPromotion } from '../src/core/boot-sweep.js';
const labels = ['blocked:dependency', 'req:10', 'req:reddb-io/red-skills#10'];
describe('repository-qualified dependencies', () => {
  it('keeps equal issue numbers in different repositories distinct', () => {
    expect(parseReqReferences(labels)).toEqual([{n:10,label:'req:10'}, {n:10,repo:'reddb-io/red-skills',label:'req:reddb-io/red-skills#10'}]);
  });
  it('holds when the remote blocker is open or its lookup fails', async () => {
    for (const fail of [false,true]) {
      const plans = await planUnblockSweep([{number:20,body:'',labels}], async (_n, repo) => {
        if (repo && fail) throw new Error('unreachable');
        return repo ? 'OPEN' : 'CLOSED';
      });
      expect(plans).toEqual([]);
    }
  });
  it('removes both exact labels only after both blockers close', async () => {
    const [plan] = await planUnblockSweep([{number:20,body:'',labels}], async () => 'CLOSED');
    expect(plan.reqLabels).toEqual(labels.slice(1));
    expect(plan.refs).toEqual(['#10','reddb-io/red-skills#10']);
  });
  it('holds a local promotion when a qualified dependency was not resolved', () => {
    expect(decideDependencyPromotion({ number:20, labels, reqs:[{n:10,closed:true}] }).outcome).toBe('held');
  });
  it('does not let a local close cascade erase unresolved remote dependencies', () => {
    expect(planCloseCascade(10,[{number:20,labels,reqs:[{n:10,closed:true}]}])).toEqual([]);
  });
});
