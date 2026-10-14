import { describe,it,expect } from 'vitest';
import { Engine, MATERIAL_IDS, MATERIALS, SIZE, W } from './engine';
const setup=()=>{const e=new Engine();e.conductivity.fill(0);return e;};
const amount=(e:Engine,m:number)=>{let sum=0;for(let i=0;i<SIZE;i++)sum+=e.chemistry.quantity(i,m);return sum;};
const energy=(e:Engine)=>{let sum=0;for(let i=0;i<SIZE;i++)sum+=e.chemistry.energy(i);return sum;};
const put=(e:Engine,x:number,y:number,parts:{material:number;amount:number}[],temp=20)=>{const i=e.index(x,y);e.chemistry.write(i,parts,temp);return i;};

describe('composition and chemistry',()=>{
  it('dissolves into full water cells and warmer water dissolves more',()=>{
    const run=(t:number)=>{const e=setup(),i=put(e,100,100,[{material:1,amount:1}],t);put(e,101,100,[{material:11,amount:1}],t);const before=energy(e);for(let n=0;n<30;n++)e.chemistry.step();expect(e.totalMass()).toBeCloseTo(2,5);expect(energy(e)).toBeCloseTo(before,3);return e.chemistry.quantity(i,11);};
    const cold=run(0),hot=run(80);expect(cold).toBeGreaterThan(0);expect(hot).toBeGreaterThan(cold*2);
  });
  it('mixes water/B and leaves oil and heavy C immiscible',()=>{
    const e=setup(),a=put(e,100,100,[{material:1,amount:1}],20),b=put(e,101,100,[{material:12,amount:1}],40);const before=energy(e);e.chemistry.step();expect(e.chemistry.quantity(a,12)).toBeGreaterThan(0);expect(e.chemistry.quantity(b,1)).toBeGreaterThan(0);expect(energy(e)).toBeCloseTo(before,3);
    for(const m of [2,14]){const t=setup(),i=put(t,100,100,[{material:1,amount:1}]);put(t,101,100,[{material:m,amount:1}]);t.chemistry.step();expect(t.chemistry.components(i)).toEqual([{material:1,amount:1}]);}
  });
  it('evaporates only B from a water/B mixture and conserves energy and mass',()=>{
    const e=setup(),i=put(e,100,100,[{material:1,amount:.5},{material:12,amount:.5}],90),before=energy(e);e.chemistry.phaseChanges();expect(amount(e,13)).toBeGreaterThan(0);expect(amount(e,7)).toBe(0);expect(amount(e,1)).toBeCloseTo(.5,5);expect(e.chemistry.quantity(i,12)).toBeLessThan(.5);expect(e.totalMass()).toBeCloseTo(1,5);expect(energy(e)).toBeCloseTo(before,3);
  });
  it('condenses B vapor and precipitates A after cooling',()=>{
    const e=setup();put(e,100,100,[{material:13,amount:1}],20);e.chemistry.phaseChanges();expect(amount(e,12)).toBeGreaterThan(0);expect(e.totalMass()).toBeCloseTo(1,5);
    const f=setup(),i=put(f,100,100,[{material:1,amount:.8},{material:11,amount:.2}],0);f.chemistry.step();expect(f.chemistry.quantity(i,11)).toBeLessThan(.2);expect(Array.from(f.cells).filter(m=>m===11).length).toBeGreaterThan(0);expect(f.totalMass()).toBeCloseTo(1,5);
  });
  it('reacts A 1 + D 1 into E 2 without requiring an apparatus',()=>{
    const e=setup(),i=put(e,100,100,[{material:1,amount:.8},{material:11,amount:.1},{material:15,amount:.1}],55);const before=energy(e);e.chemistry.step();const used=.1-amount(e,11);expect(used).toBeGreaterThan(0);expect(.1-amount(e,15)).toBeCloseTo(used,5);expect(amount(e,16)).toBeCloseTo(used*2,5);expect(amount(e,1)).toBeCloseTo(.8,5);expect(e.totalMass()).toBeCloseTo(1,5);expect(energy(e)).toBeCloseTo(before,3);expect(e.chemistry.components(i).length).toBeLessThanOrEqual(3);
  });
  it('waits when phase/reaction output is blocked and never discards components',()=>{
    const e=setup();e.terrain.fill(1);const i=e.index(100,100);e.terrain[i]=0;e.chemistry.write(i,[{material:1,amount:.8},{material:11,amount:.1},{material:15,amount:.1}],55);const before=e.chemistry.components(i);for(let n=0;n<5;n++)e.chemistry.step();expect(e.chemistry.components(i)).toEqual(before);
    e.chemistry.write(i,[{material:1,amount:.5},{material:12,amount:.5}],90);e.chemistry.phaseChanges();expect(amount(e,13)).toBe(0);expect(e.totalMass()).toBeCloseTo(1,5);
  });
  it('moves compositions with flow, rigid displacement and Undo',()=>{
    const e=setup(),i=put(e,100,100,[{material:1,amount:.7},{material:11,amount:.2},{material:15,amount:.1}]);e.checkpoint();const before=e.totalMass(),a=amount(e,11);e.step();expect(e.totalMass()).toBeCloseTo(before,5);e.undo();expect(e.chemistry.quantity(i,11)).toBeCloseTo(.2,5);
    e.add('rect',100.5,100.5,2,2);expect(e.totalMass()).toBeCloseTo(before,5);expect(amount(e,11)).toBeCloseTo(a,5);
  });
  it('rejects a fourth component without changing either cell',()=>{
    const e=setup(),i=put(e,100,100,[{material:12,amount:1}]),j=put(e,101,100,[{material:1,amount:.2},{material:11,amount:.2},{material:15,amount:.2}]);expect(e.chemistry.transfer(i,j,.1,12)).toBe(0);expect(e.totalMass()).toBeCloseTo(1.6,5);
  });
  it('powders fall and pile while fixed solids retain their shape',()=>{
    const e=setup();put(e,100,80,[{material:11,amount:1}]);put(e,200,80,[{material:6,amount:1}],420);for(let n=0;n<8;n++)e.step();expect(e.cells[e.index(100,80)]).toBe(0);expect(e.cells[e.index(200,80)]).toBe(6);expect(e.totalMass()).toBeCloseTo(2,5);
  });
});
describe('process devices and persistence',()=>{
  it('a pump transfers mixtures at its configured rate and stops at a full outlet',()=>{
    const e=setup(),p=e.add('pump',100.5,100.5)!;p.flowRate=6;const ports=e.devicePorts(p),i=put(e,ports.input.x,ports.input.y,[{material:1,amount:.7},{material:12,amount:.3}]);e.viscosity.fill(100);e.step();const j=e.index(ports.output.x,ports.output.y);expect(e.chemistry.mass(j)).toBeCloseTo(.1,5);expect(e.chemistry.quantity(j,12)).toBeCloseTo(.03,5);expect(p.deviceStatus).toBe('移送中');expect(e.totalMass()).toBeCloseTo(1,5);
    e.chemistry.write(j,[{material:1,amount:1}]);const before=e.totalMass();e.step();expect(p.deviceStatus).toContain('出口満杯');expect(e.totalMass()).toBeCloseTo(before,5);expect(e.chemistry.mass(i)).toBeGreaterThan(0);
  });
  it('a membrane extracts only its selected component',()=>{
    const e=setup(),p=e.add('membrane',100.5,100.5)!;p.filterMaterial=11;p.flowRate=6;const ports=e.devicePorts(p);put(e,ports.input.x,ports.input.y,[{material:1,amount:.8},{material:11,amount:.2}]);e.viscosity.fill(100);e.step();const j=e.index(ports.output.x,ports.output.y);expect(e.chemistry.quantity(j,11)).toBeCloseTo(.1,5);expect(e.chemistry.quantity(j,1)).toBe(0);expect(amount(e,1)).toBeCloseTo(.8,5);expect(e.totalMass()).toBeCloseTo(1,5);
  });
  it('a closed valve blocks cells and reopening removes the gate',()=>{
    const e=setup(),v=e.add('valve',100.5,100.5)!;v.enabled=false;e.rasterize();expect(e.occupancy[e.index(100,100)]).toBe(v.id);e.step();expect(v.deviceStatus).toBe('閉鎖');v.enabled=true;e.rasterize();expect(e.occupancy[e.index(100,100)]).toBe(0);
  });
  it('sealed motor displacement is cancelled without buffering or mass loss',()=>{
    const e=setup();e.terrain.fill(1);for(let x=50;x<56;x++)for(let y=90;y<110;y++){e.terrain[e.index(x,y)]=0;if(x>50)e.chemistry.write(e.index(x,y),[{material:1,amount:1}]);}
    const m=e.add('motor',50.5,100.5)!;m.mode='piston';m.strokeAngle=0;m.amp=10;m.speed=10;const body=e.add('rect',50.5,100,1,18)!;e.reparent(body.id,m.id);const before=e.totalMass(),trapped=e.trapped.length;e.step();expect(m.blocked).toBe(true);expect(m.t).toBe(0);expect(e.totalMass()).toBeCloseTo(before,5);expect(e.trapped.length).toBe(trapped);
  });
  it('loads v4, roundtrips v5 and resolves reordered stable material IDs',()=>{
    const e=setup();e.physicsDemo();const legacy:any=e.snapshot();legacy.version=4;delete legacy.materialIds;delete legacy.chemistry;legacy.viscosity=legacy.viscosity.slice(0,11);legacy.conductivity=legacy.conductivity.slice(0,11);const f=setup();expect(f.load(JSON.stringify(legacy))).toBe(true);expect(f.totalMass()).toBe(e.totalMass());
    put(f,200,100,[{material:1,amount:.6},{material:11,amount:.2},{material:15,amount:.2}],65);f.add('membrane',220,120);const saved=f.snapshot();const loaded=setup();expect(loaded.load(JSON.stringify(saved))).toBe(true);expect(loaded.snapshot()).toEqual(saved);
    const reordered=structuredClone(saved);const ids=[...MATERIAL_IDS];[ids[1],ids[12]]=[ids[12],ids[1]];reordered.materialIds=ids;const map=(m:number)=>m===1?12:m===12?1:m;reordered.cells=reordered.cells.map(map);reordered.chemistry!.secondary=reordered.chemistry!.secondary.map(map);reordered.chemistry!.tertiary=reordered.chemistry!.tertiary.map(map);reordered.viscosity=[...saved.viscosity];reordered.conductivity=[...saved.conductivity];[reordered.viscosity[1],reordered.viscosity[12]]=[reordered.viscosity[12],reordered.viscosity[1]];[reordered.conductivity[1],reordered.conductivity[12]]=[reordered.conductivity[12],reordered.conductivity[1]];for(const n of reordered.nodes)if(n.filterMaterial)n.filterMaterial=map(n.filterMaterial);expect(loaded.load(JSON.stringify(reordered))).toBe(true);expect(loaded.snapshot()).toEqual(saved);
  });
  it('atomically rejects invalid amounts and unknown material IDs',()=>{
    const e=setup();put(e,100,100,[{material:1,amount:.8},{material:11,amount:.2}]);const saved=e.snapshot(),before=e.snapshot();const bad=structuredClone(saved);bad.chemistry!.amount[e.index(100,100)]=1;expect(e.load(JSON.stringify(bad))).toBe(false);expect(e.snapshot()).toEqual(before);const unknown=structuredClone(saved);unknown.materialIds![1]='unknown';expect(e.load(JSON.stringify(unknown))).toBe(false);expect(e.snapshot()).toEqual(before);
  });
  it.each(['dissolve','distill','reaction'])('experiment %s is populated and conserves material',kind=>{
    const e=setup();e.experiment(kind);const before=e.totalMass();expect(e.experimentTitle).not.toBe('');expect(e.nodes.length).toBeGreaterThan(0);for(let n=0;n<30;n++)e.step();expect(e.totalMass()).toBeCloseTo(before,2);expect(Array.from(e.temperature).every(Number.isFinite)).toBe(true);expect(e.snapshot().version).toBe(7);
  });
});

