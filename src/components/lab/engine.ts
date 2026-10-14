import {buildCycles} from './cycle-demos';
import {runProcesses,type Process,type CustomPorts,PROCESSES} from './processes';
import { Chemistry, type ChemistrySnapshot, type Component } from './chemistry';
export const W = 400, H = 224, SIZE = W * H;
export const STORAGE_KEY = 'cell-fluid-lab-v1';
export const DT = 1 / 60;
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export interface Material { id: string; description?: string; fictional?: boolean; phase: 'gas' | 'liquid' | 'solid' | 'powder'; name: string; en: string; density: number; viscosity: number; conductivity: number; capacity: number; temperature: number; color: [number, number, number] }
export const MATERIAL_IDS=['air','water','oil','mercury','ice','lava','rock','steam','smoke','hydrogen','mercury-vapor','crystal-a','solvent-b','solvent-b-vapor','heavy-c','reagent-d','precipitate-e','oxygen','carbon-dioxide','nitrogen'];
export const MATERIALS: Material[] = [
  {phase:'gas',name:'空気',en:'AIR',density:0,viscosity:0,conductivity:.04,capacity:.35,temperature:20,color:[12,20,29]},
  {phase:'liquid',name:'水',en:'WATER',density:4,viscosity:8,conductivity:.65,capacity:4.2,temperature:20,color:[57,158,235]},
  {phase:'liquid',name:'炭化水素油',en:'OIL',density:2,viscosity:42,conductivity:.15,capacity:2,temperature:25,color:[224,183,67]},
  {phase:'liquid',name:'水銀',en:'MERCURY',density:9,viscosity:5,conductivity:.85,capacity:.6,temperature:20,color:[182,198,214]},
  {phase:'solid',name:'氷',en:'ICE',density:3,viscosity:100,conductivity:.75,capacity:2.1,temperature:-12,color:[157,227,243]},
  {phase:'liquid',name:'溶岩',en:'LAVA',density:7,viscosity:74,conductivity:.4,capacity:1.5,temperature:1200,color:[245,91,43]},
  {phase:'solid',name:'岩石',en:'ROCK',density:6,viscosity:100,conductivity:.35,capacity:1.2,temperature:420,color:[117,108,105]},
  {phase:'gas',name:'水蒸気',en:'STEAM',density:-3,viscosity:4,conductivity:.2,capacity:1.9,temperature:110,color:[174,206,219]},
  {phase:'powder',name:'煤',en:'SOOT',density:5,viscosity:24,conductivity:.12,capacity:1,temperature:20,color:[120,131,149]},
  {phase:'gas',name:'水素',en:'HYDROGEN',density:-6,viscosity:0,conductivity:.2,capacity:1.4,temperature:20,color:[160,139,224]},
  {phase:'gas',name:'水銀蒸気',en:'HG VAPOR',density:-1,viscosity:4,conductivity:.25,capacity:.7,temperature:370,color:[156,179,163]},
  {phase:'powder',name:'晶塩',en:'CRYSTAL SALT',density:6,viscosity:24,conductivity:.2,capacity:1.4,temperature:20,color:[114,230,171],fictional:true,description:'水に溶け、加熱で溶ける量が増える。冷却・蒸発で析出。活性剤と反応して複合結晶になる。'},
  {phase:'liquid',name:'揮発溶媒',en:'VOLATILE SOLVENT',density:3,viscosity:6,conductivity:.3,capacity:2.5,temperature:20,color:[221,139,224],fictional:true,description:'水と混ざる架空の溶媒。65°Cから蒸発し、蒸気を冷却すると分離回収できる。'},
  {phase:'gas',name:'溶媒蒸気',en:'SOLVENT VAPOR',density:-4,viscosity:3,conductivity:.12,capacity:1.5,temperature:85,color:[230,187,234],fictional:true,description:'揮発溶媒の蒸気。55°C以下で凝縮する。'},
  {phase:'liquid',name:'抽出液',en:'EXTRACTANT',density:7,viscosity:18,conductivity:.25,capacity:2,temperature:20,color:[68,168,158],fictional:true,description:'水と混ざらない重い抽出液。抽出器で晶塩を取り込み、回収器で分離して繰り返し使える。'},
  {phase:'powder',name:'活性剤',en:'ACTIVATOR',density:5,viscosity:28,conductivity:.2,capacity:1.4,temperature:20,color:[244,181,103],fictional:true,description:'水に溶け、5〜180°CでAと反応。晶塩 1 + 活性剤 1 → 複合結晶 2。反応は弱く発熱する。'},
  {phase:'powder',name:'複合結晶',en:'COMPOSITE CRYSTAL',density:8,viscosity:32,conductivity:.15,capacity:1.4,temperature:20,color:[199,205,117],fictional:true,description:'晶塩と活性剤からできる不溶性結晶。選択膜で回収し、電力を使って220°Cで加熱再生できる。'},
  {phase:'gas',name:'酸素',en:'OXYGEN',density:-1,viscosity:1,conductivity:.15,capacity:1,temperature:20,color:[124,205,246],description:'燃焼で消費する有限の酸化剤。水の電気分解で再生できる。'},
  {phase:'gas',name:'二酸化炭素',en:'CARBON DIOXIDE',density:-.5,viscosity:3,conductivity:.1,capacity:.85,temperature:20,color:[163,178,165],description:'油や煤の燃焼生成物。燃焼を支えず、気体として移送・分離できる。'},
  {phase:'gas',name:'窒素',en:'NITROGEN',density:-1,viscosity:1,conductivity:.12,capacity:1,temperature:20,color:[126,142,161],description:'空気の不活性成分。燃焼で酸素だけが消費され、窒素は残る。'},
].map((m,i)=>({...m,id:MATERIAL_IDS[i]} as Material));
export type NodeKind = 'motor' | 'pin' | 'rect' | 'circle' | 'thermostat' | 'pump' | 'valve' | 'membrane' | 'processor';
export interface LabNode {
  id: number; kind: NodeKind; name: string; parent: number | null; joint: 'fixed' | 'free' | 'spring';
  anchorX?:number; anchorY?:number; jointOffset?:number; jointVelocity?:number; jointLimit?:number; stiffness?:number; damping?:number; jointContact?:boolean;
  lx: number; ly: number; la: number; width: number; height: number; radius: number;
  mode: 'rotation' | 'piston'; direction: number; speed: number; amp: number; strokeAngle: number;
  t: number; bounce: number; repeat: boolean; blocked: boolean;
  targetTemperature?: number; effectRadius?: number; enabled?: boolean;
  process?:Process;power?:number;energyUsed?:number;heatRemoved?:number;customPorts?:CustomPorts;
  flowRate?: number; portAngle?: number; portDistance?: number; filterMaterial?: number; deviceStatus?: string; transported?: number;
}
export interface Pose { x: number; y: number; a: number; ax: number; ay: number }
export interface Trapped { x: number; y: number; material: number; temperature: number; dx?: number; dy?: number; components?: Component[] }
export interface Snapshot {
  version: 4 | 5 | 6 | 7; materialIds?: string[]; chemistry?: ChemistrySnapshot; experimentTitle?: string; experimentDescription?: string; width: number; height: number; cells: number[]; temperature: number[]; terrain: number[];
  nodes: LabNode[]; nextId: number; viscosity: number[]; conductivity: number[]; trapped: Trapped[];
}
export const NODE_NAMES: Record<NodeKind,string> = {motor:'モーター',pin:'ピン',rect:'可動壁 · 矩形',circle:'可動壁 · 円',thermostat:'温度調整装置',pump:'ポンプ',valve:'バルブ',membrane:'選択膜',processor:'循環装置'};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export class Engine {
  cells = new Uint8Array(SIZE);
  temperature = new Float32Array(SIZE).fill(20);
  chemistry = new Chemistry(this);
  terrain = new Uint8Array(SIZE); // 1 wall, 2 guide
  occupancy = new Int32Array(SIZE);
  nodes: LabNode[] = [];
  experimentTitle='';
  experimentDescription='';
  nextId = 1;
  viscosity = MATERIALS.map(m => m.viscosity);
  conductivity = MATERIALS.map(m => m.conductivity);
  trapped: Trapped[] = [];
  history: Snapshot[] = [];
  tick = 0;
  revision = 0;
  editEpoch = 0;
  lost = 0;
  // Graph/guide indexes live for one physics step; edits may mutate nodes/terrain directly.
  private graph?:Map<number,LabNode>;
  private childrenIndex?:Map<number,LabNode[]>;
  private subtreeIndex=new Map<number,LabNode[]>();
  private guides?:Int32Array;
  private guidePrefix=new Int32Array((W+1)*(H+1));
  private preflightOccupancy=new Int32Array(SIZE);
  private thermalCapacity=new Float64Array(SIZE);
  private thermalConductivity=new Float64Array(SIZE);
  private prepareStep(){this.graph=new Map(this.nodes.map(n=>[n.id,n]));this.childrenIndex=new Map();this.subtreeIndex.clear();for(const n of this.nodes)if(n.parent!==null){const children=this.childrenIndex.get(n.parent)??[];children.push(n);this.childrenIndex.set(n.parent,children);}const prefix=this.guidePrefix;prefix.fill(0);for(let y=0;y<H;y++){let row=0;for(let x=0;x<W;x++){row+=this.terrain[y*W+x]===2?1:0;prefix[(y+1)*(W+1)+x+1]=prefix[y*(W+1)+x+1]+row;}}this.guides=prefix;}
  private descendants(id:number){if(!this.childrenIndex)return this.nodes.filter(n=>this.isDescendant(n.id,id));let cached=this.subtreeIndex.get(id);if(cached)return cached;const root=this.graph!.get(id);cached=root?[root]:[];for(let i=0;i<cached.length;i++)cached.push(...this.childrenIndex.get(cached[i].id)??[]);this.subtreeIndex.set(id,cached);return cached;}
  private nearGuide(n:LabNode,p:Pose){if(!this.guides)return true;const c=Math.abs(Math.cos(p.a)),s=Math.abs(Math.sin(p.a)),rx=n.kind==='circle'?n.radius:(c*n.width+s*n.height)/2,ry=n.kind==='circle'?n.radius:(s*n.width+c*n.height)/2;const left=clamp(Math.floor(p.x-rx),0,W),right=clamp(Math.ceil(p.x+rx)+1,0,W),top=clamp(Math.floor(p.y-ry),0,H),bottom=clamp(Math.ceil(p.y+ry)+1,0,H),a=this.guides;return a[bottom*(W+1)+right]-a[top*(W+1)+right]-a[bottom*(W+1)+left]+a[top*(W+1)+left]>0;}
  private moved = new Uint32Array(SIZE);
  private flowTick = 0;
  private heat = new Float32Array(SIZE);
  private targets = new Float32Array(SIZE);
  private weights = new Float32Array(SIZE);
  private seen = new Uint32Array(SIZE);
  private queue = new Int32Array(SIZE);
  private failedSpace = new Uint8Array(SIZE);
  private searchId = 0;
  private randomState = 123456789;
  random() { let x=this.randomState; x^=x<<13; x^=x>>>17; x^=x<<5; this.randomState=x; return (x>>>0)/4294967296; }
  index(x: number,y: number) { return x>=0 && x<W && y>=0 && y<H ? Math.floor(y)*W+Math.floor(x) : -1; }
  snapshot(): Snapshot { return {version:7,materialIds:[...MATERIAL_IDS],chemistry:this.chemistry.snapshot(),experimentTitle:this.experimentTitle,experimentDescription:this.experimentDescription,width:W,height:H,cells:Array.from(this.cells),temperature:Array.from(this.temperature),terrain:Array.from(this.terrain),nodes:structuredClone(this.nodes),nextId:this.nextId,viscosity:[...this.viscosity],conductivity:[...this.conductivity],trapped:structuredClone(this.trapped)}; }
  restore(s: Snapshot) {this.experimentTitle=s.experimentTitle??'';this.experimentDescription=s.experimentDescription??''; this.cells.set(s.cells); this.chemistry.restore(s.chemistry); this.temperature.set(s.temperature); this.terrain.set(s.terrain); this.nodes=structuredClone(s.nodes); this.nextId=s.nextId; this.viscosity=[...s.viscosity]; this.conductivity=[...s.conductivity]; this.trapped=structuredClone(s.trapped); this.rasterize(); this.revision++;this.editEpoch++; }
  checkpoint() { this.editEpoch++;this.history.push(this.snapshot()); if(this.history.length>40) this.history.shift(); }
  undo() { const s=this.history.pop(); if(s) this.restore(s); return !!s; }
  clear() {this.experimentTitle='';this.experimentDescription=''; this.chemistry.clear();this.cells.fill(0); this.temperature.fill(20); this.terrain.fill(0); this.nodes=[]; this.trapped=[]; this.occupancy.fill(0); this.nextId=1; this.revision++;this.editEpoch++; }
  load(raw: string): boolean {
    try {
      const s=JSON.parse(raw);
      if(![4,5,6,7].includes(s.version) || s.width!==W || s.height!==H) return false;
      for(const key of ['experimentTitle','experimentDescription'])if(s[key]!==undefined&&(typeof s[key]!=='string'||s[key].length>300))return false;
      const remap=(m:number)=>s.version===4?(Number.isInteger(m)&&m>=0&&m<11?m:-1):MATERIAL_IDS.indexOf(s.materialIds?.[m]);
      if(s.version>=5&&(!Array.isArray(s.materialIds)||(s.materialIds.length<1||s.materialIds.length>MATERIALS.length||s.materialIds[0]!=='air')||new Set(s.materialIds).size!==s.materialIds.length||s.materialIds.some((id:string)=>!MATERIAL_IDS.includes(id))))return false;
      if(s.version>=5){
        const c=s.chemistry;if(!c)return false;
        for(const key of ['amount','secondary','secondaryAmount','tertiary','tertiaryAmount'])if(!Array.isArray(c[key])||c[key].length!==SIZE)return false;
        for(let i=0;i<SIZE;i++){
          if(!finite(c.amount[i])||c.amount[i]<=0||c.amount[i]>1||!finite(c.secondaryAmount[i])||!finite(c.tertiaryAmount[i])||c.secondaryAmount[i]<0||c.tertiaryAmount[i]<0||!Number.isInteger(c.secondary[i])||!Number.isInteger(c.tertiary[i])||remap(c.secondary[i])<0||remap(c.tertiary[i])<0)return false;
          const ids=[s.cells?.[i],c.secondary[i],c.tertiary[i]].filter(Boolean);
          if(new Set(ids).size!==ids.length||(!c.secondary[i]&&c.secondaryAmount[i]!==0)||(!c.tertiary[i]&&c.tertiaryAmount[i]!==0)||(c.secondary[i]&&c.secondaryAmount[i]<=0)||(c.tertiary[i]&&c.tertiaryAmount[i]<=0)||(!s.cells?.[i]&&(c.secondary[i]||c.tertiary[i]))||c.amount[i]+c.secondaryAmount[i]+c.tertiaryAmount[i]>1.00001)return false;
        }
        c.secondary=c.secondary.map(remap);c.tertiary=c.tertiary.map(remap);
      }
      if(Array.isArray(s.cells))s.cells=s.cells.map(remap);
      if(!Array.isArray(s.cells)||s.cells.length!==SIZE||!s.cells.every((n: unknown)=>finite(n)&&Number.isInteger(n)&&n>=0&&n<MATERIALS.length)) return false;
      if(!Array.isArray(s.terrain)||s.terrain.length!==SIZE||!s.terrain.every((n: unknown)=>n===0||n===1||n===2)) return false;
      if(!Array.isArray(s.temperature)||s.temperature.length!==SIZE||!s.temperature.every((n: unknown)=>finite(n)&&n>=-273&&n<=5000)) return false;
      if(!Array.isArray(s.nodes)||s.nodes.length>1000 || !finite(s.nextId)) return false;
      const ids=new Set<number>();
      for(const n of s.nodes) {
        if(!Number.isSafeInteger(n.id)||n.id<1||ids.has(n.id)||!['motor','pin','rect','circle','thermostat','pump','valve','membrane','processor'].includes(n.kind)||!['fixed','free','spring'].includes(n.joint)||typeof n.name!=='string'||n.name.length>100) return false;
        if(n.kind==='thermostat'&&(!finite(n.targetTemperature)||n.targetTemperature< -273||n.targetTemperature>2000||!finite(n.effectRadius)||n.effectRadius<1||n.effectRadius>40||typeof n.enabled!=='boolean'))return false;
        if(['pump','valve','membrane','processor'].includes(n.kind)){
          if(!finite(n.flowRate)||n.flowRate<0||n.flowRate>10||!finite(n.portAngle)||n.portAngle<0||n.portAngle>360||!finite(n.portDistance)||n.portDistance<2||n.portDistance>30||!Number.isInteger(n.filterMaterial)||remap(n.filterMaterial)<0||typeof n.enabled!=='boolean')return false;
          if(n.transported!==undefined&&(!finite(n.transported)||n.transported<0)||n.deviceStatus!==undefined&&(typeof n.deviceStatus!=='string'||n.deviceStatus.length>100))return false;
          n.filterMaterial=remap(n.filterMaterial);
        }
        for(const [key,min,max] of [['anchorX',-2000,2000],['anchorY',-2000,2000],['jointOffset',-Math.PI,Math.PI],['jointVelocity',-100,100],['jointLimit',0,Math.PI],['stiffness',0,80],['damping',0,30]] as const)if(n[key]!==undefined&&(!finite(n[key])||n[key]<min||n[key]>max))return false;
        if(n.kind==='processor'){
          if(!Object.hasOwn(PROCESSES,n.process)||!finite(n.power)||n.power<0||n.power>100000)return false;
          for(const key of ['energyUsed','heatRemoved'])if(!finite(n[key])||n[key]<0)return false;

        }
        if(n.customPorts){for(const key of ['input','output','aux']){const p=n.customPorts[key];if(!p||!finite(p.x)||!finite(p.y)||Math.abs(p.x)>2000||Math.abs(p.y)>2000)return false;}}
        ids.add(n.id);
        for(const k of ['lx','ly','la','width','height','radius','speed','amp','strokeAngle','t','direction','bounce']) if(!finite(n[k])) return false;
        if(Math.abs(n.lx)>2000||Math.abs(n.ly)>2000||n.width<1||n.width>W||n.height<1||n.height>H||n.radius<.5||n.radius>300||n.speed<0||n.speed>10||n.amp<0||n.amp>240||n.t<0||n.t>1||![-1,0,1].includes(n.direction)||![-1,1].includes(n.bounce)||!['rotation','piston'].includes(n.mode)||typeof n.repeat!=='boolean') return false;
        if(n.kind==='rect' && n.width*n.height>40000 || n.kind==='circle' && Math.PI*n.radius*n.radius>40000) return false;
      }
      const map=new Map<number,LabNode>(s.nodes.map((n:LabNode)=>[n.id,n]));
      for(const n of s.nodes) {
        const chain=new Set([n.id]); let p=n.parent;
        while(p!==null) { if(!ids.has(p)||chain.has(p)) return false; chain.add(p); p=map.get(p)!.parent; }
      }
      for(const [key,max] of [['viscosity',100],['conductivity',1]] as const){
        if(!Array.isArray(s[key])||s[key].length!==(s.version===4?11:s.materialIds.length)||!s[key].every((n:unknown)=>finite(n)&&n>=0&&n<=max))return false;
        const values=MATERIALS.map(m=>key==='viscosity'?m.viscosity:m.conductivity);s[key].forEach((v:number,i:number)=>{values[remap(i)]=v;});s[key]=values;
      }
      if(!Array.isArray(s.trapped)||s.trapped.length>SIZE||!s.trapped.every((p:Trapped)=>finite(p.x)&&finite(p.y)&&finite(p.temperature)&&p.temperature>=-273&&p.temperature<=5000&&Number.isInteger(p.material)&&p.material>0&&p.material<MATERIALS.length&&(p.dx===undefined&&p.dy===undefined||finite(p.dx)&&finite(p.dy)&&Math.abs(p.dx)+Math.abs(p.dy)===1&&Number.isInteger(p.dx)&&Number.isInteger(p.dy)))) return false;
      for(const p of s.trapped){
        p.material=remap(p.material);
        if(p.components){if(!Array.isArray(p.components)||p.components.length>3||!p.components.every((c:Component)=>Number.isInteger(c.material)&&remap(c.material)>0&&finite(c.amount)&&c.amount>0&&c.amount<=1)||p.components.reduce((sum:number,c:Component)=>sum+c.amount,0)>1.00001)return false;p.components=p.components.map((c:Component)=>({...c,material:remap(c.material)}));}
      }
      if(!Number.isSafeInteger(s.nextId)||s.nextId<=Math.max(0,...ids)) return false;
      if(s.version<6 || s.nodes.some((n:LabNode)=>n.kind==='pin')){
        const legacy=new Engine();legacy.nodes=structuredClone(s.nodes);const old=legacy.poses();
        for(const n of s.nodes as LabNode[]){if(n.kind==='pin')continue;const pose=old.get(n.id)!;let pivot=pose;let parent=n.parent;
          while(parent!==null&&map.get(parent)?.kind==='pin'){pivot=old.get(parent)!;if(map.get(parent)!.joint==='free')n.joint='free';parent=map.get(parent)!.parent;}
          n.parent=parent;n.anchorX=Math.cos(pose.a)*(pivot.x-pose.x)+Math.sin(pose.a)*(pivot.y-pose.y);n.anchorY=-Math.sin(pose.a)*(pivot.x-pose.x)+Math.cos(pose.a)*(pivot.y-pose.y);
          legacy.setWorld(n,pose.x,pose.y,pose.a,old);
        }s.nodes=s.nodes.filter((n:LabNode)=>n.kind!=='pin');
      }
      this.restore(s); this.history=[]; return true;
    } catch { return false; }
  }
  poses(): Map<number,Pose> {
    const result=new Map<number,Pose>(); const map=this.graph??new Map(this.nodes.map(n=>[n.id,n]));
    const visit=(n:LabNode):Pose=> {
      const cached=result.get(n.id); if(cached) return cached;
      const parent=n.parent===null?undefined:map.get(n.parent);
      const p=parent?visit(parent):{x:0,y:0,a:0,ax:0,ay:0};
      const c=Math.cos(p.a),s=Math.sin(p.a);
      const jx=p.ax+c*n.lx-s*n.ly, jy=p.ay+s*n.lx+c*n.ly;
      const a=n.joint==='free'?n.la:p.a+n.la+(n.joint==='spring'?(n.jointOffset??0):0);
      const x=jx-Math.cos(a)*(n.anchorX??0)+Math.sin(a)*(n.anchorY??0),y=jy-Math.sin(a)*(n.anchorX??0)-Math.cos(a)*(n.anchorY??0);
      const stroke=a+n.strokeAngle;
      const piston=n.kind==='motor'&&n.mode==='piston';
      const pose={x,y,a,ax:x+(piston?Math.cos(stroke)*n.amp*n.t:0),ay:y+(piston?Math.sin(stroke)*n.amp*n.t:0)};
      result.set(n.id,pose); return pose;
    };
    for(const n of this.nodes) visit(n); return result;
  }
  setWorld(n: LabNode,x: number,y: number,a: number, poses=this.poses()) {
    const p=n.parent===null?undefined:poses.get(n.parent);
    const px=p?.ax??0,py=p?.ay??0,pa=p?.a??0,c=Math.cos(pa),s=Math.sin(pa);
    x+=Math.cos(a)*(n.anchorX??0)-Math.sin(a)*(n.anchorY??0);y+=Math.sin(a)*(n.anchorX??0)+Math.cos(a)*(n.anchorY??0);
    n.lx=c*(x-px)+s*(y-py); n.ly=-s*(x-px)+c*(y-py); n.la=n.joint==='free'?a:a-pa-(n.jointOffset??0)*(n.joint==='spring'?1:0);
  }
  isDescendant(id:number,ancestor:number) { const map=this.graph??new Map(this.nodes.map(n=>[n.id,n]));let n=map.get(id);while(n){if(n.id===ancestor)return true;n=n.parent===null?undefined:map.get(n.parent);}return false; }
  reparent(id: number,parent: number|null) {
    const n=this.nodes.find(n=>n.id===id); if(!n||parent!==null&&(!this.nodes.some(n=>n.id===parent)||this.isDescendant(parent,id))) return false;
    const poses=this.poses(),p=poses.get(id)!; n.parent=parent; this.setWorld(n,p.x,p.y,p.a,poses);
    if(parent!==null){const target=poses.get(parent)!,body=this.nodes.find(c=>c.id===parent)!;let x=target.ax,y=target.ay;
      if(body.kind==='rect'){const dx=p.x-target.x,dy=p.y-target.y,c=Math.cos(target.a),s=Math.sin(target.a),u=clamp(c*dx+s*dy,-body.width/2,body.width/2),v=clamp(-s*dx+c*dy,-body.height/2,body.height/2);x=target.x+c*u-s*v;y=target.y+s*u+c*v;}
      if(body.kind==='circle'){const d=Math.hypot(p.x-target.x,p.y-target.y),r=Math.min(d,body.radius);if(d){x=target.x+(p.x-target.x)*r/d;y=target.y+(p.y-target.y)*r/d;}}
      this.setJointAnchor(id,x,y);
    }this.revision++;this.editEpoch++; return true;
  }
  setJoint(id:number,joint:'fixed'|'free'|'spring') { const n=this.nodes.find(n=>n.id===id); if(!n)return; const poses=this.poses(),p=poses.get(id)!; n.joint=joint;n.jointOffset=0;n.jointVelocity=0; this.setWorld(n,p.x,p.y,p.a,poses); this.revision++;this.editEpoch++; }
  jointPoint(id:number,poses=this.poses()){const n=this.nodes.find(n=>n.id===id)!,p=poses.get(id)!;return {x:p.x+Math.cos(p.a)*(n.anchorX??0)-Math.sin(p.a)*(n.anchorY??0),y:p.y+Math.sin(p.a)*(n.anchorX??0)+Math.cos(p.a)*(n.anchorY??0)};}
  setJointAnchor(id:number,x:number,y:number){const n=this.nodes.find(n=>n.id===id);if(!n)return;const poses=this.poses(),p=poses.get(id)!;n.anchorX=Math.cos(p.a)*(x-p.x)+Math.sin(p.a)*(y-p.y);n.anchorY=-Math.sin(p.a)*(x-p.x)+Math.cos(p.a)*(y-p.y);this.setWorld(n,p.x,p.y,p.a,poses);this.revision++;this.editEpoch++;}
  private guideScore(nodes:LabNode[]){let score=0;const poses=this.poses();for(const n of nodes)if((n.kind==='rect'||n.kind==='circle')&&this.nearGuide(n,poses.get(n.id)!))this.shapeCells(n,poses.get(n.id)!,i=>{if(this.terrain[i]===2)score++;});return score;}
  private guideCollision(nodes:LabNode[]){const poses=this.poses();return nodes.some(n=>{if(n.kind!=='rect'&&n.kind!=='circle')return false;const p=poses.get(n.id)!;const c=Math.abs(Math.cos(p.a)),s=Math.abs(Math.sin(p.a)),rx=n.kind==='circle'?n.radius:(c*n.width+s*n.height)/2,ry=n.kind==='circle'?n.radius:(s*n.width+c*n.height)/2;let hit=p.x-rx<0||p.x+rx>W||p.y-ry<0||p.y+ry>H;if(this.nearGuide(n,p))this.shapeCells(n,p,i=>{if(this.terrain[i]===2)hit=true;});return hit;});}
  private relaxJoints(dt:number){for(const n of this.nodes){n.jointContact=false;if(n.joint!=='spring')continue;const old=n.jointOffset??0,v=(n.jointVelocity??0)+(-(n.stiffness??18)*old-(n.damping??8)*(n.jointVelocity??0))*dt,target=clamp(old+v*dt,-(n.jointLimit??Math.PI/2),n.jointLimit??Math.PI/2);if(target===old&&v===0)continue;const children=this.descendants(n.id);const steps=Math.max(1,Math.ceil(Math.abs(target-old)*400));let safe=old;for(let i=1;i<=steps;i++){n.jointOffset=old+(target-old)*i/steps;if(this.guideCollision(children)){n.jointOffset=safe;n.jointContact=true;break;}safe=n.jointOffset;}n.jointVelocity=n.jointContact?0:v;}}
  private bendAtGuides(nodes:LabNode[]){
    for(let pass=0;pass<nodes.length;pass++){if(!this.guideCollision(nodes))return true;let resolved=false;
      for(const n of [...nodes].reverse().filter(n=>n.joint!=='fixed'&&n.kind!=='motor')){const children=this.descendants(n.id);if(!this.guideCollision(children))continue;const key=n.joint==='free'?'la':'jointOffset',old=n[key]??0,limit=n.jointLimit??Math.PI/2;let found=false;
        const initial=this.guideScore(children),blocked=new Set<number>();
        for(let i=1;i<=80&&!found;i++)for(const sign of [1,-1]){if(blocked.has(sign))continue;const value=old+sign*i*.005;if(n.joint==='spring'&&Math.abs(value)>limit)continue;n[key]=value;if(this.guideScore(children)>initial+1){blocked.add(sign);continue;}if(!this.guideCollision(children)){found=true;break;}}
        if(!found)n[key]=old;else{n.jointContact=true;n.jointVelocity=0;resolved=true;break;}
      }if(!resolved)return false;
    }return !this.guideCollision(nodes);
  }
  detach(id:number) { for(const n of this.nodes.filter(n=>n.parent===id)) this.reparent(n.id,null); this.rasterize(); }
  connect(id:number) {
    const pin=this.nodes.find(n=>n.id===id&&n.kind==='pin'); if(!pin)return false;
    const poses=this.poses(),p=poses.get(id)!;
    const motor=this.nodes.find(n=>n.kind==='motor'&&Math.floor(poses.get(n.id)!.x)===Math.floor(p.x)&&Math.floor(poses.get(n.id)!.y)===Math.floor(p.y));
    if(motor) this.reparent(id,motor.id);
    let connected=false;
    for(const n of this.nodes.filter(n=>n.kind==='rect'||n.kind==='circle')) if(this.contains(n,poses.get(n.id)!,p.x,p.y)) connected=this.reparent(n.id,id)||connected;
    this.rasterize(); return connected;
  }
  delete(ids:Set<number>) {
    const poses=this.poses();
    for(const n of this.nodes) if(!ids.has(n.id) && n.parent!==null && ids.has(n.parent)) {
      let parent:number|null=n.parent;
      while(parent!==null&&ids.has(parent)) parent=this.nodes.find(p=>p.id===parent)?.parent??null;
      const p=poses.get(n.id)!; n.parent=parent; this.setWorld(n,p.x,p.y,p.a,poses);
    }
    this.nodes=this.nodes.filter(n=>!ids.has(n.id)); this.revision++;this.editEpoch++; this.rasterize();
  }
  move(ids:Set<number>,dx:number,dy:number,original:Map<number,Pose>) {
    const roots=this.nodes.filter(n=>{
      if(!ids.has(n.id))return false;
      let parent=n.parent;
      while(parent!==null){if(ids.has(parent))return false;parent=this.nodes.find(p=>p.id===parent)?.parent??null;}
      return true;
    });
    const before=this.poses(),locals=roots.map(n=>({n,lx:n.lx,ly:n.ly,la:n.la}));
    const moving=this.nodes.filter(n=>roots.some(r=>this.isDescendant(n.id,r.id)));
    let travel=0;for(const n of roots){const a=before.get(n.id)!,b=original.get(n.id)!;travel=Math.max(travel,Math.hypot(b.x+dx-a.x,b.y+dy-a.y));}
    const steps=Math.max(1,Math.ceil(travel/.75));
    for(let step=1;step<=steps;step++){
      for(const n of roots){const a=before.get(n.id)!,b=original.get(n.id)!,f=step/steps;this.setWorld(n,a.x+(b.x+dx-a.x)*f,a.y+(b.y+dy-a.y)*f,b.a,before);}
      const poses=this.poses();let collision=false;
      for(const n of moving.filter(n=>n.kind==='rect'||n.kind==='circle'))this.shapeCells(n,poses.get(n.id)!,(i)=>{if(this.terrain[i]===2)collision=true;});
      if(collision){for(const {n,lx,ly,la} of locals)Object.assign(n,{lx,ly,la});this.rasterize();this.revision++;this.editEpoch++;return false;}
    }
    this.rasterize(before);this.revision++;this.editEpoch++;return true;
  }
  add(kind:NodeKind,x:number,y:number,width=1,height=1,radius=1):LabNode|null {
    if(kind==='rect'&&width*height>40000||kind==='circle'&&Math.PI*radius*radius>40000)return null;
    const poses=this.poses();
    if(kind==='motor') { const existing=this.nodes.find(n=>n.kind==='motor'&&Math.floor(poses.get(n.id)!.x)===Math.floor(x)&&Math.floor(poses.get(n.id)!.y)===Math.floor(y)); if(existing)return existing; }
    if(this.nodes.length>=1000)return null;
    const n:LabNode={id:this.nextId++,kind,name:NODE_NAMES[kind],parent:null,joint:'fixed',lx:x,ly:y,la:0,width,height,radius,mode:'rotation',direction:1,speed:1,amp:40,strokeAngle:Math.PI,t:0,bounce:1,repeat:true,blocked:false};
    if(['pump','valve','membrane','processor'].includes(kind)){n.flowRate=2;n.portAngle=0;n.portDistance=6;n.filterMaterial=kind==='membrane'?1:0;n.enabled=true;n.deviceStatus='待機中';n.transported=0;}
    if(kind==='processor'){n.name='電解槽';n.process='electrolysis';n.power=1200;n.energyUsed=0;n.heatRemoved=0;n.flowRate=1;}
    if(kind==='thermostat'){n.targetTemperature=100;n.effectRadius=12;n.enabled=true;}
    if(kind==='pin') {
      const parent=this.nodes.find(p=>p.kind==='motor'&&Math.floor(poses.get(p.id)!.x)===Math.floor(x)&&Math.floor(poses.get(p.id)!.y)===Math.floor(y))??[...this.nodes].reverse().find(p=>(p.kind==='rect'||p.kind==='circle')&&this.contains(p,poses.get(p.id)!,x,y));
      if(parent) {n.parent=parent.id; this.setWorld(n,x,y,0,poses);}
    }
    this.nodes.push(n); this.rasterize(); this.revision++;this.editEpoch++; return n;
  }
  contains(n:LabNode,p:Pose,x:number,y:number) {
    const dx=x-p.x,dy=y-p.y,c=Math.cos(p.a),s=Math.sin(p.a),lx=c*dx+s*dy,ly=-s*dx+c*dy;
    return n.kind==='rect'?Math.abs(lx)<=n.width/2&&Math.abs(ly)<=n.height/2:n.kind==='circle'?dx*dx+dy*dy<=n.radius*n.radius:Math.hypot(dx,dy)<3;
  }
  hit(x:number,y:number):LabNode|undefined { const poses=this.poses(); return [...this.nodes].reverse().filter(n=>n.kind==='pin'||n.kind==='motor'||n.kind==='thermostat'||n.kind==='pump'||n.kind==='valve'||n.kind==='membrane'||n.kind==='processor').find(n=>this.contains(n,poses.get(n.id)!,x,y))??[...this.nodes].reverse().find(n=>this.contains(n,poses.get(n.id)!,x,y)); }
  shapeCells(n:LabNode,p:Pose,fn:(i:number,x:number,y:number)=>void) {
    if(n.kind==='valve'&&!n.enabled){const a=p.a+(n.portAngle??0)*Math.PI/180;for(let k=-3;k<=3;k++)for(let offset=-1;offset<=1;offset++){const x=Math.floor(p.x-Math.sin(a)*k+Math.cos(a)*offset),y=Math.floor(p.y+Math.cos(a)*k+Math.sin(a)*offset),i=this.index(x,y);if(i>=0)fn(i,x,y);}return;}
    if(n.kind==='motor') {const i=this.index(p.x,p.y);if(i>=0)fn(i,Math.floor(p.x),Math.floor(p.y));return;}
    if(n.kind==='pin'||n.kind==='thermostat'||n.kind==='pump'||n.kind==='valve'||n.kind==='membrane'||n.kind==='processor')return;
    const cos=Math.cos(p.a),sin=Math.sin(p.a),c=Math.abs(cos),s=Math.abs(sin);
    const rx=n.kind==='circle'?n.radius:(c*n.width+s*n.height)/2,ry=n.kind==='circle'?n.radius:(s*n.width+c*n.height)/2;
    for(let y=Math.max(0,Math.floor(p.y-ry));y<=Math.min(H-1,Math.ceil(p.y+ry));y++)for(let x=Math.max(0,Math.floor(p.x-rx));x<=Math.min(W-1,Math.ceil(p.x+rx));x++) {const dx=x+.5-p.x,dy=y+.5-p.y;if(n.kind==='circle'?dx*dx+dy*dy<=n.radius*n.radius:Math.abs(cos*dx+sin*dy)<=n.width/2&&Math.abs(-sin*dx+cos*dy)<=n.height/2)fn(y*W+x,x,y);}
  }
  private free(i:number) { return i>=0 && !this.cells[i] && this.terrain[i]!==1 && !this.occupancy[i]; }
  private findSpace(x:number,y:number,dx:number,dy:number):number {
    // Find the leading surface, then search only its connected space. A wall is never crossed by BFS.
    let cx=clamp(Math.floor(x),0,W-1),cy=clamp(Math.floor(y),0,H-1),i=cy*W+cx;
    for(let j=0;j<W&&this.occupancy[i];j++) {cx+=dx;cy+=dy; i=this.index(cx,cy);if(i<0)return -1;}
    if(this.terrain[i]===1)return -1;
    if(this.free(i))return i;
    const directionBit=dx===1?1:dx===-1?2:dy===1?4:8;
    if(this.failedSpace[i]&directionBit)return -1;
    const stamp=++this.searchId; let head=0,tail=1;this.queue[0]=i;this.seen[i]=stamp;
    while(head<tail && head<4096) {
      const q=this.queue[head++],qx=q%W,qy=Math.floor(q/W);
      for(const [sx,sy] of [[dx,dy],[-dy,dx],[dy,-dx],[-dx,-dy]]) {
        if((qx+sx-cx)*dx+(qy+sy-cy)*dy<0)continue;
        const next=this.index(qx+sx,qy+sy);if(next<0||this.seen[next]===stamp||this.terrain[next]===1||this.occupancy[next])continue;
        this.seen[next]=stamp;if(this.free(next))return next;this.queue[tail++]=next;
      }
    }
    if(head===tail)for(let k=0;k<tail;k++)this.failedSpace[this.queue[k]]|=directionBit;
    else this.failedSpace[i]|=directionBit;
    return -1;
  }
  rasterize(previous?:Map<number,Pose>) {
    if(!this.graph)this.editEpoch++;
    const poses=this.poses();
    if(previous&&!this.trapped.length&&this.nodes.every(n=>{if(!['motor','rect','circle','valve'].includes(n.kind))return true;const a=previous.get(n.id),b=poses.get(n.id)!;return !!a&&a.x===b.x&&a.y===b.y&&(n.kind==='motor'||n.kind==='circle'||a.a===b.a);}))return;
    const occupied:number[]=[];this.occupancy.fill(0);this.failedSpace.fill(0);
    for(const n of this.nodes) this.shapeCells(n,poses.get(n.id)!,(i)=>{if(!this.occupancy[i])occupied.push(i);this.occupancy[i]=n.id;});
    const pending:Trapped[]=[];
    for(const i of occupied.sort((a,b)=>a-b)) if(this.cells[i]) {
      const x=i%W,y=Math.floor(i/W),p=poses.get(this.occupancy[i])!,old=previous?.get(this.occupancy[i]);
      let vx=1,vy=0;
      if(old) { const c=Math.cos(old.a-p.a),s=Math.sin(old.a-p.a),rx=x+.5-p.x,ry=y+.5-p.y; vx=x+.5-(old.x+c*rx-s*ry);vy=y+.5-(old.y+s*rx+c*ry); }
      const dx=Math.abs(vx)>=Math.abs(vy)?(vx>=0?1:-1):0,dy=dx===0?(vy>=0?1:-1):0;
      let dest=this.findSpace(x,y,dx,dy); if(dest<0)dest=this.findSpace(x,y,-dx,-dy);
      if(dest>=0){this.cells[dest]=this.cells[i];this.chemistry.move(i,dest);this.temperature[dest]=this.temperature[i];}
      else pending.push({x,y,material:this.cells[i],temperature:this.temperature[i],dx,dy,components:this.chemistry.components(i)});
      this.cells[i]=0;this.chemistry.reset(i);this.temperature[i]=20;
    }
    // Completely sealed particles remain buffered, never silently destroyed.
    for(const particle of this.trapped) {
      const dx=particle.dx??1,dy=particle.dy??0;
      let dest=this.findSpace(particle.x,particle.y,dx,dy);
      for(const [sx,sy] of [[-dx,-dy],[-dy,dx],[dy,-dx]])if(dest<0)dest=this.findSpace(particle.x,particle.y,sx,sy);
      if(dest>=0){this.chemistry.write(dest,particle.components??[{material:particle.material,amount:1}],particle.temperature);}else pending.push(particle);
    }
    this.trapped=pending;
  }
  paint(x:number,y:number,r:number,material:number,overwrite=false,erase=false) {
    for(let py=Math.max(0,Math.floor(y-r));py<=Math.min(H-1,Math.ceil(y+r));py++)for(let px=Math.max(0,Math.floor(x-r));px<=Math.min(W-1,Math.ceil(x+r));px++){
      if((px-x)**2+(py-y)**2>r*r)continue; const i=py*W+px;
      if(erase) {this.chemistry.reset(i);this.cells[i]=0;this.terrain[i]=0;this.temperature[i]=20;}
      else if(!this.occupancy[i]&&(overwrite||this.terrain[i]===0)) {if(overwrite)this.terrain[i]=0;this.cells[i]=material;this.chemistry.reset(i);this.temperature[i]=MATERIALS[material].temperature;if(material===0)this.chemistry.write(i,[{material:19,amount:.77},{material:17,amount:.23}],20);}
    }
    if(erase){const poses=this.poses();this.delete(new Set(this.nodes.filter(n=>(n.kind==='motor'||n.kind==='pin'||n.kind==='thermostat'||n.kind==='pump'||n.kind==='valve'||n.kind==='membrane'||n.kind==='processor')&&Math.hypot(poses.get(n.id)!.x-x,poses.get(n.id)!.y-y)<=r).map(n=>n.id)));}
  }
  terrainShape(x0:number,y0:number,x1:number,y1:number,type:1|2,circle=false) {
    const radius=Math.hypot(x1-x0,y1-y0);
    const left=circle?x0-radius:Math.min(x0,x1),right=circle?x0+radius:Math.max(x0,x1),top=circle?y0-radius:Math.min(y0,y1),bottom=circle?y0+radius:Math.max(y0,y1);
    for(let y=Math.max(0,Math.floor(top));y<=Math.min(H-1,Math.floor(bottom));y++)for(let x=Math.max(0,Math.floor(left));x<=Math.min(W-1,Math.floor(right));x++) {
      if(circle&&(x-x0)**2+(y-y0)**2>radius*radius)continue;
      const i=y*W+x;this.terrain[i]=type;if(type===1){this.cells[i]=0;this.chemistry.reset(i);this.temperature[i]=20;}
    }
  }
  private canDisplace(previous:Map<number,Pose>){
    const old=this.occupancy,poses=this.poses(),reserved:number[]=[],occupied:number[]=[];this.occupancy=this.preflightOccupancy;this.occupancy.fill(0);this.failedSpace.fill(0);
    for(const n of this.nodes)this.shapeCells(n,poses.get(n.id)!,(i)=>{if(!this.occupancy[i])occupied.push(i);this.occupancy[i]=n.id;});
    let possible=true;
    for(const i of occupied.sort((a,b)=>a-b))if(this.cells[i]){
      const p=poses.get(this.occupancy[i])!,before=previous.get(this.occupancy[i]);const vx=p.x-(before?.x??p.x),vy=p.y-(before?.y??p.y);
      const dx=Math.abs(vx)>=Math.abs(vy)?(vx>=0?1:-1):0,dy=dx?0:(vy>=0?1:-1);
      let j=this.findSpace(i%W,Math.floor(i/W),dx,dy);if(j<0)j=this.findSpace(i%W,Math.floor(i/W),-dx,-dy);
      if(j<0){possible=false;break;}this.cells[j]=this.cells[i];reserved.push(j);
    }
    for(const j of reserved)this.cells[j]=0;this.preflightOccupancy=this.occupancy;this.occupancy=old;this.failedSpace.fill(0);return possible;
  }
  private drive(dt:number) {
    for(const n of this.nodes.filter(n=>n.kind==='motor')) {
      n.blocked=false;if(!n.direction||!n.speed)continue;
      const start={la:n.la,t:n.t,bounce:n.bounce,direction:n.direction};
      // Each step sweeps every descendant with <= 0.75 cell travel; thin guides cannot be skipped.
      const descendants=this.descendants(n.id),flex=descendantState(descendants);
      const poses=this.poses(),origin=poses.get(n.id)!;
      let extent=1;for(const c of descendants){const p=poses.get(c.id)!;extent=Math.max(extent,Math.hypot(p.x-origin.ax,p.y-origin.ay)+Math.hypot(c.width,c.height)/2+c.radius);}
      const distance=n.mode==='rotation'?n.speed*dt*extent:n.speed*dt*Math.max(1,n.amp)*.5;
      const substeps=Math.max(1,Math.ceil(distance/.75));
      let collision=false;
      const trajectory:{motor:{la:number;t:number;bounce:number;direction:number};flex:ReturnType<typeof descendantState>}[]=[];
      for(let step=0;step<substeps;step++) {
        if(n.mode==='rotation')n.la+=n.direction*n.speed*dt/substeps;
        else {
          n.t+=n.direction*(n.repeat?n.bounce:1)*n.speed*dt*.5/substeps;
          if(n.t>1||n.t<0) {if(n.repeat){n.t=clamp(n.t<0?-n.t:2-n.t,0,1);n.bounce*=-1;}else{n.t=clamp(n.t,0,1);n.direction=0;}}
        }
        collision=!this.bendAtGuides(descendants);
        if(collision)break;
        trajectory.push({motor:{la:n.la,t:n.t,bounce:n.bounce,direction:n.direction},flex:descendantState(descendants)});
      }
      if(!collision&&!this.canDisplace(poses))collision=true;
      if(collision){Object.assign(n,start);restoreJoints(this.nodes,flex);n.blocked=true;}
      else if(substeps>1){
        Object.assign(n,start);restoreJoints(this.nodes,flex);
        for(const state of trajectory){const before=this.poses();Object.assign(n,state.motor);restoreJoints(this.nodes,state.flex);this.rasterize(before);}
      }
    }
  }
  devicePorts(n:LabNode,poses=this.poses()){const p=poses.get(n.id)!;if(n.customPorts){const point=(v:{x:number;y:number})=>({x:p.x+Math.cos(p.a)*v.x-Math.sin(p.a)*v.y,y:p.y+Math.sin(p.a)*v.x+Math.cos(p.a)*v.y});return {input:point(n.customPorts.input),output:point(n.customPorts.output)};}const a=p.a+(n.portAngle??0)*Math.PI/180,d=n.portDistance??6;return {input:{x:p.x-Math.cos(a)*d,y:p.y-Math.sin(a)*d},output:{x:p.x+Math.cos(a)*d,y:p.y+Math.sin(a)*d}};}
  private runDevices(dt:number){
    const poses=this.poses();
    for(const n of this.nodes.filter(n=>['pump','valve','membrane'].includes(n.kind))){
      if(!n.enabled){n.deviceStatus=n.kind==='valve'?'閉鎖':'停止';continue;}
      if((n.flowRate??2)<=0){n.deviceStatus='流量0';continue;}
      const ports=this.devicePorts(n,poses),i=this.index(ports.input.x,ports.input.y),j=this.index(ports.output.x,ports.output.y);
      if(i<0||j<0){n.deviceStatus='入口・出口が盤面外';continue;}
      if(this.terrain[i]===1||this.occupancy[i]||!this.chemistry.free(j)){n.deviceStatus='入口・出口が遮断';continue;}
      if(n.kind!=='membrane'&&['solid','powder'].includes(MATERIALS[this.cells[i]].phase)){n.deviceStatus='固体は移送不可';continue;}
      const available=n.kind==='membrane'?this.chemistry.quantity(i,n.filterMaterial??1):this.chemistry.mass(i);
      if(available<1e-6){n.deviceStatus=n.kind==='membrane'?'指定成分が不足':'材料不足';continue;}
      const q=this.chemistry.transfer(i,j,(n.flowRate??2)*dt,n.kind==='membrane'?(n.filterMaterial??1):0);
      n.deviceStatus=q>0?'移送中':'出口満杯・成分非対応';n.transported=(n.transported??0)+q;
    }
    runProcesses(this,dt,poses);
  }
  private applyThermostats() {
    const devices=this.nodes.filter(n=>n.kind==='thermostat'&&n.enabled);
    if(!devices.length)return;
    this.targets.fill(0);this.weights.fill(0);const poses=this.poses();
    for(const n of devices){
      const p=poses.get(n.id)!,radius=clamp(n.effectRadius??12,1,40),target=clamp(n.targetTemperature??100,-273,2000);
      for(let y=Math.max(0,Math.floor(p.y-radius));y<=Math.min(H-1,Math.ceil(p.y+radius));y++)for(let x=Math.max(0,Math.floor(p.x-radius));x<=Math.min(W-1,Math.ceil(p.x+radius));x++){
        const distance=Math.hypot(x+.5-p.x,y+.5-p.y);if(distance>radius)continue;
        const i=y*W+x,weight=1-distance/(radius+1);
        this.targets[i]+=target*weight;this.weights[i]+=weight;
      }
    }
    // Combine overlapping devices before applying heat, so order cannot change the result.
    for(let i=0;i<SIZE;i++)if(this.weights[i]){
      const target=this.targets[i]/this.weights[i];
      this.temperature[i]+=(target-this.temperature[i])*(1-Math.exp(-.06*this.weights[i]));
    }
  }
  private thermal() {
    this.heat.fill(0);this.thermalCapacity.fill(0);this.thermalConductivity.fill(0);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++) {
      const i=y*W+x;
      for(let axis=0;axis<2;axis++) {
        const j=axis===0?(x<W-1?i+1:-1):(y<H-1?i+W:-1);
        if(j<0)continue;
        const difference=this.temperature[j]-this.temperature[i];if(difference===0)continue;
        const ki=this.thermalConductivity[i]||(this.thermalConductivity[i]=this.terrain[i]||this.occupancy[i] ? .08:this.chemistry.conductivity(i));
        const kj=this.thermalConductivity[j]||(this.thermalConductivity[j]=this.terrain[j]||this.occupancy[j] ? .08:this.chemistry.conductivity(j));
        const k=Math.min(ki,kj)*.11;
        const ci=this.thermalCapacity[i]||(this.thermalCapacity[i]=this.terrain[i]||this.occupancy[i]?2:this.chemistry.capacity(i)),cj=this.thermalCapacity[j]||(this.thermalCapacity[j]=this.terrain[j]||this.occupancy[j]?2:this.chemistry.capacity(j));
        const q=difference*Math.min(k,.2*Math.min(ci,cj));
        this.heat[i]+=q/ci;this.heat[j]-=q/cj;
      }
    }
    for(let i=0;i<SIZE;i++) {
      this.temperature[i]+=this.heat[i];
      if(!this.cells[i]&&!this.terrain[i])this.temperature[i]+=(20-this.temperature[i])*.003;
    }
    this.applyThermostats();
    this.chemistry.phaseChanges();
  }
  private flow() {
    const stamp=++this.flowTick,reverse=stamp%2===0;
    const tryMove=(i:number,j:number,vertical:number)=> {
      if(j<0||this.terrain[j]===1||this.occupancy[j]||this.moved[j]===stamp)return false;
      const a=this.cells[i],b=this.cells[j];
      if(a===b&&b&&this.chemistry.mass(j)<.99999){const q=this.chemistry.transfer(i,j,this.chemistry.mass(i));if(q>0){this.moved[i]=stamp;this.moved[j]=stamp;return true;}}
      if(b && (MATERIALS[b].phase==='solid'||this.chemistry.viscosity(j)===100||vertical===0|| (this.chemistry.density(i)-this.chemistry.density(j))*vertical<=0))return false;
      this.cells[j]=a;this.cells[i]=b;this.chemistry.swap(i,j);
      const t=this.temperature[j];this.temperature[j]=this.temperature[i];this.temperature[i]=t;
      this.moved[i]=stamp;this.moved[j]=stamp;return true;
    };
    // Opposite passes preserve single-step gas and liquid travel without density oscillation.
    for(const direction of [1,-1])for(let row=0;row<H;row++) {
      const y=direction===1?H-1-row:row;
      for(let col=0;col<W;col++){
        const x=reverse?W-1-col:col,i=y*W+x,m=this.cells[i];
        if(!m||this.moved[i]===stamp||this.occupancy[i]||this.terrain[i]===1||MATERIALS[m].phase==='solid'||this.chemistry.viscosity(i)===100||Math.sign(MATERIALS[m].density)!==direction)continue;
        const viscosity=this.chemistry.viscosity(i),gas=MATERIALS[m].phase==='gas';
        // Gas mixes through available space instead of behaving like upside-down sand.
        const above=this.index(x,y-1);
        const ceiling=above<0||this.terrain[above]===1||!!this.occupancy[above]||!!this.cells[above];
        if(gas&&ceiling&&this.random()>.18+Math.abs(MATERIALS[m].density)*.035){
          const choice=Math.floor(this.random()*4),dx=choice===0?-1:choice===1?1:0,dy=choice===2?1:choice===3?-1:0;
          if(tryMove(i,this.index(x+dx,y+dy),dy))continue;
        }
        if(!gas&&viscosity>50&&this.random()<viscosity/130)continue;
        if(tryMove(i,this.index(x,y+direction),direction))continue;
        const side=this.random()<.5?1:-1;
        if(tryMove(i,this.index(x+side,y+direction),direction)||tryMove(i,this.index(x-side,y+direction),direction))continue;
        if(MATERIALS[m].phase==='powder')continue;
        const surface=this.index(x,y-1);
        if((gas||surface<0||this.cells[surface]!==m)&&this.random()<1-viscosity/100) {
          // Transmit lateral pressure along a contiguous row of the same material.
          // Looking beyond occupied neighbours lets liquid surfaces level, while walls,
          // rigid bodies and other materials keep separate chambers disconnected.
          const reach=gas?18:Math.max(2,Math.round(28*(1-viscosity/100)));
          let target=-1,leftOpen=true,rightOpen=true;
          for(let distance=1;distance<=reach&&target<0&&(leftOpen||rightOpen);distance++){
            for(let attempt=0;attempt<2;attempt++){
              const sign=attempt===0?side:-side;if(sign<0?!leftOpen:!rightOpen)continue;
              const j=this.index(x+sign*distance,y);
              if(j<0||this.terrain[j]===1||this.occupancy[j]||(this.cells[j]&&this.cells[j]!==m)){
                if(sign<0)leftOpen=false;else rightOpen=false;continue;
              }
              if(!this.cells[j]&&this.moved[j]!==stamp){
                const below=this.index(j%W,y+1),support=this.index(x,y+1);
                if(!gas&&support>=0&&this.cells[support]===m&&(below<0||this.terrain[below]===1||this.occupancy[below]||(this.cells[below]&&MATERIALS[this.cells[below]].phase!=='gas')))continue;
                target=j;break;
              }
            }
          }
          if(target>=0)tryMove(i,target,0);
        }
      }
    }
  }
  step(dt=DT) {this.prepareStep();try{const old=this.poses();this.relaxJoints(dt);this.drive(dt);this.rasterize(old);this.runDevices(dt);this.thermal();this.chemistry.step();this.flow();this.flow();this.tick++;}finally{this.graph=undefined;this.childrenIndex=undefined;this.guides=undefined;this.subtreeIndex.clear();}}
  runtimeState(){return {randomState:this.randomState,flowTick:this.flowTick,tick:this.tick,lost:this.lost};}
  restoreRuntime(s:ReturnType<Engine['runtimeState']>){this.randomState=s.randomState;this.flowTick=s.flowTick;this.tick=s.tick;this.lost=s.lost;this.moved.fill(0);}
  totalMass(){let mass=this.trapped.reduce((s,p)=>s+(p.components?.reduce((t,c)=>t+c.amount,0)??1),0);for(let i=0;i<SIZE;i++)mass+=this.chemistry.mass(i);return mass;}
  count() {let count=this.trapped.length;for(let i=0;i<SIZE;i++)if(this.cells[i])count++;return count;}
  experiment(kind:string){
    if(['cycles','hydrogen-cycle','crystal-cycle','extraction-cycle'].includes(kind)){buildCycles(this,kind);return;}
    this.clear();
    const wall=(x:number,y:number,x1:number,y1:number)=>this.terrainShape(x,y,x1,y1,1);
    const tank=(left:number,right:number,top=110,bottom=190)=>{wall(left,top,left+1,bottom);wall(right-1,top,right,bottom);wall(left,bottom,right,bottom+1);};
    const fill=(x:number,y:number,x1:number,y1:number,parts:Component[],temperature=20)=>{for(let py=y;py<y1;py++)for(let px=x;px<x1;px++){const i=this.index(px,py);if(i>=0&&!this.terrain[i])this.chemistry.write(i,parts,temperature);}};
    if(kind==='dissolve'){
      this.experimentTitle='溶解 → 加熱 → 冷却析出';this.experimentDescription='左は水と晶塩。攪拌・加熱で溶解。右は温かい溶液を冷やし、結晶を回収します。装置を選んで温度を変更できます。';
      tank(84,158);tank(211,285);
      fill(86,154,157,190,[{material:1,amount:1}]);fill(105,148,140,154,[{material:11,amount:1}]);
      fill(213,153,284,185,[{material:1,amount:.78},{material:11,amount:.22}],85);
      const hot=this.add('thermostat',122,174)!;hot.name='溶解槽のヒーター';hot.targetTemperature=80;hot.effectRadius=32;
      const cold=this.add('thermostat',249,174)!;cold.name='析出槽の冷却器';cold.targetTemperature=5;cold.effectRadius=34;
      const motor=this.add('motor',121,166)!;motor.name='溶解槽の攪拌';motor.speed=.5;
      const paddle=this.add('rect',121,166,48,3)!;this.reparent(paddle.id,motor.id);
    }else if(kind==='distill'){
      this.experimentTitle='水 + 揮発溶媒 → 蒸留・凝縮';this.experimentDescription='左を95°Cに保ち、溶媒だけを蒸発。ポンプが蒸気を右へ運び、冷却して液体溶媒を回収します。成分表示で分離を観察できます。';
      tank(84,160,114);tank(215,287,114);wall(84,113,160,114);wall(215,113,287,114);
      fill(86,153,159,189,[{material:1,amount:.5},{material:12,amount:.5}],45);
      const hot=this.add('thermostat',123,170)!;hot.name='蒸留槽 · 95°C';hot.targetTemperature=95;hot.effectRadius=40;
      const cold=this.add('thermostat',250,135)!;cold.name='凝縮槽 · 15°C';cold.targetTemperature=15;cold.effectRadius=39;
      const pump=this.add('pump',187.5,119.5)!;pump.name='蒸気移送ポンプ';pump.portDistance=30;pump.flowRate=10;
    }else{
      this.experimentTitle='晶塩 + 活性剤 → 複合結晶 → 選択膜で回収';this.experimentDescription='左で晶塩と活性剤が反応し、重い複合結晶が生成。選択膜は複合結晶だけを右へ回収します。入口の位置や通過成分を変えて試してください。';
      tank(84,183);tank(236,287);
      fill(86,152,181,187,[{material:1,amount:.8},{material:11,amount:.1},{material:15,amount:.1}],55);
      const membrane=this.add('membrane',210.5,188.5)!;membrane.name='結晶回収用の選択膜';membrane.portDistance=30;membrane.filterMaterial=16;membrane.flowRate=8;
      const valve=this.add('valve',262.5,160.5)!;valve.name='回収槽のバルブ';valve.portAngle=90;valve.portDistance=8;valve.flowRate=4;
    }
    this.rasterize();this.tick=0;this.revision++;this.editEpoch++;
  }
  jointDemo(clear=true){
    if(clear)this.clear();
    for(const [x,joint] of [[120,'spring'],[250,'free']] as const){const motor=this.add('motor',x,72)!;motor.name=x===120?'01 · 攪拌モーター':'02 · 自由関節モーター';motor.speed=.65;
      const arm=this.add('rect',x+9,72,18,3)!;arm.name='固定アーム';this.reparent(arm.id,motor.id);
      const flap=this.add('rect',x+27,72,18,3)!;flap.name=joint==='spring'?'ばね復帰パドル':'自由パドル';this.reparent(flap.id,arm.id);this.setJoint(flap.id,joint);flap.jointLimit=Math.PI/2;motor.la=-.8;if(joint==='free')flap.la=-.8;
      this.terrainShape(x+32,70,x+33,74,2);
    }this.experimentTitle='関節比較 · 左はばね復帰、右は自由';this.experimentDescription='パドルが緑のガイドで曲がります。左は離れると元の角度へ、右は曲がった角度を保ちます。選択して支点やばねを調整できます。';this.rasterize();
  }
  demo(){this.experiment('reaction');this.jointDemo(false);
    const mixer=this.add('motor',132,162)!;mixer.name='03 · 合成槽の攪拌';mixer.speed=.35;
    const arm=this.add('rect',141,162,18,3)!;arm.name='合成槽の固定アーム';this.reparent(arm.id,mixer.id);
    const paddle=this.add('rect',159,162,18,3)!;paddle.name='合成槽のばねパドル';this.reparent(paddle.id,arm.id);this.setJoint(paddle.id,'spring');mixer.la=-.8;this.terrainShape(164,160,165,164,2);
    const heat=this.add('thermostat',109,172)!;heat.name='合成槽の温度調整';heat.targetTemperature=55;heat.effectRadius=28;
    this.rasterize();this.experimentTitle='合成・分離 × 関節実験';this.experimentDescription='上段：固定アームと自由／ばね関節を比較。下段：ばねパドルと温度装置で攪拌・保温し、水中の晶塩と活性剤から複合結晶を合成。選択膜で右へ回収。見本メニューには蒸留・析出・従来の物理もあります。';}
  physicsDemo() {
    this.clear();
    const wall=(a:number,b:number,c:number,d:number)=>this.terrainShape(a,b,c,d,1);
    const fill=(x0:number,y0:number,x1:number,y1:number,m:number)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=this.index(x,y);if(i>=0&&!this.terrain[i]){this.cells[i]=m;this.temperature[i]=MATERIALS[m].temperature;}}};
    // Density basin, thermal contact basin, and a sealed gas chamber.
    wall(78,93,80,203);wall(174,93,176,203);wall(78,202,176,204);
    fill(81,160,174,202,1);fill(81,144,174,160,2);fill(105,134,119,144,4);fill(92,180,109,191,3);
    wall(188,134,190,203);wall(282,134,284,203);wall(188,202,284,204);wall(235,137,237,190);
    fill(191,176,235,202,1);fill(238,174,282,202,5);
    fill(215,99,235,112,7);fill(250,103,271,113,8);
    wall(191,51,191,88);wall(233,51,233,88);wall(191,51,233,52);wall(191,87,233,89);fill(198,73,227,85,9);
    const motor=this.add('motor',135,176)!;motor.name='01 · 攪拌モーター';motor.speed=.6;
    const paddle=this.add('rect',135,176,44,4)!;paddle.name='攪拌パドル';this.reparent(paddle.id,motor.id);
    const piston=this.add('motor',273,153)!;piston.name='02 · 反復ピストン';piston.mode='piston';piston.amp=42;piston.speed=.65;piston.strokeAngle=Math.PI;piston.t=.1;
    const tip=this.poses().get(piston.id)!;
    const plate=this.add('rect',tip.ax,tip.ay,3,27)!;plate.name='押板';this.reparent(plate.id,piston.id);
    this.terrainShape(223,135,225,165,2);this.rasterize();this.tick=0;this.revision++;this.editEpoch++;
  }
}

function descendantState(nodes:LabNode[]){return nodes.map(n=>({id:n.id,la:n.la,jointOffset:n.jointOffset,jointVelocity:n.jointVelocity}));}
function restoreJoints(nodes:LabNode[],states:ReturnType<typeof descendantState>){const map=new Map(nodes.map(n=>[n.id,n]));for(const state of states){const n=map.get(state.id);if(n){n.la=state.la;n.jointOffset=state.jointOffset;n.jointVelocity=state.jointVelocity;}}}
