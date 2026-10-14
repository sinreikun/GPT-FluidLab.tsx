import { MATERIALS, MATERIAL_IDS, SIZE, W, H, clamp, type Engine } from './engine';

export interface ReactionPort {index:number;material:number;ratio:number}
export type Component = { material: number; amount: number };
export interface ChemistrySnapshot { amount: number[]; secondary: number[]; secondaryAmount: number[]; tertiary: number[]; tertiaryAmount: number[] }
const EPS=1e-8;
export const REACTIONS=[{id:'precipitate-ad',name:'沈殿反応',inputs:'晶塩 + 活性剤',outputs:'複合結晶',ratio:'晶塩 1 + 活性剤 1 → 複合結晶 2',temperature:'5〜180°C',heat:20,reactants:[{id:'crystal-a',ratio:1},{id:'reagent-d',ratio:1}],product:'precipitate-e',yield:2,minTemperature:5,maxTemperature:180,rate:.015}];
export const SOLUBILITY_RULES=[{solute:'crystal-a',solvent:'water',base:.06,slope:.004,max:.6},{solute:'reagent-d',solvent:'water',base:.35,slope:0,max:.35}];
export const MISCIBLE_GROUPS=[['water','solvent-b','crystal-a','reagent-d'],['heavy-c','crystal-a'],['hydrogen','oxygen','nitrogen','carbon-dioxide','steam']];
export const PHASE_RULES:{from:string;to:string;threshold:number;heating:boolean}[]=[
  {from:'water',to:'steam',threshold:100,heating:true},{from:'water',to:'ice',threshold:0,heating:false},
  {from:'steam',to:'water',threshold:95,heating:false},{from:'ice',to:'water',threshold:1,heating:true},
  {from:'mercury',to:'mercury-vapor',threshold:357,heating:true},{from:'mercury-vapor',to:'mercury',threshold:340,heating:false},
  {from:'lava',to:'rock',threshold:700,heating:false},{from:'rock',to:'lava',threshold:900,heating:true},
  {from:'solvent-b',to:'solvent-b-vapor',threshold:65,heating:true},
  {from:'solvent-b-vapor',to:'solvent-b',threshold:55,heating:false},
];
// Model formation energies give each phase a latent-heat offset, in internal units per unit mass.
const FORMATION:Record<string,number>={ice:-40,steam:310,'mercury-vapor':24.3,lava:-160,hydrogen:10800,oil:1800,smoke:1200,'precipitate-e':-10,'solvent-b-vapor':125};
export const formation=(m:number)=>FORMATION[MATERIALS[m].id]??0;
export const saturation=(temperature:number)=>{const rule=SOLUBILITY_RULES[0];return clamp(rule.base+Math.max(0,temperature)*rule.slope,rule.base,rule.max);};
export class Chemistry {
  amount=new Float32Array(SIZE).fill(1);
  secondary=new Uint8Array(SIZE);
  secondaryAmount=new Float32Array(SIZE);
  tertiary=new Uint8Array(SIZE);
  tertiaryAmount=new Float32Array(SIZE);
  status='';
  flame=new Uint8Array(SIZE);
  private phaseRules=PHASE_RULES.map(r=>({...r,from:MATERIAL_IDS.indexOf(r.from),to:MATERIAL_IDS.indexOf(r.to)}));
  private phaseIndex=new Map<number,typeof this.phaseRules>();
  private solubilityRules=SOLUBILITY_RULES.map(r=>({...r,solute:MATERIAL_IDS.indexOf(r.solute),solvent:MATERIAL_IDS.indexOf(r.solvent)}));
  private reactionRules=REACTIONS.map(r=>({...r,reactants:r.reactants.map(p=>({material:MATERIAL_IDS.indexOf(p.id),ratio:p.ratio})),product:MATERIAL_IDS.indexOf(r.product)}));
  private miscibleGroups=MISCIBLE_GROUPS.map(group=>group.map(id=>MATERIAL_IDS.indexOf(id)));
  private reactiveMaterials=new Set([...this.solubilityRules.map(r=>r.solute),...this.reactionRules.flatMap(r=>r.reactants.map(p=>p.material))]);
  private solvents=[...new Set([...this.solubilityRules.map(r=>r.solvent),...this.miscibleGroups.flat().filter(m=>MATERIALS[m].phase==='liquid')])];
  private contactMaterials=new Set([...this.solubilityRules.map(r=>r.solute),...this.miscibleGroups.flat().filter(m=>m!==1)]);
  constructor(private e:Engine){for(const rule of this.reactionRules){if(rule.product<1||rule.reactants.some(p=>p.material<1||p.ratio<=0)||Math.abs(rule.reactants.reduce((sum,p)=>sum+p.ratio,0)-rule.yield)>1e-8)throw new Error('反応定義の物質ID・保存則が不正');}for(const rule of this.phaseRules){const group=this.phaseIndex.get(rule.from)??[];group.push(rule);this.phaseIndex.set(rule.from,group);}}
  clear(){this.amount.fill(1);this.secondary.fill(0);this.secondaryAmount.fill(0);this.tertiary.fill(0);this.tertiaryAmount.fill(0);this.flame.fill(0);}
  reset(i:number){this.amount[i]=1;this.secondary[i]=this.tertiary[i]=0;this.secondaryAmount[i]=this.tertiaryAmount[i]=0;}
  components(i:number):Component[]{if(!this.e.cells[i])return [];const out=[{material:this.e.cells[i],amount:this.amount[i]}];if(this.secondary[i])out.push({material:this.secondary[i],amount:this.secondaryAmount[i]});if(this.tertiary[i])out.push({material:this.tertiary[i],amount:this.tertiaryAmount[i]});return out;}
  mass(i:number){return this.e.cells[i]?this.amount[i]+this.secondaryAmount[i]+this.tertiaryAmount[i]:0;}
  quantity(i:number,m:number){if(!this.e.cells[i])return 0;return this.e.cells[i]===m?this.amount[i]:this.secondary[i]===m?this.secondaryAmount[i]:this.tertiary[i]===m?this.tertiaryAmount[i]:0;}
  capacity(i:number){if(!this.e.cells[i])return MATERIALS[0].capacity;return Math.max(EPS,this.amount[i]*MATERIALS[this.e.cells[i]].capacity+this.secondaryAmount[i]*MATERIALS[this.secondary[i]].capacity+this.tertiaryAmount[i]*MATERIALS[this.tertiary[i]].capacity);}
  density(i:number){if(!this.e.cells[i])return 0;return (this.amount[i]*MATERIALS[this.e.cells[i]].density+this.secondaryAmount[i]*MATERIALS[this.secondary[i]].density+this.tertiaryAmount[i]*MATERIALS[this.tertiary[i]].density)/this.mass(i);}
  viscosity(i:number){const m=this.e.cells[i];if(!m)return 0;if(!this.secondary[i])return this.e.viscosity[m];return (this.amount[i]*this.e.viscosity[m]+this.secondaryAmount[i]*this.e.viscosity[this.secondary[i]]+this.tertiaryAmount[i]*this.e.viscosity[this.tertiary[i]])/this.mass(i);}
  conductivity(i:number){const m=this.e.cells[i];if(!m)return this.e.conductivity[0];if(!this.secondary[i])return this.e.conductivity[m];return (this.amount[i]*this.e.conductivity[m]+this.secondaryAmount[i]*this.e.conductivity[this.secondary[i]]+this.tertiaryAmount[i]*this.e.conductivity[this.tertiary[i]])/this.mass(i);}
  energyOf(parts:Component[],temperature:number){return parts.reduce((s,p)=>s+p.amount*(MATERIALS[p.material].capacity*temperature+formation(p.material)),0);}
  energy(i:number){return this.energyOf(this.components(i),this.e.temperature[i]);}
  temperatureFor(parts:Component[],energy:number){let capacity=0,offset=0;for(const p of parts){capacity+=p.amount*MATERIALS[p.material].capacity;offset+=p.amount*formation(p.material);}return capacity>EPS?(energy-offset)/capacity:20;}
  merge(parts:Component[]){const map=new Map<number,number>();for(const p of parts)if(p.material&&p.amount>EPS)map.set(p.material,(map.get(p.material)??0)+p.amount);return [...map].map(([material,amount])=>({material,amount})).sort((a,b)=>b.amount-a.amount||a.material-b.material);}
  write(i:number,parts:Component[],temperature=this.e.temperature[i]){
    const entries=this.merge(parts);if(entries.length>3||entries.reduce((s,p)=>s+p.amount,0)>1.00001)throw new Error('混合セルの容量超過');
    this.reset(i);this.e.cells[i]=entries[0]?.material??0;this.amount[i]=entries[0]?.amount??1;
    if(entries[1]){this.secondary[i]=entries[1].material;this.secondaryAmount[i]=entries[1].amount;}
    if(entries[2]){this.tertiary[i]=entries[2].material;this.tertiaryAmount[i]=entries[2].amount;}
    this.e.temperature[i]=entries.length?clamp(temperature,-273,5000):20;
  }
  swap(i:number,j:number){for(const a of [this.amount,this.secondary,this.secondaryAmount,this.tertiary,this.tertiaryAmount]){const v=a[i];a[i]=a[j];a[j]=v;}}
  move(i:number,j:number){this.amount[j]=this.amount[i];this.secondary[j]=this.secondary[i];this.secondaryAmount[j]=this.secondaryAmount[i];this.tertiary[j]=this.tertiary[i];this.tertiaryAmount[j]=this.tertiaryAmount[i];this.reset(i);}
  snapshot():ChemistrySnapshot{return {amount:Array.from(this.amount),secondary:Array.from(this.secondary),secondaryAmount:Array.from(this.secondaryAmount),tertiary:Array.from(this.tertiary),tertiaryAmount:Array.from(this.tertiaryAmount)};}
  restore(s?:ChemistrySnapshot){this.clear();if(s)for(const key of ['amount','secondary','secondaryAmount','tertiary','tertiaryAmount'] as const)this[key].set(s[key]);}
  free(i:number){return i>=0&&this.e.terrain[i]!==1&&!this.e.occupancy[i];}
  neighbours(i:number){const x=i%W,y=Math.floor(i/W);return [this.e.index(x,y-1),this.e.index(x+1,y),this.e.index(x-1,y),this.e.index(x,y+1)].filter(j=>j>=0);}
  canAccept(i:number,parts:Component[]){return this.free(i)&&this.merge([...this.components(i),...parts]).length<=3;}
  transfer(i:number,j:number,limit:number,filter=0){
    if(i===j||!this.free(j)||!this.e.cells[i])return 0;
    const source=this.components(i),selected=source.filter(p=>!filter||p.material===filter),available=selected.reduce((s,p)=>s+p.amount,0);
    const quantity=Math.min(limit,available,Math.max(0,1-this.mass(j)));if(quantity<EPS)return 0;
    const packet=selected.map(p=>({material:p.material,amount:p.amount*quantity/available}));if(!this.canAccept(j,packet))return 0;
    // Incompatible phases are not merged by a normal pump.
    const dest=this.components(j);if(dest.length&&!this.compatible([...dest,...packet]))return 0;
    const remaining=source.map(p=>({material:p.material,amount:p.amount-(packet.find(q=>q.material===p.material)?.amount??0)}));
    const eDest=this.energy(j)+this.energyOf(packet,this.e.temperature[i]);
    const combined=this.merge([...dest,...packet]);const sourceTemp=this.e.temperature[i];
    this.write(j,combined,this.temperatureFor(combined,eDest));this.write(i,remaining,sourceTemp);return quantity;
  }
  compatible(parts:Component[]){const ids=parts.filter(p=>p.amount>EPS).map(p=>p.material);return this.miscibleGroups.some(group=>ids.every(m=>group.includes(m)))||ids.every(m=>m===ids[0]);}
  /** Commit all ports together: blocked products never consume only part of the inputs. */
  react(inputs:ReactionPort[],outputs:ReactionPort[],limit:number,externalPerUnit=0){
    if(!inputs.length||!outputs.length||limit<=EPS||!Number.isFinite(externalPerUnit))return 0;
    const consumed=new Map<string,ReactionPort>(),produced=new Map<string,ReactionPort>();
    for(const [ports,map] of [[inputs,consumed],[outputs,produced]] as const)for(const p of ports){if(!this.free(p.index)||p.material<=0||p.material>=MATERIALS.length||p.ratio<=0)return 0;const key=`${p.index}:${p.material}`,old=map.get(key);map.set(key,{...p,ratio:p.ratio+(old?.ratio??0)});}
    const ins=[...consumed.values()],outs=[...produced.values()],inMass=ins.reduce((sum,p)=>sum+p.ratio,0),outMass=outs.reduce((sum,p)=>sum+p.ratio,0);
    if(Math.abs(inMass-outMass)>1e-6)throw new Error('反応の質量収支が不正');
    let q=limit;for(const p of ins)q=Math.min(q,this.quantity(p.index,p.material)/p.ratio);
    const indexes=new Set([...ins,...outs].map(p=>p.index));
    for(const index of indexes){const change=outs.filter(p=>p.index===index).reduce((s,p)=>s+p.ratio,0)-ins.filter(p=>p.index===index).reduce((s,p)=>s+p.ratio,0);if(change>0)q=Math.min(q,Math.max(0,1-this.mass(index))/change);}
    if(q<EPS)return 0;
    let released=externalPerUnit*q;for(const p of ins)released+=this.energyOf([{material:p.material,amount:p.ratio*q}],this.e.temperature[p.index]);
    const products=outs.map(p=>({material:p.material,amount:p.ratio*q})),temperature=this.temperatureFor(products,released);
    if(!Number.isFinite(temperature)||temperature< -273||temperature>5000)return 0;
    const patches:{index:number;parts:Component[];temperature:number}[]=[];
    for(const index of indexes){let energy=this.energy(index);const parts=this.components(index);
      for(const p of ins.filter(p=>p.index===index)){const item=parts.find(c=>c.material===p.material)!;item.amount-=p.ratio*q;energy-=this.energyOf([{material:p.material,amount:p.ratio*q}],this.e.temperature[index]);}
      const packet=outs.filter(p=>p.index===index).map(p=>({material:p.material,amount:p.ratio*q}));
      const remaining=this.merge(parts);if(packet.length&&remaining.length&&!this.compatible([...remaining,...packet]))return 0;
      const merged=this.merge([...remaining,...packet]);if(merged.length>3||merged.reduce((sum,p)=>sum+p.amount,0)>1.00001)return 0;
      energy+=this.energyOf(packet,temperature);const t=this.temperatureFor(merged,energy);if(t< -273||t>5000)return 0;patches.push({index,parts:merged,temperature:t});
    }
    for(const p of patches)this.write(p.index,p.parts,p.temperature);return q;
  }
  private burn(sources:{index:number;material:number}[]){
    for(const {index,material} of sources){if(!this.free(index)||this.quantity(index,material)<EPS||this.e.temperature[index]<(material===9?350:material===2?280:450))continue;
      const oxygen=[index,...this.neighbours(index)].find(j=>this.free(j)&&this.quantity(j,17)>EPS);if(oxygen===undefined)continue;
      const complete=material!==2||this.quantity(oxygen,17)>=this.quantity(index,2)*24/7;
      const ratios=material===9?{fuel:1,oxygen:8,products:[{material:7,ratio:9}]}:material===8?{fuel:3,oxygen:8,products:[{material:18,ratio:11}]}:complete?{fuel:7,oxygen:24,products:[{material:18,ratio:22},{material:7,ratio:9}]}:{fuel:7,oxygen:8,products:[{material:8,ratio:6},{material:7,ratio:9}]};
      const candidates=[...this.neighbours(index),...this.neighbours(oxygen)];const used=new Set<number>([index,oxygen]);const outs:ReactionPort[]=[];
      for(const product of ratios.products){const j=candidates.find(j=>!used.has(j)&&this.free(j)&&this.mass(j)<.99999&&(!this.e.cells[j]||this.compatible([...this.components(j),{material:product.material,amount:.01}])));if(j===undefined){outs.length=0;break;}used.add(j);outs.push({...product,index:j});}
      if(outs.length&&this.react([{index,material,ratio:ratios.fuel},{index:oxygen,material:17,ratio:ratios.oxygen}],outs,.015/ratios.fuel)>0)this.flame[index]=8;
    }
  }
  private solution(i:number){return this.solvents.some(m=>this.quantity(i,m)>EPS);}
  private dissolve(solid:number,liquid:number){
    const m=this.e.cells[solid],rule=this.solubilityRules.find(r=>r.solute===m);if(!rule||!this.solution(liquid)||!this.free(solid)||!this.free(liquid))return;
    const water=this.quantity(liquid,rule.solvent);if(water<EPS)return;
    const solubility=clamp(rule.base+Math.max(0,this.e.temperature[liquid])*rule.slope,rule.base,rule.max);
    const room=water*solubility-this.quantity(liquid,m);
    const q=Math.min(.025,room,this.quantity(solid,m));if(q<EPS)return;
    if(this.mass(liquid)<.99999){this.transfer(solid,liquid,q,m);return;}
    // A full water cell exchanges an equal amount of solvent with the dissolving grain.
    // This preserves capacity and lets dissolution start without requiring an empty cell.
    const source=this.components(solid),dest=this.components(liquid),waterPacket=Math.min(q,water);
    const a=this.merge([...source.map(p=>({material:p.material,amount:p.amount-(p.material===m?waterPacket:0)})),{material:rule.solvent,amount:waterPacket}]);
    const b=this.merge([...dest.map(p=>({material:p.material,amount:p.amount-(p.material===rule.solvent?waterPacket:0)})),{material:m,amount:waterPacket}]);
    if(a.length>3||b.length>3)return;
    const sourceT=this.e.temperature[solid],destT=this.e.temperature[liquid];
    const ea=this.energy(solid)-this.energyOf([{material:m,amount:waterPacket}],sourceT)+this.energyOf([{material:rule.solvent,amount:waterPacket}],destT);
    const eb=this.energy(liquid)-this.energyOf([{material:rule.solvent,amount:waterPacket}],destT)+this.energyOf([{material:m,amount:waterPacket}],sourceT);
    this.write(solid,a,this.temperatureFor(a,ea));this.write(liquid,b,this.temperatureFor(b,eb));
  }
  private diffuse(i:number,j:number){
    if(!this.solution(i)||!this.solution(j)||MATERIALS[this.e.cells[i]].phase!=='liquid'||MATERIALS[this.e.cells[j]].phase!=='liquid'||!this.free(i)||!this.free(j))return;
    const massA=this.mass(i),massB=this.mass(j);
    if(this.e.cells[i]===this.e.cells[j]&&this.secondary[i]===this.secondary[j]&&this.tertiary[i]===this.tertiary[j]&&Math.abs(this.amount[i]/massA-this.amount[j]/massB)<1e-6&&Math.abs(this.secondaryAmount[i]/massA-this.secondaryAmount[j]/massB)<1e-6)return;
    const a=this.components(i),b=this.components(j);if(!this.compatible([...a,...b])||this.merge([...a,...b]).length>3)return;
    const ma=this.mass(i),mb=this.mass(j),q=Math.min(ma,mb)*.06;if(q<EPS)return;
    const packetA=a.map(p=>({material:p.material,amount:p.amount*q/ma})),packetB=b.map(p=>({material:p.material,amount:p.amount*q/mb}));
    const nextA=this.merge([...a.map(p=>({material:p.material,amount:p.amount*(1-q/ma)})),...packetB]);
    const nextB=this.merge([...b.map(p=>({material:p.material,amount:p.amount*(1-q/mb)})),...packetA]);
    const ea=this.energy(i)-this.energyOf(packetA,this.e.temperature[i])+this.energyOf(packetB,this.e.temperature[j]);
    const eb=this.energy(j)-this.energyOf(packetB,this.e.temperature[j])+this.energyOf(packetA,this.e.temperature[i]);
    this.write(i,nextA,this.temperatureFor(nextA,ea));this.write(j,nextB,this.temperatureFor(nextB,eb));
  }
  private destination(i:number,m:number){
    const x=i%W,y=Math.floor(i/W);
    for(let direction=0;direction<4;direction++){
      const j=direction===0?(y>0?i-W:-1):direction===1?(x<W-1?i+1:-1):direction===2?(x>0?i-1:-1):(y<H-1?i+W:-1);
      if(this.free(j)&&this.mass(j)<.99999&&(!this.e.cells[j]||this.e.cells[j]===m&&!this.secondary[j]&&!this.tertiary[j]))return j;
    }
    return -1;
  }
  private emit(i:number,from:number,to:number,quantity:number,outTemperature:number,heat=0){
    const j=this.destination(i,to);if(j<0)return 0;
    const q=Math.min(quantity,this.quantity(i,from),1-this.mass(j));if(q<EPS)return 0;
    const source=this.components(i),packet=[{material:to,amount:q}],dest=this.merge([...this.components(j),...packet]);
    const remaining=source.map(p=>({material:p.material,amount:p.amount-(p.material===from?q:0)}));
    const energy=this.energy(i)-this.energyOf(packet,outTemperature)+heat;
    const destEnergy=this.energy(j)+this.energyOf(packet,outTemperature);
    if(remaining.reduce((s,p)=>s+p.amount,0)<=EPS){
      this.write(j,dest,this.temperatureFor(dest,destEnergy+energy));this.write(i,[]);
    }else{this.write(i,remaining,this.temperatureFor(remaining,energy));this.write(j,dest,this.temperatureFor(dest,destEnergy));}
    return q;
  }
  private transition(material:number,temperature:number):[number,number,boolean]|null{
    for(const rule of this.phaseIndex.get(material)??[])if((rule.heating?temperature>=rule.threshold:temperature<=rule.threshold))return [rule.to,rule.threshold,rule.heating];
    return null;
  }
  phaseChanges(){
    // Only eligible sources are captured. Newly emitted products cannot run again this step.
    const active:{i:number;parts:Component[]}[]=[];
    for(let i=0;i<SIZE;i++)if(this.e.cells[i]){
      const t=this.e.temperature[i];
      const main=this.transition(this.e.cells[i],t),second=this.secondary[i]?this.transition(this.secondary[i],t):null,third=this.tertiary[i]?this.transition(this.tertiary[i],t):null;
      if(main&&this.destination(i,main[0])>=0||second&&this.destination(i,second[0])>=0||third&&this.destination(i,third[0])>=0)active.push({i,parts:this.components(i)});
    }
    for(const {i,parts} of active){
      if(!this.free(i))continue;
      for(const p of parts){
        const temperature=this.e.temperature[i],transition=this.transition(p.material,temperature);if(!transition)continue;
        const [to,threshold,heating]=transition;
        const gap=Math.abs((MATERIALS[to].capacity-MATERIALS[p.material].capacity)*threshold+formation(to)-formation(p.material));
        const available=Math.max(0,(heating?temperature-threshold:threshold-temperature)*this.capacity(i));
        const q=Math.min(p.amount,this.quantity(i,p.material),.04,available/Math.max(1,gap));
        if(q>EPS)this.emit(i,p.material,to,q,threshold);
      }
    }
  }

