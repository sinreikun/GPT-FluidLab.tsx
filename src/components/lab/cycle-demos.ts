import {type Engine,type LabNode} from './engine';
import {type Process,type PortPoint} from './processes';
import {type Component} from './chemistry';
export interface CycleLabels {name:string;points:{point:PortPoint;label:string}[]}
export function cycleLabels(kind:string):CycleLabels[]{
  const all=kind==='cycles';const result:CycleLabels[]=[];
  if(all||kind==='hydrogen-cycle')result.push({name:'水素循環',points:[{point:{x:95.5,y:81.5},label:'水'},{point:{x:145.5,y:81.5},label:'水素'},{point:{x:195.5,y:81.5},label:'酸素'},{point:{x:245.5,y:81.5},label:'水蒸気'}]});
  if(all||kind==='crystal-cycle')result.push({name:'結晶循環',points:[{point:{x:95.5,y:133.5},label:'晶塩'},{point:{x:145.5,y:133.5},label:'活性剤'},{point:{x:195.5,y:133.5},label:'生成結晶'},{point:{x:245.5,y:133.5},label:'分離結晶'}]});
  if(all||kind==='extraction-cycle')result.push({name:'抽出循環',points:[{point:{x:105.5,y:185.5},label:'水溶液'},{point:{x:175.5,y:185.5},label:'抽出液'},{point:{x:245.5,y:185.5},label:'晶塩入り抽出液'}]});
  return result;
}
export function buildCycles(e:Engine,kind:string){
  e.clear();const groups=cycleLabels(kind);
  const socket=(point:PortPoint,parts:Component[])=>{e.terrainShape(point.x-1,point.y-1,point.x+1,point.y+1,1);e.terrain[e.index(point.x,point.y)]=0;e.chemistry.write(e.index(point.x,point.y),parts,20);};
  const configure=(n:LabNode,input:PortPoint,output:PortPoint,aux:PortPoint)=>{n.customPorts={input:{x:input.x-n.lx,y:input.y-n.ly},output:{x:output.x-n.lx,y:output.y-n.ly},aux:{x:aux.x-n.lx,y:aux.y-n.ly}};n.flowRate=.8;};
  const machine=(mode:Process,x:number,y:number,input:PortPoint,output:PortPoint,aux:PortPoint)=>{const n=e.add('processor',x,y)!;n.process=mode;configure(n,input,output,aux);n.power=2400;return n;};
  for(const group of groups){const p=group.points.map(p=>p.point);
    if(group.name==='水素循環'){
      for(let i=0;i<p.length;i++)socket(p[i],i===0?[{material:1,amount:1}]:[]);
      machine('condensation',270,64,p[3],p[0],{x:270,y:72}).name='水素循環 · 凝縮器';
      machine('combustion',220,64,p[1],p[3],p[2]).name='水素循環 · 着火燃焼器';
      machine('electrolysis',120,64,p[0],p[1],p[2]).name='水素循環 · 電解槽';
    }else if(group.name==='結晶循環'){
      for(let i=0;i<p.length;i++)socket(p[i],i===0?[{material:11,amount:.5}]:i===1?[{material:15,amount:.5}]:[]);
      machine('regeneration',270,116,p[3],p[0],p[1]).name='結晶循環 · 再生器';
      machine('crystallization',120,116,p[0],p[2],p[1]).name='結晶循環 · 反応器';
      const membrane=e.add('membrane',220,116)!;membrane.name='結晶循環 · 選択膜';membrane.filterMaterial=16;membrane.flowRate=.8;
      // The membrane also follows explicit port offsets, just like ordinary cycle processors.
      configure(membrane,p[2],p[3],{x:220,y:123});
    }else{
      socket(p[0],[{material:1,amount:.9},{material:11,amount:.1}]);socket(p[1],[{material:14,amount:1}]);socket(p[2],[]);
      machine('recovery',280,168,p[2],p[0],p[1]).name='抽出循環 · 回収器';
      machine('extraction',140,168,p[0],p[2],p[1]).name='抽出循環 · 抽出器';
    }
  }
  e.experimentTitle=kind==='cycles'?'材料を再利用する三つの循環':groups[0]?.name??'循環';
  e.experimentDescription='小さな閉鎖セル槽を配管で接続した見本です。材料の補充なしで循環。装置を選ぶと処理量・電力・除去熱を確認できます。電力や冷却能力を0にすると停止します。';
  e.rasterize();e.tick=0;
}