describe('complete experimental workflows',()=>{
  it('actually recovers condensed B in the right tank of the distillation demo',()=>{
    const e=new Engine();e.experiment('distill');const before=e.totalMass(),pump=e.nodes.find(n=>n.kind==='pump')!;let transportedVapor=false;const input=e.devicePorts(pump).input;for(let n=0;n<360;n++){const material=e.cells[e.index(input.x,input.y)],transported=pump.transported??0;e.step();if(material===13&&(pump.transported??0)>transported)transportedVapor=true;}
    let recovered=0;for(let y=114;y<190;y++)for(let x=216;x<287;x++)recovered+=e.chemistry.quantity(e.index(x,y),12);
    expect(transportedVapor).toBe(true);expect(recovered).toBeGreaterThan(.001);expect(e.nodes.find(n=>n.kind==='pump')!.transported).toBeGreaterThan(0);expect(e.totalMass()).toBeCloseTo(before,2);
  },30000);
  it('actually recovers E through the selected membrane in the reaction demo',()=>{
    const e=new Engine();e.experiment('reaction');const before=e.totalMass();for(let n=0;n<160;n++)e.step();
    let recovered=0;for(let y=110;y<190;y++)for(let x=237;x<287;x++)recovered+=e.chemistry.quantity(e.index(x,y),16);
    expect(recovered).toBeGreaterThan(.001);expect(e.nodes.find(n=>n.kind==='membrane')!.transported).toBeGreaterThan(0);expect(e.totalMass()).toBeCloseTo(before,2);
  },20000);
});

