import {type Engine,type LabNode,type Pose} from './engine';
import {type ReactionPort} from './chemistry';
export const PROCESSES={
  electrolysis:{name:'電解槽',symbol:'EL',description:'主入口の水を、水素（主出口）と酸素（補助出口）へ分けます。電力を消費。質量比は1:8:9。'},
  combustion:{name:'着火燃焼器',symbol:'FL',description:'主入口の水素と補助入口の酸素を消費し、主出口へ水蒸気を出します。電力で着火し、燃焼熱を放出。'},
  condensation:{name:'凝縮器',symbol:'CD',description:'主入口の水蒸気から熱を除き、主出口へ20°Cの水を戻します。冷却能力が処理量を制限。'},
  crystallization:{name:'結晶反応器',symbol:'CR',description:'主入口の晶塩と補助入口の活性剤を冷却・混合し、主出口に複合結晶を生成します。'},
  regeneration:{name:'結晶再生器',symbol:'RG',description:'主入口の複合結晶を電力で220°Cに加熱し、主出口の晶塩と補助出口の活性剤に再生します。'},
  extraction:{name:'抽出器',symbol:'EX',description:'主入口の水溶液から晶塩を取り込み、補助入口の抽出液とともに主出口へ。水は元の槽に残ります。'},
  recovery:{name:'回収器',symbol:'RC',description:'主入口の晶塩入り抽出液から、主出口へ晶塩、補助出口へ再利用する抽出液を分けます。'},
} as const;
export type Process=keyof typeof PROCESSES;
export interface PortPoint{x:number;y:number}
export interface CustomPorts{input:PortPoint;output:PortPoint;aux:PortPoint}
export function processPorts(e:Engine,n:LabNode,poses=e.poses()){
  const p=poses.get(n.id)!,a=p.a+(n.portAngle??0)*Math.PI/180,d=n.portDistance??6;
  if(n.customPorts){const transform=(v:PortPoint)=>({x:p.x+Math.cos(p.a)*v.x-Math.sin(p.a)*v.y,y:p.y+Math.sin(p.a)*v.x+Math.cos(p.a)*v.y});return {input:transform(n.customPorts.input),output:transform(n.customPorts.output),aux:transform(n.customPorts.aux)};}
  return {...e.devicePorts(n,poses),aux:{x:p.x-Math.sin(a)*d,y:p.y+Math.cos(a)*d}};
}
export function runProcesses(e:Engine,dt:number,poses:Map<number,Pose>){
  const c=e.chemistry;
  for(const n of e.nodes){if(n.kind!=='processor')continue;
    if(!n.enabled){n.deviceStatus='停止';continue;}
    const mode=n.process??'electrolysis',ports=processPorts(e,n,poses),i=e.index(ports.input.x,ports.input.y),j=e.index(ports.output.x,ports.output.y),k=e.index(ports.aux.x,ports.aux.y);
    const required=mode==='condensation'?[i,j]:[i,j,k];
    if(required.some(index=>index<0)||new Set(required).size<required.length||!required.every(index=>c.free(index))){n.deviceStatus='ポートが遮断・重複・盤面外';continue;}
    const input=(material:number,ratio=1,index=i):ReactionPort=>({index,material,ratio});const output=(material:number,ratio=1,index=j):ReactionPort=>({index,material,ratio});
    let ins:ReactionPort[]=[],outs:ReactionPort[]=[],external=0,work=0;
    if(mode==='electrolysis'){ins=[input(1,9)];outs=[output(9,1),output(17,8,k)];external=10800;}
    if(mode==='combustion'){ins=[input(9,1),input(17,8,k)];outs=[output(7,9)];external=1;}
    if(mode==='condensation'){ins=[input(7)];outs=[output(1)];external=c.energyOf([{material:1,amount:1}],20)-c.energyOf([{material:7,amount:1}],e.temperature[i]);}
    if(mode==='regeneration'){ins=[input(16,2)];outs=[output(11),output(15,1,k)];external=c.energyOf([{material:11,amount:1},{material:15,amount:1}],220)-c.energyOf([{material:16,amount:2}],e.temperature[i]);}
    if(mode==='crystallization'){ins=[input(11),input(15,1,k)];outs=[output(16,2)];external=c.energyOf([{material:16,amount:2}],55)-c.energyOf([{material:11,amount:1}],e.temperature[i])-c.energyOf([{material:15,amount:1}],e.temperature[k]);}
    if(mode==='extraction'){
      if(c.quantity(i,1)<1e-6){n.deviceStatus='水溶液が必要';continue;}
      ins=[input(11,1),input(14,4,k)];outs=[output(11,1),output(14,4)];work=5;
    }
    if(mode==='recovery'){ins=[input(11,1),input(14,4)];outs=[output(11,1),output(14,4,k)];work=5;}
    const total=ins.reduce((sum,p)=>sum+p.ratio,0);let limit=(n.flowRate??1)*dt/total;
    // Power is an explicitly supplied energy rate; no material source is manufactured.
    const cost=Math.abs(external)+work;if(cost>1e-8)limit=Math.min(limit,(n.power??1200)*dt/cost);
    const q=c.react(ins,outs,limit,external);
    if(q>0){n.transported=(n.transported??0)+q*total;n.energyUsed=(n.energyUsed??0)+Math.max(0,q*external)+q*work;n.heatRemoved=(n.heatRemoved??0)+Math.max(0,-q*external)+q*work;n.deviceStatus='処理中';if(mode==='combustion')c.flame[i]=8;}
    else n.deviceStatus=(n.flowRate??1)<=0?'流量0':(n.power??1200)<=0&&cost>0?'電力・冷却能力0':'原料不足・出口満杯・成分非対応';
  }
}
