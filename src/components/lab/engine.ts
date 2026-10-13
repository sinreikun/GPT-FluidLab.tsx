export const W = 400, H = 224, SIZE = W * H;
export const STORAGE_KEY = 'cell-fluid-lab-v1';
export const DT = 1 / 60;
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export interface Material { name: string; en: string; density: number; viscosity: number; conductivity: number; capacity: number; temperature: number; color: [number, number, number] }
export const MATERIALS: Material[] = [
  {name:'空気',en:'AIR',density:0,viscosity:0,conductivity:.04,capacity:.35,temperature:20,color:[12,20,29]},
  {name:'水',en:'WATER',density:4,viscosity:8,conductivity:.65,capacity:4.2,temperature:20,color:[57,158,235]},
  {name:'油',en:'OIL',density:2,viscosity:42,conductivity:.15,capacity:2,temperature:25,color:[224,183,67]},
  {name:'水銀',en:'MERCURY',density:9,viscosity:5,conductivity:.85,capacity:.6,temperature:20,color:[182,198,214]},
  {name:'氷',en:'ICE',density:3,viscosity:100,conductivity:.75,capacity:2.1,temperature:-12,color:[157,227,243]},
  {name:'溶岩',en:'LAVA',density:7,viscosity:74,conductivity:.4,capacity:1.5,temperature:1200,color:[245,91,43]},
  {name:'岩石',en:'ROCK',density:6,viscosity:100,conductivity:.35,capacity:1.2,temperature:420,color:[117,108,105]},
  {name:'蒸気',en:'STEAM',density:-3,viscosity:4,conductivity:.2,capacity:1.9,temperature:110,color:[174,206,219]},
  {name:'煙',en:'SMOKE',density:-2,viscosity:14,conductivity:.12,capacity:1,temperature:180,color:[120,131,149]},
  {name:'水素',en:'HYDROGEN',density:-6,viscosity:0,conductivity:.2,capacity:1.4,temperature:20,color:[160,139,224]},
  {name:'水銀蒸気',en:'HG VAPOR',density:-1,viscosity:4,conductivity:.25,capacity:.7,temperature:370,color:[156,179,163]},
];
export type NodeKind = 'motor' | 'pin' | 'rect' | 'circle' | 'thermostat';
export interface LabNode {
  id: number; kind: NodeKind; name: string; parent: number | null; joint: 'fixed' | 'free';
  lx: number; ly: number; la: number; width: number; height: number; radius: number;
  mode: 'rotation' | 'piston'; direction: number; speed: number; amp: number; strokeAngle: number;
  t: number; bounce: number; repeat: boolean; blocked: boolean;
  targetTemperature?: number; effectRadius?: number; enabled?: boolean;
}
export interface Pose { x: number; y: number; a: number; ax: number; ay: number }
export interface Trapped { x: number; y: number; material: number; temperature: number; dx?: number; dy?: number }
export interface Snapshot {
  version: 4; width: number; height: number; cells: number[]; temperature: number[]; terrain: number[];
  nodes: LabNode[]; nextId: number; viscosity: number[]; conductivity: number[]; trapped: Trapped[];
}
export const NODE_NAMES: Record<NodeKind,string> = {motor:'モーター',pin:'ピン',rect:'可動壁 · 矩形',circle:'可動壁 · 円',thermostat:'温度調整装置'};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export class Engine {
  cells = new Uint8Array(SIZE);
  temperature = new Float32Array(SIZE).fill(20);
  terrain = new Uint8Array(SIZE); // 1 wall, 2 guide
  occupancy = new Int32Array(SIZE);
  nodes: LabNode[] = [];
  nextId = 1;
  viscosity = MATERIALS.map(m => m.viscosity);
  conductivity = MATERIALS.map(m => m.conductivity);
  trapped: Trapped[] = [];
  history: Snapshot[] = [];
  tick = 0;
  revision = 0;
  lost = 0;
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
  snapshot(): Snapshot { return {version:4,width:W,height:H,cells:Array.from(this.cells),temperature:Array.from(this.temperature),terrain:Array.from(this.terrain),nodes:structuredClone(this.nodes),nextId:this.nextId,viscosity:[...this.viscosity],conductivity:[...this.conductivity],trapped:structuredClone(this.trapped)}; }
  restore(s: Snapshot) { this.cells.set(s.cells); this.temperature.set(s.temperature); this.terrain.set(s.terrain); this.nodes=structuredClone(s.nodes); this.nextId=s.nextId; this.viscosity=[...s.viscosity]; this.conductivity=[...s.conductivity]; this.trapped=structuredClone(s.trapped); this.rasterize(); this.revision++; }
  checkpoint() { this.history.push(this.snapshot()); if(this.history.length>40) this.history.shift(); }
  undo() { const s=this.history.pop(); if(s) this.restore(s); return !!s; }
  clear() { this.cells.fill(0); this.temperature.fill(20); this.terrain.fill(0); this.nodes=[]; this.trapped=[]; this.occupancy.fill(0); this.nextId=1; this.revision++; }
  load(raw: string): boolean {
    try {
      const s=JSON.parse(raw);
      if(s.version!==4 || s.width!==W || s.height!==H) return false;
      if(!Array.isArray(s.cells)||s.cells.length!==SIZE||!s.cells.every((n: unknown)=>finite(n)&&Number.isInteger(n)&&n>=0&&n<MATERIALS.length)) return false;
      if(!Array.isArray(s.terrain)||s.terrain.length!==SIZE||!s.terrain.every((n: unknown)=>n===0||n===1||n===2)) return false;
      if(!Array.isArray(s.temperature)||s.temperature.length!==SIZE||!s.temperature.every((n: unknown)=>finite(n)&&n>=-273&&n<=5000)) return false;
      if(!Array.isArray(s.nodes)||s.nodes.length>1000 || !finite(s.nextId)) return false;
      const ids=new Set<number>();
      for(const n of s.nodes) {
        if(!Number.isSafeInteger(n.id)||n.id<1||ids.has(n.id)||!['motor','pin','rect','circle','thermostat'].includes(n.kind)||!['fixed','free'].includes(n.joint)||typeof n.name!=='string'||n.name.length>100) return false;
        if(n.kind==='thermostat'&&(!finite(n.targetTemperature)||n.targetTemperature< -273||n.targetTemperature>2000||!finite(n.effectRadius)||n.effectRadius<1||n.effectRadius>40||typeof n.enabled!=='boolean'))return false;
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
      for(const [key,max] of [['viscosity',100],['conductivity',1]] as const) if(!Array.isArray(s[key])||s[key].length!==MATERIALS.length||!s[key].every((n:unknown)=>finite(n)&&n>=0&&n<=max)) return false;
      if(!Array.isArray(s.trapped)||s.trapped.length>SIZE||!s.trapped.every((p:Trapped)=>finite(p.x)&&finite(p.y)&&finite(p.temperature)&&p.temperature>=-273&&p.temperature<=5000&&Number.isInteger(p.material)&&p.material>0&&p.material<MATERIALS.length&&(p.dx===undefined&&p.dy===undefined||finite(p.dx)&&finite(p.dy)&&Math.abs(p.dx)+Math.abs(p.dy)===1&&Number.isInteger(p.dx)&&Number.isInteger(p.dy)))) return false;
      if(!Number.isSafeInteger(s.nextId)||s.nextId<=Math.max(0,...ids)) return false;
      this.restore(s); this.history=[]; return true;
    } catch { return false; }
  }
  poses(): Map<number,Pose> {
    const result=new Map<number,Pose>(); const map=new Map(this.nodes.map(n=>[n.id,n]));
    const visit=(n:LabNode):Pose=> {
      const cached=result.get(n.id); if(cached) return cached;
      const parent=n.parent===null?undefined:map.get(n.parent);
      const p=parent?visit(parent):{x:0,y:0,a:0,ax:0,ay:0};
      const c=Math.cos(p.a),s=Math.sin(p.a);
      const x=p.ax+c*n.lx-s*n.ly, y=p.ay+s*n.lx+c*n.ly;
      const a=n.joint==='free'?n.la:p.a+n.la;
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
    n.lx=c*(x-px)+s*(y-py); n.ly=-s*(x-px)+c*(y-py); n.la=n.joint==='free'?a:a-pa;
  }
  isDescendant(id:number,ancestor:number) { let n=this.nodes.find(n=>n.id===id); while(n) { if(n.id===ancestor) return true; n=this.nodes.find(p=>p.id===n!.parent); } return false; }
  reparent(id: number,parent: number|null) {
    const n=this.nodes.find(n=>n.id===id); if(!n||parent!==null&&(!this.nodes.some(n=>n.id===parent)||this.isDescendant(parent,id))) return false;
    const poses=this.poses(),p=poses.get(id)!; n.parent=parent; this.setWorld(n,p.x,p.y,p.a,poses); this.revision++; return true;
  }
  setJoint(id:number,joint:'fixed'|'free') { const n=this.nodes.find(n=>n.id===id); if(!n)return; const poses=this.poses(),p=poses.get(id)!; n.joint=joint; this.setWorld(n,p.x,p.y,p.a,poses); this.revision++; }
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
    this.nodes=this.nodes.filter(n=>!ids.has(n.id)); this.revision++; this.rasterize();
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
      if(collision){for(const {n,lx,ly,la} of locals)Object.assign(n,{lx,ly,la});this.rasterize();this.revision++;return false;}
    }
    this.rasterize(before);this.revision++;return true;
  }
  add(kind:NodeKind,x:number,y:number,width=1,height=1,radius=1):LabNode|null {
    if(kind==='rect'&&width*height>40000||kind==='circle'&&Math.PI*radius*radius>40000)return null;
    const poses=this.poses();
    if(kind==='motor') { const existing=this.nodes.find(n=>n.kind==='motor'&&Math.floor(poses.get(n.id)!.x)===Math.floor(x)&&Math.floor(poses.get(n.id)!.y)===Math.floor(y)); if(existing)return existing; }
    if(this.nodes.length>=1000)return null;
    const n:LabNode={id:this.nextId++,kind,name:NODE_NAMES[kind],parent:null,joint:'fixed',lx:x,ly:y,la:0,width,height,radius,mode:'rotation',direction:1,speed:1,amp:40,strokeAngle:Math.PI,t:0,bounce:1,repeat:true,blocked:false};
    if(kind==='thermostat'){n.targetTemperature=100;n.effectRadius=12;n.enabled=true;}
    if(kind==='pin') {
      const parent=this.nodes.find(p=>p.kind==='motor'&&Math.floor(poses.get(p.id)!.x)===Math.floor(x)&&Math.floor(poses.get(p.id)!.y)===Math.floor(y))??[...this.nodes].reverse().find(p=>(p.kind==='rect'||p.kind==='circle')&&this.contains(p,poses.get(p.id)!,x,y));
      if(parent) {n.parent=parent.id; this.setWorld(n,x,y,0,poses);}
    }
    this.nodes.push(n); this.rasterize(); this.revision++; return n;
  }
  contains(n:LabNode,p:Pose,x:number,y:number) {
    const dx=x-p.x,dy=y-p.y,c=Math.cos(p.a),s=Math.sin(p.a),lx=c*dx+s*dy,ly=-s*dx+c*dy;
    return n.kind==='rect'?Math.abs(lx)<=n.width/2&&Math.abs(ly)<=n.height/2:n.kind==='circle'?dx*dx+dy*dy<=n.radius*n.radius:Math.hypot(dx,dy)<3;
  }
  hit(x:number,y:number):LabNode|undefined { const poses=this.poses(); return [...this.nodes].reverse().filter(n=>n.kind==='pin'||n.kind==='motor'||n.kind==='thermostat').find(n=>this.contains(n,poses.get(n.id)!,x,y))??[...this.nodes].reverse().find(n=>this.contains(n,poses.get(n.id)!,x,y)); }
  shapeCells(n:LabNode,p:Pose,fn:(i:number,x:number,y:number)=>void) {
    if(n.kind==='motor') {const i=this.index(p.x,p.y);if(i>=0)fn(i,Math.floor(p.x),Math.floor(p.y));return;}
    if(n.kind==='pin'||n.kind==='thermostat')return;
    const c=Math.abs(Math.cos(p.a)),s=Math.abs(Math.sin(p.a));
    const rx=n.kind==='circle'?n.radius:(c*n.width+s*n.height)/2,ry=n.kind==='circle'?n.radius:(s*n.width+c*n.height)/2;
    for(let y=Math.max(0,Math.floor(p.y-ry));y<=Math.min(H-1,Math.ceil(p.y+ry));y++)for(let x=Math.max(0,Math.floor(p.x-rx));x<=Math.min(W-1,Math.ceil(p.x+rx));x++) if(this.contains(n,p,x+.5,y+.5))fn(y*W+x,x,y);
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
    const poses=this.poses();this.occupancy.fill(0);this.failedSpace.fill(0);
    for(const n of this.nodes) this.shapeCells(n,poses.get(n.id)!,(i)=>{this.occupancy[i]=n.id;});
    const pending:Trapped[]=[];
    for(let i=0;i<SIZE;i++) if(this.occupancy[i]&&this.cells[i]) {
      const x=i%W,y=Math.floor(i/W),p=poses.get(this.occupancy[i])!,old=previous?.get(this.occupancy[i]);
      let vx=1,vy=0;
      if(old) { const c=Math.cos(old.a-p.a),s=Math.sin(old.a-p.a),rx=x+.5-p.x,ry=y+.5-p.y; vx=x+.5-(old.x+c*rx-s*ry);vy=y+.5-(old.y+s*rx+c*ry); }
      const dx=Math.abs(vx)>=Math.abs(vy)?(vx>=0?1:-1):0,dy=dx===0?(vy>=0?1:-1):0;
      let dest=this.findSpace(x,y,dx,dy); if(dest<0)dest=this.findSpace(x,y,-dx,-dy);
      if(dest>=0){this.cells[dest]=this.cells[i];this.temperature[dest]=this.temperature[i];}
      else pending.push({x,y,material:this.cells[i],temperature:this.temperature[i],dx,dy});
      this.cells[i]=0;this.temperature[i]=20;
    }
    // Completely sealed particles remain buffered, never silently destroyed.
    for(const particle of this.trapped) {
      const dx=particle.dx??1,dy=particle.dy??0;
      let dest=this.findSpace(particle.x,particle.y,dx,dy);
      for(const [sx,sy] of [[-dx,-dy],[-dy,dx],[dy,-dx]])if(dest<0)dest=this.findSpace(particle.x,particle.y,sx,sy);
      if(dest>=0){this.cells[dest]=particle.material;this.temperature[dest]=particle.temperature;}else pending.push(particle);
    }
    this.trapped=pending;
  }
  paint(x:number,y:number,r:number,material:number,overwrite=false,erase=false) {
    for(let py=Math.max(0,Math.floor(y-r));py<=Math.min(H-1,Math.ceil(y+r));py++)for(let px=Math.max(0,Math.floor(x-r));px<=Math.min(W-1,Math.ceil(x+r));px++){
      if((px-x)**2+(py-y)**2>r*r)continue; const i=py*W+px;
      if(erase) {this.cells[i]=0;this.terrain[i]=0;this.temperature[i]=20;}
      else if(!this.occupancy[i]&&(overwrite||this.terrain[i]===0)) {if(overwrite)this.terrain[i]=0;this.cells[i]=material;this.temperature[i]=MATERIALS[material].temperature;}
    }
    if(erase){const poses=this.poses();this.delete(new Set(this.nodes.filter(n=>(n.kind==='motor'||n.kind==='pin'||n.kind==='thermostat')&&Math.hypot(poses.get(n.id)!.x-x,poses.get(n.id)!.y-y)<=r).map(n=>n.id)));}
  }
  terrainShape(x0:number,y0:number,x1:number,y1:number,type:1|2,circle=false) {
    const radius=Math.hypot(x1-x0,y1-y0);
    const left=circle?x0-radius:Math.min(x0,x1),right=circle?x0+radius:Math.max(x0,x1),top=circle?y0-radius:Math.min(y0,y1),bottom=circle?y0+radius:Math.max(y0,y1);
    for(let y=Math.max(0,Math.floor(top));y<=Math.min(H-1,Math.floor(bottom));y++)for(let x=Math.max(0,Math.floor(left));x<=Math.min(W-1,Math.floor(right));x++) {
      if(circle&&(x-x0)**2+(y-y0)**2>radius*radius)continue;
      const i=y*W+x;this.terrain[i]=type;if(type===1){this.cells[i]=0;this.temperature[i]=20;}
    }
  }
  private drive(dt:number) {
    for(const n of this.nodes.filter(n=>n.kind==='motor')) {
      n.blocked=false;if(!n.direction||!n.speed)continue;
      const start={la:n.la,t:n.t,bounce:n.bounce,direction:n.direction};
      // Each step sweeps every descendant with <= 0.75 cell travel; thin guides cannot be skipped.
      const descendants=this.nodes.filter(c=>this.isDescendant(c.id,n.id));
      const poses=this.poses(),origin=poses.get(n.id)!;
      let extent=1;for(const c of descendants){const p=poses.get(c.id)!;extent=Math.max(extent,Math.hypot(p.x-origin.ax,p.y-origin.ay)+Math.hypot(c.width,c.height)/2+c.radius);}
      const distance=n.mode==='rotation'?n.speed*dt*extent:n.speed*dt*Math.max(1,n.amp)*.5;
      const substeps=Math.max(1,Math.ceil(distance/.75));
      let collision=false;
      const trajectory:{la:number;t:number;bounce:number;direction:number}[]=[];
      for(let step=0;step<substeps;step++) {
        if(n.mode==='rotation')n.la+=n.direction*n.speed*dt/substeps;
        else {
          n.t+=n.direction*(n.repeat?n.bounce:1)*n.speed*dt*.5/substeps;
          if(n.t>1||n.t<0) {if(n.repeat){n.t=clamp(n.t<0?-n.t:2-n.t,0,1);n.bounce*=-1;}else{n.t=clamp(n.t,0,1);n.direction=0;}}
        }
        const next=this.poses();
        for(const child of descendants.filter(c=>c.kind==='rect'||c.kind==='circle')) {
          const p=next.get(child.id)!;
          const c=Math.abs(Math.cos(p.a)),s=Math.abs(Math.sin(p.a));const rx=child.kind==='circle'?child.radius:(c*child.width+s*child.height)/2,ry=child.kind==='circle'?child.radius:(s*child.width+c*child.height)/2;
          if(p.x-rx<0||p.x+rx>W||p.y-ry<0||p.y+ry>H)collision=true;
          this.shapeCells(child,p,(i)=>{if(this.terrain[i]===2)collision=true;});
          if(collision)break;
        }
        if(collision)break;
        trajectory.push({la:n.la,t:n.t,bounce:n.bounce,direction:n.direction});
      }
      if(collision){Object.assign(n,start);n.blocked=true;}
      else if(substeps>1){
        Object.assign(n,start);
        for(const state of trajectory){const before=this.poses();Object.assign(n,state);this.rasterize(before);}
      }
    }
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
    this.heat.fill(0);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++) {
      const i=y*W+x;
      for(let axis=0;axis<2;axis++) {
        const j=axis===0?(x<W-1?i+1:-1):(y<H-1?i+W:-1);
        if(j<0)continue;
        const mi=this.cells[i],mj=this.cells[j];
        const ki=this.terrain[i]||this.occupancy[i] ? .08:this.conductivity[mi];
        const kj=this.terrain[j]||this.occupancy[j] ? .08:this.conductivity[mj];
        const k=Math.min(ki,kj)*.11;
        const ci=this.terrain[i]||this.occupancy[i]?2:MATERIALS[mi].capacity,cj=this.terrain[j]||this.occupancy[j]?2:MATERIALS[mj].capacity;
        const q=(this.temperature[j]-this.temperature[i])*k;
        this.heat[i]+=q/ci;this.heat[j]-=q/cj;
      }
    }
    for(let i=0;i<SIZE;i++) {
      this.temperature[i]+=this.heat[i];
      if(!this.cells[i]&&!this.terrain[i])this.temperature[i]+=(20-this.temperature[i])*.003;
    }
    this.applyThermostats();
    for(let i=0;i<SIZE;i++){
      const m=this.cells[i],t=this.temperature[i];
      const change=m===1?(t<=0?4:t>=100?7:1):m===4&&t>=1?1:m===7&&t<=95?1:m===2&&t>=300?8:m===3&&t>=357?10:m===10&&t<=340?3:m===5&&t<=700?6:m===6&&t>=900?5:m;
      this.cells[i]=change;
    }
  }
  private flow() {
    const stamp=++this.flowTick,reverse=stamp%2===0;
    const tryMove=(i:number,j:number,vertical:number)=> {
      if(j<0||this.terrain[j]===1||this.occupancy[j]||this.moved[j]===stamp)return false;
      const a=this.cells[i],b=this.cells[j];
      if(b && (this.viscosity[b]===100||vertical===0|| (MATERIALS[a].density-MATERIALS[b].density)*vertical<=0))return false;
      this.cells[j]=a;this.cells[i]=b;
      const t=this.temperature[j];this.temperature[j]=this.temperature[i];this.temperature[i]=t;
      this.moved[i]=stamp;this.moved[j]=stamp;return true;
    };
    // Opposite passes preserve single-step gas and liquid travel without density oscillation.
    for(const direction of [1,-1])for(let row=0;row<H;row++) {
      const y=direction===1?H-1-row:row;
      for(let col=0;col<W;col++){
        const x=reverse?W-1-col:col,i=y*W+x,m=this.cells[i];
        if(!m||this.moved[i]===stamp||this.occupancy[i]||this.terrain[i]===1||this.viscosity[m]===100||Math.sign(MATERIALS[m].density)!==direction)continue;
        const viscosity=this.viscosity[m];if(viscosity>50&&this.random()<viscosity/130)continue;
        if(tryMove(i,this.index(x,y+direction),direction))continue;
        const side=this.random()<.5?1:-1;
        if(tryMove(i,this.index(x+side,y+direction),direction)||tryMove(i,this.index(x-side,y+direction),direction))continue;
        if(this.random()<1-viscosity/100) {
          if(tryMove(i,this.index(x+side,y),0))continue;tryMove(i,this.index(x-side,y),0);
        }
      }
    }
  }
  step(dt=DT) {const old=this.poses();this.drive(dt);this.rasterize(old);this.thermal();this.flow();this.flow();this.tick++;}
  count() {let count=this.trapped.length;for(let i=0;i<SIZE;i++)if(this.cells[i])count++;return count;}
  demo() {
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
    const pin=this.add('pin',135,176)!;pin.name='パドル接続';
    const paddle=this.add('rect',135,176,44,4)!;paddle.name='攪拌パドル';this.reparent(paddle.id,pin.id);
    const piston=this.add('motor',273,153)!;piston.name='02 · 反復ピストン';piston.mode='piston';piston.amp=42;piston.speed=.65;piston.strokeAngle=Math.PI;piston.t=.1;
    const tip=this.poses().get(piston.id)!;
    const pp=this.add('pin',tip.ax,tip.ay)!;pp.name='先端のピン';this.reparent(pp.id,piston.id);
    const plate=this.add('rect',tip.ax,tip.ay,3,27)!;plate.name='押板';this.reparent(plate.id,pp.id);
    this.terrainShape(223,135,225,165,2);this.rasterize();this.tick=0;this.revision++;
  }
}