describe('editing and transport boundaries',()=>{
  it('clears composition on erasing, overwriting and fixed-wall placement',()=>{
    for(const mode of ['erase','overwrite','wall']){
      const e=setup(),i=put(e,100,100,[{material:1,amount:.7},{material:11,amount:.2},{material:15,amount:.1}]);
      if(mode==='erase')e.paint(100,100,1,1,false,true);else if(mode==='overwrite')e.paint(100,100,1,3,true);else e.terrainShape(100,100,100,100,1);
      expect(e.chemistry.secondary[i]).toBe(0);expect(e.chemistry.tertiary[i]).toBe(0);const restored=setup();expect(restored.load(JSON.stringify(e.snapshot()))).toBe(true);
    }
  });
  it('keeps buffered mixtures and their heat through save/restore and recovery',()=>{
    const e=setup();e.terrain.fill(1);const i=e.index(100,100);e.terrain[i]=0;e.chemistry.write(i,[{material:1,amount:.6},{material:11,amount:.3},{material:15,amount:.1}],45);e.add('rect',100.5,100.5,1,1);
    expect(e.trapped).toHaveLength(1);expect(e.totalMass()).toBeCloseTo(1,5);const loaded=setup();expect(loaded.load(JSON.stringify(e.snapshot()))).toBe(true);loaded.terrain[loaded.index(101,100)]=0;loaded.rasterize();expect(loaded.trapped).toHaveLength(0);expect(loaded.chemistry.quantity(loaded.index(101,100),11)).toBeCloseTo(.3,5);expect(loaded.temperature[loaded.index(101,100)]).toBe(45);
  });
  it('normal pumps reject solids and report zero rate',()=>{
    const e=setup(),p=e.add('pump',100.5,100.5)!,ports=e.devicePorts(p);put(e,ports.input.x,ports.input.y,[{material:6,amount:1}],420);e.step();expect(p.deviceStatus).toBe('固体は移送不可');expect(p.transported).toBe(0);p.flowRate=0;e.step();expect(p.deviceStatus).toBe('流量0');
  });
  it('uses mixture properties and preserves concentration when a partial cell falls',()=>{
    const e=setup(),i=put(e,100,100,[{material:1,amount:.3},{material:12,amount:.2}],20);expect(e.chemistry.density(i)).toBeCloseTo(3.6,5);expect(e.chemistry.viscosity(i)).toBeCloseTo(7.2,5);const before=e.totalMass();e.step();expect(e.totalMass()).toBeCloseTo(before,5);expect(amount(e,1)).toBeCloseTo(.3,5);expect(amount(e,12)).toBeCloseTo(.2,5);
  });
});
