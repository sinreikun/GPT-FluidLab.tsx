import {it} from 'vitest';
import {Engine} from './engine';
it.runIf(import.meta.env.VITE_LAB_BENCHMARK==='1')('reports representative CPU workloads',()=>{
  for(const scene of ['demo','dense','devices'] as const){const e=new Engine();if(scene==='demo')e.demo();else if(scene==='dense'){for(let y=100;y<210;y++)for(let x=10;x<390;x++)e.cells[y*400+x]=1;}else{for(let n=0;n<80;n++){const m=e.add('motor',20+n%16*23,20+Math.floor(n/16)*38)!;m.speed=.3;const b=e.add('rect',m.lx+5,m.ly,10,3)!;e.reparent(b.id,m.id);const p=e.add('pump',m.lx,m.ly+10)!;p.flowRate=1;}}
    for(let i=0;i<3;i++)e.step();const start=performance.now();for(let i=0;i<12;i++)e.step();console.log(`CPU ${scene}: ${((performance.now()-start)/12).toFixed(2)} ms/step`);
  }
});
