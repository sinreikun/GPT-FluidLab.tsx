import {DT,Engine} from './engine';
import {applyFrame,captureFrame,frameTransfers,type SimulationRequest,type SimulationResult} from './simulation-state';
export interface WorkerPort {postMessage(message:SimulationRequest,transfer:ArrayBuffer[]):void;terminate():void;onmessage:((event:MessageEvent<SimulationResult>)=>void)|null;onerror:((event:ErrorEvent)=>void)|null}
/** One outstanding batch, bounded backlog, and epoch checks keep edits authoritative. */
export class SimulationRunner {
  private pending=false;
  private synchronizedEpoch=-1;
  private accumulator=0;
  private wasRunning=false;
  private generation=0;
  private lastEpoch=-1;
  stepMilliseconds=0;
  completedSteps=0;
  backend:'worker'|'main'='main';
  constructor(private engine:Engine,private worker:WorkerPort|null){
    if(worker){this.backend='worker';worker.onmessage=event=>this.receive(event.data);worker.onerror=()=>this.fallback();}
  }
  private epoch(){return this.engine.editEpoch;}
  private receive(result:SimulationResult){
    this.pending=false;
    if(!this.wasRunning||result.epoch!==this.generation||this.lastEpoch!==this.epoch()){this.synchronizedEpoch=-1;return;}
    applyFrame(this.engine,result.state);this.completedSteps+=result.steps;this.stepMilliseconds=result.milliseconds/result.steps;
    this.accumulator=Math.max(0,this.accumulator-result.steps*DT);
  }
  advance(elapsed:number,speed:number,running:boolean){
    const epoch=this.epoch();if(epoch!==this.lastEpoch||running!==this.wasRunning){this.generation++;this.accumulator=0;this.synchronizedEpoch=-1;this.lastEpoch=epoch;}
    this.wasRunning=running;if(!running){this.accumulator=0;return;}
    this.accumulator=Math.min(2*DT,this.accumulator+Math.min(.1,elapsed)*speed);
    if(this.pending||this.accumulator<DT)return;
    const steps=Math.min(2,Math.floor(this.accumulator/DT));
    if(this.worker){
      const state=this.synchronizedEpoch===epoch?undefined:captureFrame(this.engine,true);
      const request:SimulationRequest={epoch:this.generation,steps,state};this.pending=true;this.synchronizedEpoch=epoch;
      try{this.worker.postMessage(request,state?frameTransfers(state):[]);}catch{this.fallback();}
    }else{
      const start=performance.now();let count=0;while(count<steps){this.engine.step();count++;if(performance.now()-start>=4)break;}
      this.stepMilliseconds=(performance.now()-start)/count;this.completedSteps+=count;this.accumulator=Math.max(0,this.accumulator-count*DT);
    }
  }
  /** Call synchronously before edits/pauses; an already queued Worker result must be discarded. */
  invalidate(){this.generation++;this.synchronizedEpoch=-1;this.accumulator=0;}
  private fallback(){this.invalidate();this.worker?.terminate();this.worker=null;this.pending=false;this.backend='main';}
  dispose(){this.invalidate();this.wasRunning=false;this.worker?.terminate();this.worker=null;}
}