  step(){
    const fuels:{index:number;material:number}[]=[];for(let i=0;i<SIZE;i++){if(this.flame[i])this.flame[i]--;const m=this.e.cells[i],s=this.secondary[i],t=this.tertiary[i];if(m===2||m===8||m===9)fuels.push({index:i,material:m});if(s===2||s===8||s===9)fuels.push({index:i,material:s});if(t===2||t===8||t===9)fuels.push({index:i,material:t});}
    const pairs:[number,number][]=[];
    // Only special substances or mixed cells need chemical contact checks.
    for(let i=0;i<SIZE;i++)if(this.contactMaterials.has(this.e.cells[i])&&MATERIALS[this.e.cells[i]].phase!=='gas'||this.secondary[i]&&MATERIALS[this.e.cells[i]].phase==='liquid')for(const j of this.neighbours(i))if(this.e.cells[j]&&(i<j||this.e.cells[j]<11&&!this.secondary[j]))pairs.push([i,j]);
    for(const [i,j] of pairs){this.dissolve(i,j);this.dissolve(j,i);this.diffuse(i,j);}
    const sources:number[]=[];for(let i=0;i<SIZE;i++)if(this.secondary[i]||this.reactiveMaterials.has(this.e.cells[i]))sources.push(i);
    for(const i of sources){
      const temp=this.e.temperature[i];
      for(const rule of this.reactionRules){
        if(temp<rule.minTemperature||temp>rule.maxTemperature)continue;
        const j=this.destination(i,rule.product);if(j>=0)this.react(rule.reactants.map(p=>({index:i,material:p.material,ratio:p.ratio})),[{index:j,material:rule.product,ratio:rule.yield}],rule.rate);

      }
      for(const rule of this.solubilityRules){
        const solvent=this.quantity(i,rule.solvent),limit=clamp(rule.base+Math.max(0,this.e.temperature[i])*rule.slope,rule.base,rule.max);
        const excess=this.quantity(i,rule.solute)-solvent*limit;
        if(solvent>EPS&&MATERIALS[this.e.cells[i]].phase==='liquid'&&excess>EPS)this.emit(i,rule.solute,rule.solute,Math.min(.025,excess),this.e.temperature[i]);
      }
    }
    this.burn(fuels);
  }
}
