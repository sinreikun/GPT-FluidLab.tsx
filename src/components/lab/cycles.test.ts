import {describe,it,expect} from 'vitest';
import {Engine,SIZE} from './engine';
import {runProcesses} from './processes';
import {captureFrame,applyFrame} from './simulation-state';
const energy=(e:Engine)=>{let sum=0;for(let i=0;i<SIZE;i++)sum+=e.chemistry.energy(i);return sum;};
const quantity=(e:Engine,m:number)=>{let sum=0;for(let i=0;i<SIZE;i++)sum+=e.chemistry.quantity(i,m);return sum;};
describe('closed cycles',()=>{
  it('resynchronizes all three cycles after reusing IDs from a joint scene without retaining old pivots',()=>{const main=new Engine(),worker=new Engine();main.demo();applyFrame(worker,captureFrame(main,true));main.experiment('cycles');applyFrame(worker,captureFrame(main,true));expect(worker.snapshot()).toEqual(main.snapshot());const mass=worker.totalMass();for(let i=0;i<200;i++)worker.step();for(const n of worker.nodes)expect(n.transported??0).toBeGreaterThan(1);expect(worker.totalMass()).toBeCloseTo(mass,4);});

  it.each(['hydrogen-cycle','crystal-cycle','extraction-cycle'])('runs %s for multiple passes without new material',kind=>{
    const e=new Engine();e.experiment(kind);e.conductivity.fill(0);const mass=e.totalMass(),initialEnergy=energy(e);
    for(let i=0;i<360;i++)e.step();
    expect(e.totalMass()).toBeCloseTo(mass,4);for(const n of e.nodes)expect(n.transported??0).toBeGreaterThan(2);
    const supplied=e.nodes.reduce((s,n)=>s+(n.energyUsed??0),0),removed=e.nodes.reduce((s,n)=>s+(n.heatRemoved??0),0);expect(energy(e)).toBeCloseTo(initialEnergy+supplied-removed,1);
    const save=e.snapshot(),restored=new Engine();expect(restored.load(JSON.stringify(save))).toBe(true);expect(restored.snapshot()).toEqual(save);
  });
  it('blocks all electrolysis consumption if either gas output is full, and stops without power',()=>{
    const e=new Engine();e.experiment('hydrogen-cycle');const el=e.nodes.find(n=>n.process==='electrolysis')!;const oxygen=e.index(195.5,81.5);e.chemistry.write(oxygen,[{material:17,amount:1}]);const water=quantity(e,1);runProcesses(e,1/60,e.poses());expect(quantity(e,1)).toBe(water);expect(el.transported).toBe(0);e.chemistry.write(oxygen,[]);el.power=0;runProcesses(e,1/60,e.poses());expect(el.transported).toBe(0);
  });
  it('preserves carrier and water across extraction and recovery, and limits fourth-component outputs',()=>{
    const e=new Engine();e.experiment('extraction-cycle');e.conductivity.fill(0);const carrier=quantity(e,14),water=quantity(e,1),salt=quantity(e,11);for(let i=0;i<100;i++)e.step();expect(quantity(e,14)).toBeCloseTo(carrier,5);expect(quantity(e,1)).toBeCloseTo(water,5);expect(quantity(e,11)).toBeCloseTo(salt,5);
    const i=e.index(105.5,185.5);e.chemistry.write(i,[{material:1,amount:.7},{material:12,amount:.1},{material:15,amount:.1}]);const before=e.totalMass(),recovery=e.nodes.find(n=>n.process==='recovery')!;runProcesses(e,1/60,e.poses());expect(e.totalMass()).toBeCloseTo(before,5);expect(recovery.deviceStatus).not.toBe('処理中');
  });
});
describe('finite oxygen and burning',()=>{
  it('needs oxygen, conserves mass and chemical energy, and stops after depletion',()=>{
    const e=new Engine(),i=e.index(100,100),o=i+1;e.chemistry.write(i,[{material:9,amount:.1}],600);e.chemistry.step();expect(quantity(e,7)).toBe(0);e.chemistry.write(o,[{material:17,amount:.4}]);const mass=e.totalMass(),before=energy(e);for(let n=0;n<15;n++)e.chemistry.step();expect(quantity(e,7)).toBeGreaterThan(0);expect(quantity(e,9)).toBeCloseTo(.05,4);expect(quantity(e,17)).toBeLessThan(1e-6);expect(e.totalMass()).toBeCloseTo(mass,5);expect(energy(e)).toBeCloseTo(before,2);
  });
  it('uses finite oxygen in painted air and leaves nitrogen behind',()=>{const e=new Engine();e.paint(100,100,.1,0);expect(quantity(e,17)).toBeCloseTo(.23,5);expect(quantity(e,19)).toBeCloseTo(.77,5);expect(e.totalMass()).toBeCloseTo(1,5);});
  it('produces carbon dioxide in complete combustion, soot in incomplete combustion, and burns soot again',()=>{
    for(const [oxygen,product] of [[1,18],[.1,8]]){const e=new Engine(),i=e.index(100,100);e.chemistry.write(i,[{material:2,amount:.2}],600);e.chemistry.write(i+1,[{material:17,amount:oxygen}]);const mass=e.totalMass(),before=energy(e);e.chemistry.step();expect(quantity(e,product)).toBeGreaterThan(0);expect(e.totalMass()).toBeCloseTo(mass,5);expect(energy(e)).toBeCloseTo(before,2);}
    const e=new Engine(),i=e.index(100,100);e.chemistry.write(i,[{material:8,amount:.2}],700);e.chemistry.write(i+1,[{material:17,amount:1}]);e.chemistry.step();expect(quantity(e,18)).toBeGreaterThan(0);
  });
});
