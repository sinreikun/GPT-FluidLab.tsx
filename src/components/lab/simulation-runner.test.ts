import {describe,it,expect,vi} from 'vitest';
import {Engine,DT} from './engine';
import {SimulationRunner,type WorkerPort} from './simulation-runner';
import {applyFrame,captureFrame,type SimulationRequest} from './simulation-state';
class FakeWorker implements WorkerPort{
  requests:SimulationRequest[]=[];
  onmessage:WorkerPort['onmessage']=null;onerror:WorkerPort['onerror']=null;
  terminate=vi.fn();postMessage(request:SimulationRequest){this.requests.push(request);}
  reply(e:Engine,index=this.requests.length-1){const request=this.requests[index];this.onmessage?.({data:{epoch:request.epoch,steps:1,milliseconds:40,state:captureFrame(e)}} as MessageEvent);}
}
describe('CPU simulation scheduling',()=>{
  it('keeps one outstanding request and limits backlog to two steps',()=>{const e=new Engine(),w=new FakeWorker(),r=new SimulationRunner(e,w);r.advance(10,3,true);for(let i=0;i<50;i++)r.advance(.1,3,true);expect(w.requests).toHaveLength(1);expect(w.requests[0].steps).toBe(2);const simulated=new Engine();applyFrame(simulated,w.requests[0].state!);simulated.step();w.reply(simulated);expect(e.tick).toBe(1);r.advance(DT,1,true);expect(w.requests).toHaveLength(2);expect(w.requests[1].steps).toBeLessThanOrEqual(2);expect(w.requests[1].state).toBeUndefined();r.dispose();expect(w.terminate).toHaveBeenCalledOnce();});
  it('discards results after an edit, pause or immediate invalidation and resynchronizes',()=>{for(const action of ['edit','pause','invalidate']){const e=new Engine(),w=new FakeWorker(),r=new SimulationRunner(e,w);r.advance(DT,1,true);const simulated=new Engine();applyFrame(simulated,w.requests[0].state!);simulated.step();if(action==='edit'){e.checkpoint();e.cells[100]=3;}else if(action==='pause')r.advance(0,1,false);else r.invalidate();w.reply(simulated);expect(e.tick).toBe(0);if(action==='edit')expect(e.cells[100]).toBe(3);r.advance(DT,1,true);expect(w.requests[1].state).toBeDefined();}});
  it('preserves mixtures, runtime and editable node identities across transport',()=>{const e=new Engine();e.demo();e.step();const node=e.nodes[0],f=new Engine();applyFrame(f,captureFrame(e,true));for(let i=0;i<3;i++){e.step();f.step();}expect(f.snapshot()).toEqual(e.snapshot());applyFrame(e,captureFrame(f));expect(e.nodes[0]).toBe(node);});
  it('falls back to bounded CPU work after Worker failure',()=>{const e=new Engine(),w=new FakeWorker(),r=new SimulationRunner(e,w);r.advance(DT,1,true);const stale=new Engine();applyFrame(stale,w.requests[0].state!);stale.step();w.onerror?.({} as ErrorEvent);w.reply(stale);expect(e.tick).toBe(0);expect(r.backend).toBe('main');r.advance(10,3,true);expect(e.tick).toBeGreaterThan(0);expect(e.tick).toBeLessThanOrEqual(2);});
});
