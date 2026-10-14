import {Engine} from './engine';
import {applyFrame,captureFrame,frameTransfers,type SimulationRequest,type SimulationResult} from './simulation-state';
const engine=new Engine();
self.onmessage=(event:MessageEvent<SimulationRequest>)=>{
  const request=event.data;if(request.state)applyFrame(engine,request.state);
  const start=performance.now();let steps=0;
  // A single step may be expensive; it runs off the UI thread. Never accumulate a large batch.
  while(steps<Math.min(2,request.steps)){engine.step();steps++;if(performance.now()-start>=8)break;}
  const result:SimulationResult={epoch:request.epoch,steps,milliseconds:performance.now()-start,state:captureFrame(engine)};
  self.postMessage(result,{transfer:frameTransfers(result.state)});
};
