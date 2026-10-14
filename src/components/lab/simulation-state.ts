import {Engine, type LabNode, type Trapped} from './engine';

/** Typed-array transport avoids JSON and boxed per-cell snapshot arrays. */
export interface SimulationFrame {
  flame:Uint8Array; cells:Uint8Array; temperature:Float32Array; occupancy:Int32Array; terrain?:Uint8Array;
  amount:Float32Array; secondary:Uint8Array; secondaryAmount:Float32Array; tertiary:Uint8Array; tertiaryAmount:Float32Array;
  nextId:number; experimentTitle:string; experimentDescription:string;
  nodes:LabNode[]; trapped:Trapped[]; viscosity:number[]; conductivity:number[];
  runtime:ReturnType<Engine['runtimeState']>;
}
export function captureFrame(e:Engine,terrain=false):SimulationFrame{
  return {flame:e.chemistry.flame.slice(),cells:e.cells.slice(),temperature:e.temperature.slice(),occupancy:e.occupancy.slice(),terrain:terrain?e.terrain.slice():undefined,
    amount:e.chemistry.amount.slice(),secondary:e.chemistry.secondary.slice(),secondaryAmount:e.chemistry.secondaryAmount.slice(),tertiary:e.chemistry.tertiary.slice(),tertiaryAmount:e.chemistry.tertiaryAmount.slice(),
    nextId:e.nextId,experimentTitle:e.experimentTitle,experimentDescription:e.experimentDescription,nodes:structuredClone(e.nodes),trapped:structuredClone(e.trapped),viscosity:[...e.viscosity],conductivity:[...e.conductivity],runtime:e.runtimeState()};
}
export function frameTransfers(f:SimulationFrame):ArrayBuffer[]{return [f.flame,f.cells,f.temperature,f.occupancy,f.terrain,f.amount,f.secondary,f.secondaryAmount,f.tertiary,f.tertiaryAmount].filter((a):a is Uint8Array|Float32Array|Int32Array=>!!a).map(a=>a.buffer as ArrayBuffer);}
export function applyFrame(e:Engine,f:SimulationFrame){
  e.chemistry.flame=f.flame;e.cells=f.cells;e.temperature=f.temperature;e.occupancy=f.occupancy;if(f.terrain)e.terrain=f.terrain;
  e.chemistry.amount=f.amount;e.chemistry.secondary=f.secondary;e.chemistry.secondaryAmount=f.secondaryAmount;e.chemistry.tertiary=f.tertiary;e.chemistry.tertiaryAmount=f.tertiaryAmount;
  // Keep property-panel node references valid between React refreshes.
  const existing=new Map(e.nodes.map(n=>[n.id,n]));e.nodes=f.nodes.map(n=>{const old=existing.get(n.id);if(!old)return n;for(const key of Object.keys(old))if(!(key in n))delete (old as unknown as Record<string,unknown>)[key];return Object.assign(old,n);});
  e.nextId=f.nextId;e.experimentTitle=f.experimentTitle;e.experimentDescription=f.experimentDescription;
  e.trapped=f.trapped;e.viscosity=f.viscosity;e.conductivity=f.conductivity;e.restoreRuntime(f.runtime);
}
export interface SimulationRequest {epoch:number;steps:number;state?:SimulationFrame}
export interface SimulationResult {epoch:number;steps:number;milliseconds:number;state:SimulationFrame}
