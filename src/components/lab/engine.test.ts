import { describe, expect, it } from 'vitest';
import { Engine, W, H, SIZE, DT } from './engine';
const particles=(e:Engine)=>e.count();
const averageY=(e:Engine,m:number)=>{let sum=0,count=0;for(let i=0;i<SIZE;i++)if(e.cells[i]===m){sum+=Math.floor(i/W);count++;}return count?sum/count:0;};
function basin(e:Engine){e.terrainShape(80,80,82,200,1);e.terrainShape(120,80,122,200,1);e.terrainShape(80,198,122,200,1);}
function fill(e:Engine,x0:number,y0:number,x1:number,y1:number,m:number,temp=20){for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=e.index(x,y);e.cells[i]=m;e.temperature[i]=temp;}}
describe('cell fluid simulation',()=>{
  it('water sinks through oil, mercury sinks through water, and conserves particles',()=>{
    const e=new Engine();basin(e);fill(e,83,160,120,173,3);fill(e,83,173,120,185,1);fill(e,83,185,120,198,2);
    const count=particles(e);for(let i=0;i<130;i++)e.step();
    expect(averageY(e,3)).toBeGreaterThan(averageY(e,1));expect(averageY(e,1)).toBeGreaterThan(averageY(e,2));expect(particles(e)).toBe(count);
  });
  it('gas rises while viscosity 100 freezes solids',()=>{
    const e=new Engine();fill(e,100,140,110,150,9);fill(e,200,100,205,105,6,420);
    const rock=Array.from(e.cells).map((m,i)=>m===6?i:-1).filter(i=>i>=0);
    for(let i=0;i<25;i++)e.step();expect(averageY(e,9)).toBeLessThan(110);for(const i of rock)expect(e.cells[i]).toBe(6);
  });
  it('phase hysteresis and conserved heat exchange',()=>{
    const e=new Engine();e.conductivity.fill(0);
    const i=e.index(100,100);e.cells[i]=1;e.temperature[i]=101;e.viscosity.fill(100);e.step();expect(e.cells[i]).toBe(7);expect(e.temperature[i]).toBe(101);
    e.temperature[i]=97;e.step();expect(e.cells[i]).toBe(7);e.temperature[i]=94;e.step();expect(e.cells[i]).toBe(1);
    e.temperature[i]=-1;e.step();expect(e.cells[i]).toBe(4);e.temperature[i]=.5;e.step();expect(e.cells[i]).toBe(4);e.temperature[i]=2;e.step();expect(e.cells[i]).toBe(1);
    e.cells[i]=3;e.temperature[i]=358;e.step();expect(e.cells[i]).toBe(10);e.temperature[i]=341;e.step();expect(e.cells[i]).toBe(10);e.temperature[i]=339;e.step();expect(e.cells[i]).toBe(3);
    e.cells[i]=5;e.temperature[i]=699;e.step();expect(e.cells[i]).toBe(6);e.temperature[i]=850;e.step();expect(e.cells[i]).toBe(6);e.temperature[i]=901;e.step();expect(e.cells[i]).toBe(5);
    e.cells[i]=2;e.temperature[i]=301;e.step();expect(e.cells[i]).toBe(8);
    const heat=new Engine();heat.cells.fill(1);heat.temperature.fill(20);heat.temperature[i]=80;heat.viscosity[1]=100;
    const energy=heat.temperature.reduce((a,b)=>a+b,0);heat.step();expect(heat.temperature[i]).toBeLessThan(80);expect(heat.temperature[i+1]).toBeGreaterThan(20);expect(heat.temperature.reduce((a,b)=>a+b,0)).toBeCloseTo(energy,1);
  });
  it('guides pass liquid while walls block it',()=>{
    const e=new Engine();e.terrainShape(100,102,110,102,2);fill(e,101,100,105,102,1);for(let i=0;i<4;i++)e.step();expect(averageY(e,1)).toBeGreaterThan(102);
    const wall=new Engine();wall.terrainShape(0,102,W-1,102,1);fill(wall,101,100,105,102,1);for(let i=0;i<4;i++)wall.step();expect(averageY(wall,1)).toBeLessThan(102);
  });
});
describe('mechanisms and editing',()=>{
  it('fixed inherits rotation, free preserves angle, descendants inherit their own parent',()=>{
    const e=new Engine(),m=e.add('motor',100,100)!,fixed=e.add('rect',110,100,4,4)!,free=e.add('pin',100,110)!,child=e.add('rect',105,110,4,4)!;
    e.reparent(fixed.id,m.id);e.reparent(free.id,m.id);e.setJoint(free.id,'free');e.reparent(child.id,free.id);
    m.la=Math.PI/2;const poses=e.poses();expect(poses.get(fixed.id)!.a).toBeCloseTo(Math.PI/2);expect(poses.get(fixed.id)!.y).toBeCloseTo(110);expect(poses.get(free.id)!.a).toBeCloseTo(0);expect(poses.get(free.id)!.x).toBeCloseTo(90);expect(poses.get(child.id)!.x).toBeCloseTo(95);
    expect(e.reparent(m.id,child.id)).toBe(false);
  });
  it('moves selected roots once and preserves world pose on detach and delete',()=>{
    const e=new Engine(),m=e.add('motor',50,50)!,p=e.add('pin',60,50)!,b=e.add('rect',70,50,4,4)!;e.reparent(p.id,m.id);e.reparent(b.id,p.id);
    const start=e.poses();e.move(new Set([m.id,p.id,b.id]),10,5,start);expect(e.poses().get(b.id)!.x).toBeCloseTo(80);
    e.detach(p.id);expect(b.parent).toBe(null);expect(e.poses().get(b.id)!.x).toBeCloseTo(80);
    e.reparent(b.id,p.id);e.delete(new Set([m.id,p.id]));expect(b.parent).toBe(null);expect(e.poses().get(b.id)!.x).toBeCloseTo(80);
  });
  it('keeps piston origin fixed and rolls back t/bounce on thin guide collision even at speed 10',()=>{
    const e=new Engine(),m=e.add('motor',50,100)!;m.mode='piston';m.strokeAngle=0;m.amp=240;m.speed=10;m.repeat=true;m.t=0;
    const b=e.add('rect',50,100,2,12)!;e.reparent(b.id,m.id);e.terrainShape(55,80,55,120,2);e.step();
    expect(m.blocked).toBe(true);expect(m.t).toBe(0);expect(m.bounce).toBe(1);expect(e.poses().get(m.id)!.x).toBe(50);expect(e.poses().get(b.id)!.x).toBe(50);
    m.amp=60;m.strokeAngle=Math.PI/2;e.rasterize();expect(e.poses().get(m.id)!.x).toBe(50);expect(e.poses().get(m.id)!.y).toBe(100);
  });
  it('rolls rotation back on fixed wall collision',()=>{
    const e=new Engine(),m=e.add('motor',80,80)!,b=e.add('rect',90,80,16,2)!;e.reparent(b.id,m.id);m.speed=10;
    e.terrainShape(90,82,100,83,1);e.step();expect(m.blocked).toBe(true);expect(m.la).toBe(0);
  });
  it('fast pistons sweep and push intermediate particles instead of passing through them',()=>{
    const e=new Engine();e.terrainShape(0,90,W-1,90,1);e.terrainShape(0,109,W-1,109,1);fill(e,53,93,64,107,1);e.viscosity[1]=100;e.conductivity.fill(0);
    const m=e.add('motor',50,100)!;m.mode='piston';m.strokeAngle=0;m.amp=240;m.speed=10;
    const b=e.add('rect',50,100,2,18)!;e.reparent(b.id,m.id);const count=e.count();e.step();
    expect(e.count()).toBe(count);expect(averageY(e,1)).toBeGreaterThan(90);
    for(let i=0;i<SIZE;i++)if(e.cells[i]===1)expect(i%W).toBeGreaterThanOrEqual(70);
  });
  it('one-way pistons stop at an end and reverse back regardless of old bounce state',()=>{
    const e=new Engine(),m=e.add('motor',50,50)!;m.mode='piston';m.repeat=false;m.t=.99;m.speed=10;m.direction=1;m.bounce=-1;e.step();
    expect(m.t).toBe(1);expect(m.direction).toBe(0);m.direction=-1;e.step();expect(m.t).toBeLessThan(1);
  });
  it('manual dragging cannot jump through a thin fixed wall',()=>{
    const e=new Engine(),b=e.add('rect',50,100,3,10)!;e.terrainShape(60,80,60,120,1);const before=e.poses();
    expect(e.move(new Set([b.id]),20,0,before)).toBe(false);expect(e.poses().get(b.id)!.x).toBe(50);
    e.terrain.fill(0);expect(e.move(new Set([b.id]),20,0,before)).toBe(true);expect(e.poses().get(b.id)!.x).toBe(70);
  });
  it('a moving plate pushes water in front without particle loss or teleporting behind',()=>{
    const e=new Engine();fill(e,102,90,110,110,1);
    const body=e.add('rect',100,100,2,20)!,old=e.poses(),before=e.count();body.lx=105;e.rasterize(old);
    expect(e.count()).toBe(before);for(let i=0;i<SIZE;i++)if(e.cells[i])expect(i%W).toBeGreaterThanOrEqual(102);
    for(let i=0;i<SIZE;i++)if(e.occupancy[i])expect(e.cells[i]).toBe(0);
  });
  it('retains particles when completely sealed and releases them when space opens',()=>{
    const e=new Engine();e.terrain.fill(1);const i=e.index(100,100);e.terrain[i]=0;e.cells[i]=1;
    const body=e.add('rect',100.5,100.5,1,1)!;expect(e.count()).toBe(1);expect(e.trapped).toHaveLength(1);
    e.terrain[e.index(101,100)]=0;e.rasterize();expect(e.trapped).toHaveLength(0);expect(e.cells[e.index(101,100)]).toBe(1);expect(body).toBeTruthy();
  });
  it('buffered particles can escape above a full-width plate',()=>{
    const e=new Engine();const i=e.index(200,100);e.cells[i]=1;e.add('rect',200,100.5,400,1);
    expect(e.trapped).toHaveLength(1);e.rasterize();expect(e.trapped).toHaveLength(0);expect(e.count()).toBe(1);
  });
  it('reuses motors, rejects oversized shapes, and has bounded undo',()=>{
    const e=new Engine(),a=e.add('motor',30,30)!,b=e.add('motor',30.4,30.4)!;expect(a.id).toBe(b.id);
    expect(e.add('rect',200,100,400,224)).toBeNull();expect(e.add('circle',200,100,1,1,120)).toBeNull();
    for(let i=0;i<45;i++)e.checkpoint();expect(e.history).toHaveLength(40);e.clear();e.undo();expect(e.nodes).toHaveLength(1);
  });
});
describe('save validation and demo',()=>{
  it('round trips entire state and rejects corrupt, mismatched and cyclic saves atomically',()=>{
    const e=new Engine();e.demo();const saved=e.snapshot(),restored=new Engine();expect(restored.load(JSON.stringify(saved))).toBe(true);expect(restored.snapshot()).toEqual(saved);
    expect(restored.load('{')).toBe(false);expect(restored.load(JSON.stringify({...saved,version:3}))).toBe(false);expect(restored.load(JSON.stringify({...saved,width:2}))).toBe(false);
    const cyclic=structuredClone(saved);cyclic.nodes[0].parent=cyclic.nodes[2].id;expect(restored.load(JSON.stringify(cyclic))).toBe(false);
    const bad=structuredClone(saved);bad.nodes[0].speed=Infinity;expect(restored.load(JSON.stringify(bad))).toBe(false);expect(restored.snapshot()).toEqual(saved);
  });
  it('demo runs with both motors, all educational materials and no lost particles',()=>{
    const e=new Engine();e.demo();const count=e.count();expect(e.nodes.filter(n=>n.kind==='motor')).toHaveLength(2);expect(e.cells).toContain(9);expect(e.cells).toContain(5);expect(e.cells).toContain(4);
    for(let i=0;i<90;i++)e.step(DT);expect(e.count()).toBe(count);expect(e.nodes.find(n=>n.kind==='motor'&&n.mode==='rotation')!.la).toBeGreaterThan(.5);
    for(const n of e.nodes)expect(Number.isFinite(e.poses().get(n.id)!.x)).toBe(true);
    expect(e.cells.length).toBe(W*H);
  });
});
