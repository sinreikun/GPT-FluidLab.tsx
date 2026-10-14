import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Play, Pause, MousePointer2, Droplets, Eraser, Square, Circle, ScanLine, Cog, MapPin, Undo2, Save, FolderOpen, FlaskConical, Trash2, ChevronDown, ChevronRight, GripHorizontal, X, Flame, Snowflake, Layers, SlidersHorizontal, Wrench, Grid2X2, Thermometer, GitBranch, RotateCcw, HelpCircle, Check, Minus, Plus, CircleDot } from 'lucide-react';
import { Engine, MATERIALS, W, H, DT, STORAGE_KEY, clamp, type LabNode, type Pose } from './engine';
import SimulationWorker from './simulation.worker?worker&inline';
import {SimulationRunner} from './simulation-runner';
import {PROCESSES,type Process,type CustomPorts} from './processes';
import { REACTIONS } from './chemistry';
import { Renderer, type RenderOptions } from './renderer';

type Tool='select'|'fluid'|'erase'|'wallRect'|'wallCircle'|'guideRect'|'guideCircle'|'bodyRect'|'bodyCircle'|'motor'|'connect'|'heat'|'cool'|'thermostat'|'pump'|'valve'|'membrane'|'processor';
const TOOLS:{id:Tool;name:string;key:string;icon:typeof Play;description:string}[]=[
  {id:'select',name:'選択・移動',key:'V',icon:MousePointer2,description:'オブジェクトをドラッグして移動。空白をドラッグして範囲選択。Shift + クリックで選択を追加・解除。'},
  {id:'fluid',name:'物質',key:'1',icon:Droplets,description:'ドラッグで物質を配置。Ctrl / ⌘ で壁とガイドを上書き。右クリックは消しゴム。'},
  {id:'erase',name:'消しゴム',key:'2',icon:Eraser,description:'ドラッグで物質・壁・ガイドを消去。モーターと装置も消去できます。可動壁は選択して Delete。'},
  {id:'wallRect',name:'壁・矩形',key:'3',icon:Square,description:'ドラッグで固定壁を配置。Shift で正方形。流体を遮断します。可動壁は通過します。'},
  {id:'wallCircle',name:'壁・円',key:'4',icon:Circle,description:'押した位置が中心、ドラッグの長さが半径。固定壁は流体を遮断します。'},
  {id:'guideRect',name:'ガイド・矩形',key:'5',icon:ScanLine,description:'ドラッグでガイドを配置。流体は通過し、柔らかい関節は接触で曲がり、固定関節は停止します。'},
  {id:'guideCircle',name:'ガイド・円',key:'6',icon:CircleDot,description:'押した位置を中心に円形ガイドを配置。流体を通し、機械を止めます。'},
  {id:'bodyRect',name:'可動壁・矩形',key:'7',icon:Square,description:'ドラッグで剛体の板を配置。接続ツールで子→親の順にクリックして接続。'},
  {id:'bodyCircle',name:'可動壁・円',key:'8',icon:Circle,description:'ドラッグで円形の剛体を配置。中心からの距離が半径。回転しても形状を保ちます。'},
  {id:'motor',name:'モーター',key:'9',icon:Cog,description:'クリックでモーターを配置。プロパティで回転・ピストンを切り替え、駆動を設定。'},
  {id:'connect',name:'接続',key:'0',icon:GitBranch,description:'子の可動壁、親の順にクリック。空白で背景へ切離し。選択中の関節マーカーをドラッグして支点を編集。'},
  {id:'pump',name:'ポンプ',key:'',icon:ScanLine,description:'クリックでポンプを設置。矢印の入口から出口へ物質を運びます。壁を貫く流路として使えます。'},
  {id:'valve',name:'バルブ',key:'',icon:SlidersHorizontal,description:'クリックでバルブを設置。閉じると中央のゲートが流体を遮断。開くと入口から出口へ移送します。'},
  {id:'membrane',name:'選択膜',key:'',icon:Layers,description:'指定した成分だけを入口から出口へ回収。容器の仕切りに設置して使います。出口満杯なら処理を待ちます。'},
  {id:'processor',name:'循環装置',key:'',icon:FlaskConical,description:'クリックで設置し、処理方式から電解・燃焼・凝縮・結晶再生・抽出を選択。各ポートの材料を処理します。'},
  {id:'thermostat',name:'温度装置',key:'',icon:Thermometer,description:'クリックで温度調整装置を設置。プロパティで目標温度と範囲を設定。再生中に周囲を温めたり冷やしたりします。流体は通過します。'},
  {id:'heat',name:'加熱',key:'',icon:Flame,description:'ドラッグで温めます。停止中も使えます。再生すると熱が伝わり、相変化します。'},
  {id:'cool',name:'冷却',key:'',icon:Snowflake,description:'ドラッグで冷やします。温度表示を使って熱の伝わり方を観察してください。'},
];
interface Gesture {mode:'paint'|'shape'|'move'|'range'|'joint'; tool:Tool;x:number;y:number;lastX:number;lastY:number;endX:number;endY:number;poses?:Map<number,Pose>;ids?:Set<number>;changed:boolean}
function FloatingPanel({title,icon:Icon,children,initial,className=''}:{title:string;icon:typeof Play;children:ReactNode;initial:{x:number;y:number};className?:string}) {
  const [position,setPosition]=useState(initial),[collapsed,setCollapsed]=useState(window.innerWidth<600);
  const root=useRef<HTMLDivElement>(null),drag=useRef<{dx:number;dy:number}|null>(null);
  useEffect(()=>{const resize=()=>setPosition(p=>({x:clamp(p.x,8,Math.max(8,window.innerWidth-(root.current?.offsetWidth??260)-8)),y:clamp(p.y,8,Math.max(8,window.innerHeight-120))}));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  return <section ref={root} className={`panel ${className} ${collapsed?'collapsed':''}`} style={{left:position.x,top:position.y}} aria-label={title}>
    <div className="panel-head" onPointerDown={e=>{if((e.target as HTMLElement).closest('button'))return;drag.current={dx:e.clientX-position.x,dy:e.clientY-position.y};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current)setPosition({x:clamp(e.clientX-drag.current.dx,8,Math.max(8,window.innerWidth-(root.current?.offsetWidth??260)-8)),y:clamp(e.clientY-drag.current.dy,8,Math.max(8,window.innerHeight-120))});}} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
      <Icon size={14}/><h2>{title}</h2><GripHorizontal className="grip" size={15}/><button className="icon-button" aria-label={`${title}を${collapsed?'展開':'折りたたむ'}`} onClick={()=>{if(collapsed)setPosition(p=>({...p,x:clamp(p.x,8,Math.max(8,window.innerWidth-(window.innerWidth<600?190:244)-8))}));setCollapsed(!collapsed);}}>{collapsed?<ChevronRight size={14}/>:<Minus size={14}/>}</button>
    </div><div className="panel-content" hidden={collapsed}>{children}</div>
  </section>;
}
function ValueControl({label,value,min,max,step=.1,unit='',onChange,onStart}:{label:string;value:number;min:number;max:number;step?:number;unit?:string;onChange:(v:number)=>void;onStart?:()=>void}) {
  const [text,setText]=useState(String(value));const focused=useRef(false);
  useEffect(()=>{if(!focused.current)setText(String(Number(value.toFixed(2))));},[value]);
  const update=(n:number)=>{if(Number.isFinite(n))onChange(clamp(n,min,max));};
  return <div className="value-control"><div className="field-label"><span>{label}</span><div className="number-field"><input aria-label={label} type="number" min={min} max={max} step={step} value={text} onFocus={()=>{focused.current=true;onStart?.();}} onChange={e=>{setText(e.target.value);if(e.target.value!=='')update(Number(e.target.value));}} onBlur={()=>{focused.current=false;setText(String(Number(value.toFixed(2))));}}/><span>{unit}</span><div className="steppers"><button aria-label={`${label}を増やす`} onClick={()=>{onStart?.();update(value+step);}}><ChevronDown className="up" size={9}/></button><button aria-label={`${label}を減らす`} onClick={()=>{onStart?.();update(value-step);}}><ChevronDown size={9}/></button></div></div></div><input aria-label={`${label}スライダー`} className="slider" type="range" min={min} max={max} step={step} value={value} onPointerDown={onStart} onKeyDown={e=>{if(e.key.startsWith('Arrow'))onStart?.();}} onChange={e=>update(Number(e.target.value))}/></div>;
}
export default function FluidLab() {
  const engineRef=useRef<Engine|null>(null);
  if(!engineRef.current){const e=new Engine();let loaded=false;try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)loaded=e.load(raw);}catch{/* Storage may be unavailable; editing still works. */}if(!loaded)e.demo();engineRef.current=e;}
  const engine=engineRef.current;
  const simulation=useRef<SimulationRunner|null>(null);
  const canvas=useRef<HTMLCanvasElement>(null),gesture=useRef<Gesture|null>(null),cursorRef=useRef<{x:number;y:number}|null>(null);
  const [running,setRunning]=useState(true),[speed,setSpeed]=useState(1),[tool,setTool]=useState<Tool>('fluid'),[material,setMaterial]=useState(1),[radius,setRadius]=useState(6);
  const [selected,setSelected]=useState<Set<number>>(new Set()),[revision,setRevision]=useState(0),[thermal,setThermal]=useState(false),[connections,setConnections]=useState(true),[grid,setGrid]=useState(true),[hints,setHints]=useState(true);
  const [materialGroup,setMaterialGroup]=useState('all');
  const [experiment,setExperiment]=useState(engine.experimentTitle==='材料を再利用する三つの循環'?'cycles':engine.experimentTitle==='水素循環'?'hydrogen-cycle':engine.experimentTitle==='結晶循環'?'crystal-cycle':engine.experimentTitle==='抽出循環'?'extraction-cycle':'overview'),[view,setView]=useState<'matter'|'temperature'|'component'|'flow'>('matter'),[component,setComponent]=useState(11);
  const [stats,setStats]=useState({count:engine.count(),fps:60,tick:0,rate:0,stepMs:0,mass:engine.totalMass()}),[cursor,setCursor]=useState<{x:number;y:number;material:number;temperature:number}|null>(null),[notice,setNotice]=useState(''),[help,setHelp]=useState(false);
  const noticeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const live=useRef({running,speed,tool,material,radius,selected,thermal,connections,grid,hints,view,component});live.current={running,speed,tool,material,radius,selected,thermal,connections,grid,hints,view,component};
  const refresh=()=>setRevision(v=>v+1);
  const inform=(message:string)=>{setNotice(message);if(noticeTimer.current)clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),4200);};
  const toggleRunning=()=>{simulation.current?.invalidate();setRunning(v=>!v);};
  const undo=()=>{gesture.current=null;if(engine.undo()){setSelected(new Set());refresh();inform('ひとつ前の編集に戻しました');}else inform('戻せる編集はありません');};
  const remove=()=>{if(!live.current.selected.size)return;engine.checkpoint();engine.delete(live.current.selected);setSelected(new Set());refresh();};
  const saved=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(engine.snapshot()));inform('このブラウザに実験を保存しました');}catch{inform('保存できませんでした。ブラウザの保存領域を確認してください');}};
  const load=()=>{try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw){inform('保存された実験はありません');return;}engine.checkpoint();const history=engine.history;if(engine.load(raw)){engine.history=history;setSelected(new Set());setHints(false);refresh();inform('保存した実験を読み込みました');}else{engine.history.pop();engine.checkpoint();engine.demo();setSelected(new Set());setHints(true);refresh();inform('保存データを読めないため見本を表示しました');}}catch{inform('保存データにアクセスできませんでした');}};
  const edit=(n:LabNode,patch:Partial<LabNode>)=>{Object.assign(n,patch);engine.rasterize();refresh();};
  const beforeEdit=()=>{simulation.current?.invalidate();engine.checkpoint();refresh();};
  useEffect(()=>{
    const key=(e:KeyboardEvent)=> {
      if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();return;}
      if(e.code==='Space'){e.preventDefault();if(e.repeat)return;toggleRunning();return;}
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();return;}
      if(e.key==='Escape'){connection.current=null;gesture.current=null;setSelected(new Set());setHelp(false);return;}
      if(e.key==='['||e.key===']'){setRadius(r=>clamp(r+(e.key===']'?1:-1),1,28));return;}
      const t=TOOLS.find(t=>t.key.toLowerCase()===e.key.toLowerCase());if(t&&!e.ctrlKey&&!e.metaKey&&!e.altKey)setTool(t.id);
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[]);
  useEffect(()=>{
    if(!canvas.current)return;
    const element=canvas.current,ctx=element.getContext('2d',{alpha:false})!,renderer=new Renderer();
    let worker:Worker|null=null;try{worker=new SimulationWorker();}catch{/* CPU fallback for browsers that restrict Workers. */}
    const runner=new SimulationRunner(engine,worker);simulation.current=runner;
    let frame=0,last=performance.now(),report=last,frames=0,reportedTick=engine.tick;
    const wheel=(e:WheelEvent)=>{e.preventDefault();setRadius(r=>clamp(r+(e.deltaY>0?-1:1),1,28));};element.addEventListener('wheel',wheel,{passive:false});
    const loop=(now:number)=> {
      const state=live.current,elapsed=Math.min((now-last)/1000,.1);last=now;
      // Editing gestures are transactions; physics resumes immediately after release.
      runner.advance(elapsed,state.speed,state.running&&!gesture.current);
      const g=gesture.current;
      const options:RenderOptions={selected:state.selected,temperature:state.view==='temperature'||state.thermal,view:state.view,component:state.component,connections:state.connections,grid:state.grid,hints:state.hints,cursor:cursorRef.current?{...cursorRef.current,radius:state.radius,tool:g?.tool??state.tool}:undefined,preview:g&&(g.mode==='shape'||g.mode==='range')?{tool:g.tool,x0:g.x,y0:g.y,x1:g.endX,y1:g.endY}:undefined};
      renderer.render(ctx,engine,options);frames++;
      if(now-report>350){setStats({count:engine.count(),fps:Math.round(frames*1000/(now-report)),tick:engine.tick,rate:Math.max(0,(engine.tick-reportedTick)*DT*1000/(now-report)),stepMs:runner.stepMilliseconds,mass:engine.totalMass()});reportedTick=engine.tick;frames=0;report=now;refresh();const c=cursorRef.current;if(c){const i=engine.index(c.x,c.y);setCursor({x:Math.floor(c.x),y:Math.floor(c.y),material:engine.cells[i]??0,temperature:engine.temperature[i]??20});}}
      frame=requestAnimationFrame(loop);
    };frame=requestAnimationFrame(loop);
    return()=>{runner.dispose();simulation.current=null;cancelAnimationFrame(frame);element.removeEventListener('wheel',wheel);if(noticeTimer.current)clearTimeout(noticeTimer.current);};
  },[]);
  const point=(e:ReactPointerEvent<HTMLCanvasElement>)=>{const rect=e.currentTarget.getBoundingClientRect();return{x:clamp((e.clientX-rect.left)/rect.width*W,0,W-.001),y:clamp((e.clientY-rect.top)/rect.height*H,0,H-.001)};};
  const paint=(x:number,y:number,t:Tool,overwrite:boolean)=> {
    if(t==='heat'||t==='cool') {
      for(let py=Math.max(0,Math.floor(y-radius));py<=Math.min(H-1,Math.ceil(y+radius));py++)for(let px=Math.max(0,Math.floor(x-radius));px<=Math.min(W-1,Math.ceil(x+radius));px++)if((px-x)**2+(py-y)**2<=radius*radius){const i=py*W+px;engine.temperature[i]=clamp(engine.temperature[i]+(t==='heat'?35:-25),-273,2000);}
    }else engine.paint(x,y,radius,material,overwrite,t==='erase');
  };
  const connection=useRef<number|null>(null);
  useEffect(()=>{connection.current=null;},[tool]);
  const pointerDown=(e:ReactPointerEvent<HTMLCanvasElement>)=> {
    if(e.button!==0&&e.button!==2)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    simulation.current?.invalidate();
    const p=point(e),t=e.button===2?'erase':tool;cursorRef.current=p;
    const base:Gesture={mode:'paint',tool:t,x:p.x,y:p.y,lastX:p.x,lastY:p.y,endX:p.x,endY:p.y,changed:false};
    if(t==='connect'){const hit=engine.hit(p.x,p.y);if(connection.current===null){if(hit){connection.current=hit.id;setSelected(new Set([hit.id]));inform('親をクリック · 空白で背景へ切離し');}}else{const child=connection.current;if(hit?.id===child){connection.current=null;inform('接続を解除しました');return;}engine.checkpoint();if(engine.reparent(child,hit?.id??null)){engine.rasterize();inform('接続しました · 支点は選択ツールで移動できます');}else{engine.history.pop();inform('循環する接続はできません');}connection.current=null;refresh();}return;}
    if(t==='select') {
      if(!e.shiftKey){const hinge=engine.nodes.find(n=>selected.has(n.id)&&n.kind!=='motor'&&Math.hypot(engine.jointPoint(n.id).x-p.x,engine.jointPoint(n.id).y-p.y)<2);if(hinge){base.mode='joint';base.ids=new Set([hinge.id]);gesture.current=base;return;}}
      const node=engine.hit(p.x,p.y);
      if(e.shiftKey){if(node)setSelected(s=>{const next=new Set(s);if(next.has(node.id))next.delete(node.id);else next.add(node.id);return next;});return;}
      if(node){const ids=selected.has(node.id)?new Set(selected):new Set([node.id]);setSelected(ids);base.mode='move';base.ids=ids;base.poses=engine.poses();}
      else {setSelected(new Set());base.mode='range';}
      gesture.current=base;return;
    }
    if(t==='motor'||t==='thermostat'||t==='pump'||t==='valve'||t==='membrane'||t==='processor') {
      const existing=t==='motor'?engine.nodes.find(n=>n.kind==='motor'&&Math.floor(engine.poses().get(n.id)!.x)===Math.floor(p.x)&&Math.floor(engine.poses().get(n.id)!.y)===Math.floor(p.y)):undefined;
      if(!existing)engine.checkpoint();const node=existing??engine.add(t,Math.floor(p.x)+.5,Math.floor(p.y)+.5);
      if(node){setSelected(new Set([node.id]));setTool('select');setHints(false);if(t==='thermostat'){setThermal(true);setView('temperature');}}else inform('オブジェクトの配置上限に達しました');refresh();return;
    }
    if(['fluid','erase','heat','cool'].includes(t)){engine.checkpoint();paint(p.x,p.y,t,e.ctrlKey||e.metaKey);base.changed=true;setHints(false);}
    else {base.mode='shape';base.x=Math.floor(p.x)+.5;base.y=Math.floor(p.y)+.5;base.endX=base.x;base.endY=base.y;}
    gesture.current=base;refresh();
  };
  const pointerMove=(e:ReactPointerEvent<HTMLCanvasElement>)=> {
    const p=point(e);cursorRef.current=p;const i=engine.index(p.x,p.y);setCursor({x:Math.floor(p.x),y:Math.floor(p.y),material:engine.cells[i],temperature:engine.temperature[i]});
    const g=gesture.current;if(!g)return;
    let x=g.mode==='shape'?Math.floor(p.x)+.5:p.x,y=g.mode==='shape'?Math.floor(p.y)+.5:p.y;
    if(g.mode==='shape'&&e.shiftKey&&!g.tool.endsWith('Circle')){const sx=x>=g.x?1:-1,sy=y>=g.y?1:-1;const side=Math.min(Math.max(Math.abs(x-g.x),Math.abs(y-g.y)),sx>0?W-.5-g.x:g.x-.5,sy>0?H-.5-g.y:g.y-.5);x=g.x+sx*side;y=g.y+sy*side;}
    g.endX=x;g.endY=y;
    if(g.mode==='paint'){const distance=Math.hypot(x-g.lastX,y-g.lastY),steps=Math.max(1,Math.ceil(distance/Math.max(1,radius/2)));for(let s=1;s<=steps;s++)paint(g.lastX+(x-g.lastX)*s/steps,g.lastY+(y-g.lastY)*s/steps,g.tool,e.ctrlKey||e.metaKey);}
    if(g.mode==='joint'){if(!g.changed){engine.checkpoint();g.changed=true;}engine.setJointAnchor([...g.ids!][0],x,y);}
    if(g.mode==='move'&&Math.hypot(x-g.x,y-g.y)>.3){if(!g.changed){engine.checkpoint();g.changed=true;}if(!engine.move(g.ids!,x-g.x,y-g.y,g.poses!))inform('ガイドに接触しています');setHints(false);}
    g.lastX=x;g.lastY=y;
  };
  const pointerUp=(e:ReactPointerEvent<HTMLCanvasElement>)=> {
    const g=gesture.current;if(!g)return;
    const x=g.endX,y=g.endY;
    if(g.mode==='shape') {
      const circle=g.tool.endsWith('Circle'),r=Math.max(.5,Math.hypot(x-g.x,y-g.y));
      if(g.tool.startsWith('body')) {
        const width=Math.max(1,Math.abs(x-g.x)),height=Math.max(1,Math.abs(y-g.y));
        if((circle?Math.PI*r*r:width*height)>40000)inform('配置できません：可動壁は 40,000 セル以下にしてください');
        else{engine.checkpoint();const n=engine.add(circle?'circle':'rect',circle?g.x:(g.x+x)/2,circle?g.y:(g.y+y)/2,width,height,r);if(n){setSelected(new Set([n.id]));setTool('select');}else inform('オブジェクトの配置上限に達しました');}
      }else{engine.checkpoint();engine.terrainShape(g.x,g.y,x,y,g.tool.startsWith('guide')?2:1,circle);}
      setHints(false);
    }else if(g.mode==='range'){
      const poses=engine.poses();setSelected(new Set(engine.nodes.filter(n=>{const p=poses.get(n.id)!;return p.x>=Math.min(g.x,x)&&p.x<=Math.max(g.x,x)&&p.y>=Math.min(g.y,y)&&p.y<=Math.max(g.y,y);}).map(n=>n.id)));
    }
    gesture.current=null;refresh();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const node=selected.size===1?engine.nodes.find(n=>selected.has(n.id)):undefined;
  const poses=engine.poses(),nodePose=node?poses.get(node.id):undefined;
  const treeRows: {node:LabNode;depth:number}[]=[];
  const visit=(parent:number|null,depth:number)=>{for(const n of engine.nodes.filter(n=>n.parent===parent)){treeRows.push({node:n,depth});visit(n.id,depth+1);}};visit(null,0);
  const currentTool=TOOLS.find(t=>t.id===tool)!;
  const chooseMaterial=(index:number)=>{setMaterial(index);setTool('fluid');};
  const resetDemo=()=>{connection.current=null;engine.checkpoint();if(experiment==='overview')engine.demo();else if(experiment==='physics')engine.physicsDemo();else if(experiment==='joints')engine.jointDemo();else engine.experiment(experiment);setSelected(new Set());setHints(experiment==='physics');refresh();inform('見本を配置しました · 編集は Undo で戻せます');};
  const [initialSize]=useState({width:window.innerWidth,height:window.innerHeight});
  return <main className="lab" data-revision={revision}>
    <header className="app-header"><div className="brand-icon"><FlaskConical size={20}/></div><div className="brand"><h1>セル流体実験台 <span>FLUID LAB</span></h1><p>置く。動かす。発見する。</p></div><span className="version-tag">SANDBOX / 01</span>
      <div className="header-actions"><button onClick={undo} title="Undo · Ctrl / ⌘ + Z" disabled={!engine.history.length}><Undo2 size={15}/><span>戻す</span></button><i/><button onClick={saved}><Save size={15}/><span>保存</span></button><button onClick={load}><FolderOpen size={15}/><span>読込</span></button><select className="experiment-select" aria-label="実験見本" value={experiment} onChange={e=>setExperiment(e.target.value)}><option value="cycles">三つの循環</option><option value="hydrogen-cycle">水素循環</option><option value="crystal-cycle">結晶循環</option><option value="extraction-cycle">抽出循環</option><option value="overview">合成・分離と関節</option><option value="joints">関節の比較</option><option value="physics">物理の見本</option><option value="dissolve">溶解と析出</option><option value="distill">混合液の蒸留</option><option value="reaction">沈殿と膜分離</option></select><button onClick={resetDemo}><FlaskConical size={15}/><span>見本</span></button><button className="icon-button help-button" aria-label="操作ガイド" onClick={()=>setHelp(true)}><HelpCircle size={18}/></button></div>
    </header>
    <div className="workspace">
      <div className="workspace-label"><span className="live-dot"/>CELLULAR PHYSICS <span className="dim">/ 400 × 224</span></div>
      <div className="canvas-fit"><canvas ref={canvas} width={1600} height={896} aria-label="流体実験キャンバス" className={`board tool-${tool}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={()=>{if(gesture.current){gesture.current=null;refresh();}}} onPointerLeave={()=>{if(!gesture.current){cursorRef.current=null;setCursor(null);}}} onContextMenu={e=>e.preventDefault()}/></div>
      <div className="view-controls"><button className={grid?'active':''} title="グリッド表示" aria-label="グリッド表示" aria-pressed={grid} onClick={()=>setGrid(!grid)}><Grid2X2 size={14}/></button><button className={connections?'active':''} title="接続線表示" aria-label="接続線表示" aria-pressed={connections} onClick={()=>setConnections(!connections)}><GitBranch size={14}/></button><button className={thermal?'active':''} aria-pressed={thermal} onClick={()=>{setThermal(!thermal);setView(thermal?'matter':'temperature');}}><Thermometer size={14}/><span>温度</span></button></div>
      <div className="observation-controls"><select aria-label="観察モード" value={view} onChange={e=>{setView(e.target.value as typeof view);setThermal(e.target.value==='temperature');}}><option value="matter">物質表示</option><option value="temperature">温度表示</option><option value="component">成分濃度</option><option value="flow">流れ・装置</option></select>{view==='component'&&<select aria-label="観察成分" value={component} onChange={e=>setComponent(Number(e.target.value))}>{MATERIALS.slice(1).map((m,i)=><option key={m.id} value={i+1}>{m.name}</option>)}</select>}</div>
      {engine.experimentTitle&&<div className="experiment-caption"><strong>{engine.experimentTitle}</strong><span>{engine.experimentDescription}</span></div>}
      {thermal&&<div className="temperature-legend"><span>−20°</span><i/><span>1,200°C</span></div>}
      <div className="canvas-footer"><span><span className="keycap">{currentTool.key||'↗'}</span>{currentTool.name}</span><span>右クリックで消去 <b>·</b> ホイールでブラシ調整</span></div>
    </div>
    <FloatingPanel title="ツール" icon={Wrench} initial={{x:16,y:86}} className="tools-panel">
      <div className="playback"><button className={`play-button ${running?'running':''}`} onClick={toggleRunning}>{running?<Pause size={15}/>:<Play size={15}/>}<span>{running?'停止':'再生'}</span><kbd>Space</kbd></button><div className="speed-switch">{[1,2,3].map(s=><button key={s} className={speed===s?'active':''} onClick={()=>setSpeed(s)}>{s}×</button>)}</div></div>
      <div className="section-label">物質 <span>実在 / 架空</span></div><select aria-label="物質分類" className="material-group" value={materialGroup} onChange={e=>setMaterialGroup(e.target.value)}><option value="all">すべて</option><option value="liquid">液体</option><option value="gas">気体</option><option value="powder">粉体</option><option value="solid">固体</option><option value="reaction">循環材料</option></select><div className="material-grid">{MATERIALS.map((m,i)=>({m,i})).filter(({m,i})=>materialGroup==='all'||m.phase===materialGroup||materialGroup==='reaction'&&[1,7,9,11,14,15,16,17].includes(i)).map(({m,i})=><button key={m.name} className={`material ${material===i?'active':''}`} onClick={()=>chooseMaterial(i)} title={`${m.fictional?'架空物質 · ':''}${m.description??m.name} · 比重 ${m.density} · ${m.temperature}℃`}><span className="material-dot" style={{background:`rgb(${m.color.join(',')})`}}/>{m.name}{material===i&&<Check size={12}/>}</button>)}</div>
      <div className="selected-material"><span style={{color:`rgb(${MATERIALS[material].color.join(',')})`}}>{MATERIALS[material].en}</span><span>{MATERIALS[material].phase==='gas'?'気体':MATERIALS[material].phase==='liquid'?'液体':MATERIALS[material].phase==='powder'?'粒状固体':'固体'} · 比重 {MATERIALS[material].density} <b>·</b> {MATERIALS[material].temperature}°C</span></div>
      {MATERIALS[material].description&&<p className="material-card">{MATERIALS[material].fictional?'架空物質':'性質'} · {MATERIALS[material].description}</p>}
      <p className="small-note">{MATERIAL_PATHS[material]??''}</p><ValueControl label="ブラシ半径" value={radius} min={1} max={28} step={1} unit="cell" onChange={setRadius}/>
      <div className="section-label">配置と編集 <span>TOOLS</span></div><div className="tool-grid">{TOOLS.map(t=><button key={t.id} title={`${t.name}${t.key?` · ${t.key}`:''}`} className={tool===t.id?'active':''} onClick={()=>setTool(t.id)}><t.icon size={15}/><span>{t.name}</span>{t.key&&<kbd>{t.key}</kbd>}</button>)}</div>
      <details className="material-settings"><summary><SlidersHorizontal size={13}/>物質のふるまい<ChevronDown size={12}/></summary><p className="small-note">{MATERIALS[material].phase==='solid'?'固体は形状を維持します。粘度を下げても流体にはなりません。':MATERIALS[material].phase==='gas'?'気体は上昇し、天井付近で拡散します。':MATERIALS[material].phase==='powder'?'粉体は落下し、山状に積もります。':'液体は水面をならします。粘度は流れる速さに影響します。'}</p><ValueControl label="粘度" value={engine.viscosity[material]} min={0} max={100} step={1} onChange={v=>{engine.editEpoch++;engine.viscosity[material]=v;refresh();}}/><ValueControl label="熱伝導率" value={engine.conductivity[material]} min={0} max={1} step={.01} onChange={v=>{engine.editEpoch++;engine.conductivity[material]=v;refresh();}}/></details>
    </FloatingPanel>
    <FloatingPanel title="プロパティ" icon={SlidersHorizontal} initial={{x:Math.max(16,initialSize.width-(initialSize.width<600?171:270)),y:86}} className="properties-panel">
      {node&&nodePose?<>
        <div className="object-heading"><span className={`object-symbol ${node.kind}`}><NodeIcon node={node}/></span><div><strong>{node.name}</strong><span>#{String(node.id).padStart(2,'0')} · {node.joint==='fixed'?'固定関節':node.joint==='spring'?'ばね復帰関節':'自由関節'}</span></div></div>
        <label className="text-field">名前<input aria-label="オブジェクト名" value={node.name} maxLength={100} onFocus={beforeEdit} onChange={e=>edit(node,{name:e.target.value})}/></label>
        <div className="coordinate-row"><span>X <b>{nodePose.x.toFixed(1)}</b></span><span>Y <b>{nodePose.y.toFixed(1)}</b></span><span>角度 <b>{(nodePose.a*180/Math.PI%360).toFixed(0)}°</b></span></div>
        {['pump','valve','membrane','processor'].includes(node.kind)&&<>
          {node.kind==='processor'&&<><label className="text-field">処理方式<select aria-label="処理方式" value={node.process??'electrolysis'} onChange={e=>{beforeEdit();edit(node,{process:e.target.value as Process,name:node.name==='循環装置'||Object.values(PROCESSES).some(p=>p.name===node.name)?PROCESSES[e.target.value as Process].name:node.name});}}>{Object.entries(PROCESSES).map(([id,p])=><option key={id} value={id}>{p.name}</option>)}</select></label><p className="small-note">{PROCESSES[node.process??'electrolysis'].description}</p><ValueControl label="電力・冷却能力" value={node.power??1200} min={0} max={100000} step={100} unit="E/s" onStart={beforeEdit} onChange={v=>edit(node,{power:v})}/></>}
          <label className="toggle-row"><input type="checkbox" aria-label="装置を有効にする" checked={node.enabled??true} onChange={e=>{beforeEdit();edit(node,{enabled:e.target.checked});}}/><span>{node.kind==='valve'?'バルブを開く':'装置を有効にする'}</span></label>
          <ValueControl label="流量" value={node.flowRate??2} min={0} max={10} step={.1} unit="量/s" onStart={beforeEdit} onChange={v=>edit(node,{flowRate:v})}/>
          {!node.customPorts&&<><ValueControl label="流れの方向" value={node.portAngle??0} min={0} max={360} step={1} unit="°" onStart={beforeEdit} onChange={v=>edit(node,{portAngle:v})}/>
          <ValueControl label="ポート距離" value={node.portDistance??6} min={2} max={30} step={1} unit="cell" onStart={beforeEdit} onChange={v=>edit(node,{portDistance:v})}/></>}{node.customPorts&&<p className="small-note">個別ポート配置中。座標は下の「ポートの個別配置」で調整できます。</p>}
          {node.kind==='membrane'&&<label className="text-field">通過成分<select aria-label="通過成分" value={node.filterMaterial??1} onFocus={beforeEdit} onChange={e=>edit(node,{filterMaterial:Number(e.target.value)})}>{MATERIALS.slice(1).map((m,i)=><option key={m.id} value={i+1}>{m.name}</option>)}</select></label>}
          <details><summary>ポートの個別配置</summary><p className="small-note">装置中心からの相対座標。主入口・主出口・補助を槽内に置きます。</p>{(['input','output','aux'] as const).filter(key=>node.kind==='processor'||key!=='aux').map(key=>{const a=(node.portAngle??0)*Math.PI/180,d=node.portDistance??6,ports:CustomPorts=node.customPorts??{input:{x:-Math.cos(a)*d,y:-Math.sin(a)*d},output:{x:Math.cos(a)*d,y:Math.sin(a)*d},aux:{x:-Math.sin(a)*d,y:Math.cos(a)*d}},label=key==='input'?'主入口':key==='output'?'主出口':'補助';return <div key={key}>{(['x','y'] as const).map(axis=><ValueControl key={axis} label={`${label} ${axis.toUpperCase()}`} value={ports[key][axis]} min={-400} max={400} step={1} unit="cell" onStart={beforeEdit} onChange={v=>edit(node,{customPorts:{...ports,[key]:{...ports[key],[axis]:v}}})}/>)}</div>;})}<button className="full-button" onClick={()=>{beforeEdit();edit(node,{customPorts:undefined});}}>標準ポート配置へ戻す</button></details>
          <div className="device-status" role="status">{node.deviceStatus??'待機中'} · 累計 {(node.transported??0).toFixed(2)}</div>
          {node.kind==='processor'&&<p className="small-note">投入電力 {(node.energyUsed??0).toFixed(2)} E · 除去熱 {(node.heatRemoved??0).toFixed(2)} E</p>}
          <p className="small-note">矢印の根元が入口、先が出口。移送先が満杯、遮断、または成分上限を超える場合は材料を保持して待機します。</p>
        </>}
        {node.kind==='thermostat'&&<>
          <ValueControl label="目標温度" value={node.targetTemperature??100} min={-273} max={2000} step={1} unit="°C" onStart={beforeEdit} onChange={v=>edit(node,{targetTemperature:v})}/>
          <div className="segment"><button aria-label="目標温度を10度下げる" onClick={()=>{beforeEdit();edit(node,{targetTemperature:clamp((node.targetTemperature??100)-10,-273,2000)});}}><Minus size={14}/>10°C</button><button aria-label="目標温度を10度上げる" onClick={()=>{beforeEdit();edit(node,{targetTemperature:clamp((node.targetTemperature??100)+10,-273,2000)});}}><Plus size={14}/>10°C</button></div>
          <ValueControl label="影響半径" value={node.effectRadius??12} min={1} max={40} step={1} unit="cell" onStart={beforeEdit} onChange={v=>edit(node,{effectRadius:v})}/>
          <label className="toggle-row"><input type="checkbox" checked={node.enabled??true} onChange={e=>{beforeEdit();edit(node,{enabled:e.target.checked});}}/><span>温度調整装置を有効にする</span></label>
          <p className="small-note">再生中、円内を目標温度へ徐々に近づけます。流体を遮らず、壁も温めます。停止中は温度を変えません。</p>
        </>}
        {node.kind==='motor'&&<>
          <div className="segment"><button className={node.mode==='rotation'?'active':''} onClick={()=>{beforeEdit();edit(node,{mode:'rotation'});}}><RotateCcw size={13}/>回転</button><button className={node.mode==='piston'?'active':''} onClick={()=>{beforeEdit();edit(node,{mode:'piston'});}}><ScanLine size={13}/>ピストン</button></div>
          <div className="field-label">駆動方向</div><div className="segment direction">{[{v:1,t:'正転'},{v:0,t:'停止'},{v:-1,t:'逆転'}].map(d=><button key={d.v} className={node.direction===d.v?'active':''} onClick={()=>{beforeEdit();edit(node,{direction:d.v});}}>{d.t}</button>)}</div>
          <ValueControl label="速度" value={node.speed} min={0} max={10} step={.1} onStart={beforeEdit} onChange={v=>edit(node,{speed:v})}/>
          {node.mode==='piston'&&<>
            <ValueControl label="ストローク" value={node.amp} min={0} max={240} step={1} unit="cell" onStart={beforeEdit} onChange={v=>edit(node,{amp:v})}/>
            <ValueControl label="ピストン方向" value={node.strokeAngle*180/Math.PI} min={0} max={360} step={1} unit="°" onStart={beforeEdit} onChange={v=>edit(node,{strokeAngle:v*Math.PI/180})}/>
            <label className="toggle-row"><input type="checkbox" checked={node.repeat} onChange={e=>{beforeEdit();edit(node,{repeat:e.target.checked,bounce:1});}}/><span>ストロークを反復する</span></label><div className="stroke-meter"><span>伸び率</span><progress max={1} value={node.t}/><b>{Math.round(node.t*100)}%</b></div>
          </>}
          {node.blocked&&<div className="warning">ガイド・盤面端・押し出し不能な密閉空間のため駆動を取り消しました</div>}
        </>}
        {(node.kind==='rect'||node.kind==='circle')&&<ValueControl label="角度" value={((nodePose.a*180/Math.PI%360)+360)%360} min={0} max={360} step={1} unit="°" onStart={beforeEdit} onChange={v=>{engine.setWorld(node,nodePose.x,nodePose.y,v*Math.PI/180);engine.rasterize();refresh();}}/>}
        <div className="section-label">接続 <span>JOINT</span></div><label className="text-field">親オブジェクト<select aria-label="親オブジェクト" value={node.parent??''} onChange={e=>{beforeEdit();if(!engine.reparent(node.id,e.target.value===''?null:Number(e.target.value)))inform('循環する接続は作れません');engine.rasterize();refresh();}}><option value="">背景</option>{engine.nodes.filter(n=>!engine.isDescendant(n.id,node.id)).map(n=><option value={n.id} key={n.id}>{n.name} #{n.id}</option>)}</select></label>
        <div className="segment"><button className={node.joint==='fixed'?'active':''} onClick={()=>{beforeEdit();engine.setJoint(node.id,'fixed');refresh();}}>固定関節</button><button className={node.joint==='free'?'active':''} onClick={()=>{beforeEdit();engine.setJoint(node.id,'free');refresh();}}>自由関節</button><button className={node.joint==='spring'?'active':''} onClick={()=>{beforeEdit();engine.setJoint(node.id,'spring');refresh();}}>ばね復帰</button></div><p className="small-note">{node.joint==='fixed'?'親の移動と回転に追従します。':node.joint==='spring'?'ガイドで曲がり、離れると基準角度に戻ります。':'ガイドで曲がり、その後は世界に対する角度を保ちます。'}</p>
        <p className="small-note">選択中の関節マーカーをドラッグすると、物体を動かさず支点を変更できます。</p>
        {node.joint==='spring'&&<><label>曲がりの上限（度）<input aria-label="関節の角度上限" type="range" min="0" max="180" value={(node.jointLimit??Math.PI/2)*180/Math.PI} onPointerDown={beforeEdit} onChange={e=>{engine.editEpoch++;node.jointLimit=+e.target.value*Math.PI/180;refresh();}}/></label><label>ばねの強さ<input aria-label="ばねの強さ" type="range" min="0" max="80" value={node.stiffness??18} onPointerDown={beforeEdit} onChange={e=>{engine.editEpoch++;node.stiffness=+e.target.value;refresh();}}/></label><label>減衰<input aria-label="関節の減衰" type="range" min="0" max="30" value={node.damping??8} onPointerDown={beforeEdit} onChange={e=>{engine.editEpoch++;node.damping=+e.target.value;refresh();}}/></label></>}

        <div className="object-actions"><button onClick={()=>{beforeEdit();engine.detach(node.id);refresh();}}><GitBranch size={13}/>子を外す</button><button className="danger" onClick={remove}><Trash2 size={13}/>削除</button></div>
      </>:selected.size>1?<><div className="empty-properties"><Layers size={28}/><strong>{selected.size} 個のオブジェクトを選択</strong><p>選択されたまとまりをドラッグで移動できます。親子は二重に移動しません。</p></div><button className="full-button danger" onClick={remove}><Trash2 size={14}/>選択オブジェクトを削除</button></>:<>
        <div className="empty-properties"><currentTool.icon size={27}/><strong>{currentTool.name}</strong><p>{currentTool.description}</p></div><div className="tip"><MousePointer2 size={14}/><span>機械を選択すると、ここで設定を編集できます。</span></div><div className="mini-legend"><span><i className="legend-wall"/>壁</span><span><i className="legend-guide"/>ガイド</span><span><i className="legend-body"/>可動壁</span><span><i className="legend-motor"/>モーター</span></div>
      </>}
    </FloatingPanel>
    <FloatingPanel title="オブジェクト" icon={Layers} initial={{x:Math.max(16,initialSize.width-(initialSize.width<600?171:270)),y:initialSize.width<600?129:Math.min(460,Math.max(320,initialSize.height-300))}} className="objects-panel">
      <div className="tree-root"><ChevronDown size={13}/><Grid2X2 size={13}/><span>背景</span><b>{engine.nodes.length}</b></div><div className="object-tree">{treeRows.length?treeRows.map(({node:n,depth})=><div className={`tree-row ${selected.has(n.id)?'selected':''}`} key={n.id} style={{paddingLeft:12+depth*13}}><button className="tree-select" onClick={e=>{setTool('select');setSelected(s=>{if(e.shiftKey){const next=new Set(s);if(next.has(n.id))next.delete(n.id);else next.add(n.id);return next;}return new Set([n.id]);});}}><NodeIcon node={n}/><span>{n.name}</span>{n.blocked&&<i className="blocked-dot" title="ガイドまたは盤面端に接触"/>}</button><button title={`${n.joint==='fixed'?'固定':n.joint==='spring'?'ばね復帰':'自由'}関節 · クリックで切替`} aria-label={`${n.name}の関節切替`} className={`joint-tag ${n.joint}`} onClick={()=>{beforeEdit();engine.setJoint(n.id,n.joint==='fixed'?'free':n.joint==='free'?'spring':'fixed');refresh();}}>{n.joint==='fixed'?'固定':n.joint==='spring'?'ばね':'自由'}</button></div>):<p className="tree-empty">モーターや可動壁を配置すると<br/>接続関係がここに表示されます。</p>}</div><div className="tree-footer"><span>Shift + クリックで複数選択</span><button title="盤面を全消去 · Undo可能" aria-label="盤面を全消去" onClick={()=>{engine.checkpoint();engine.clear();setSelected(new Set());setHints(false);refresh();inform('盤面を空にしました · Undo で戻せます');}}><Trash2 size={13}/></button></div>
    </FloatingPanel>
    <footer className="statusbar"><span className={`status-indicator ${running?'playing':''}`}/><span>{running?'シミュレーション実行中':'編集モード · 停止中'}</span><span className="status-separator"/><span className="cursor-status">X <b>{cursor?.x??'—'}</b> Y <b>{cursor?.y??'—'}</b>{cursor&&<><i/><span>{engine.chemistry.components(engine.index(cursor.x,cursor.y)).map(p=>`${MATERIALS[p.material].name} ${(p.amount/engine.chemistry.mass(engine.index(cursor.x,cursor.y))*100).toFixed(0)}%`).join(' / ')||'空気'}</span><b>{cursor.temperature.toFixed(1)}°C</b><span>量 {engine.chemistry.mass(engine.index(cursor.x,cursor.y)).toFixed(2)}</span></>}</span><span className="status-right"><span>{stats.count.toLocaleString()} セル / 量 {stats.mass.toFixed(1)}</span>{engine.trapped.length>0&&<span title="逃げ場ができると盤面に戻ります">{engine.trapped.length} 粒子を一時保持</span>}<span>{(stats.tick/60).toFixed(1)} s</span><span title="1.00×が実時間。高負荷では進行を遅くして操作応答を保ちます">進行 {stats.rate.toFixed(2)}×</span><span title="シミュレーション1ステップの計算時間">{stats.stepMs.toFixed(1)} ms</span><span className={stats.fps<30?'low-fps':''}>{stats.fps} FPS</span></span></footer>
    {notice&&<div className="toast" role="status"><Check size={16}/>{notice}</div>}
    {help&&<div className="modal-backdrop" onClick={()=>setHelp(false)}><section className="help-modal" aria-modal="true" role="dialog" aria-label="操作ガイド" onClick={e=>e.stopPropagation()}><button className="modal-close icon-button" aria-label="ガイドを閉じる" onClick={()=>setHelp(false)}><X size={19}/></button><FlaskConical size={30}/><h2>小さなセルから、実験を。</h2><p>物質を置いて、機械で動かして、その変化を観察する。</p><div className="reaction-card"><strong>{REACTIONS[0].name}</strong><p>{REACTIONS[0].ratio} · {REACTIONS[0].temperature}</p><p>晶塩は水に溶け、冷却で析出。揮発溶媒は65°Cから蒸発。抽出液は水と分離し、晶塩の回収に使えます。</p></div><ol><li><strong>物質を置く</strong><span>物質を選び、盤面をドラッグ。水・油・水銀の密度差を試してみましょう。</span></li><li><strong>機械を組む</strong><span>モーターと可動壁を置き、接続ツール（0）で子→親の順にクリック。関節は固定・自由・ばね復帰から選び、支点をドラッグで調整します。</span></li><li><strong>動かして観察</strong><span>Space で再生・停止。停止中も移動・設定ができます。加熱・冷却と温度表示で相変化を観察。</span></li></ol><div className="shortcut-list"><span><kbd>V</kbd>選択・移動</span><span><kbd>1–0</kbd>ツール切替</span><span><kbd>Space</kbd>再生 / 停止</span><span><kbd>[ ]</kbd>ブラシ半径</span><span><kbd>Ctrl / ⌘ Z</kbd>Undo</span><span><kbd>Delete</kbd>選択を削除</span></div><p className="small-note">ウィンドウはタイトルバーをドラッグして移動、− で折りたたみ。保存はこのブラウザ内のみ。科学計算用の CFD ではなく、挙動を楽しむセルモデルです。</p><button className="full-button accent" onClick={()=>setHelp(false)}>実験をはじめる <Play size={14}/></button></section></div>}
  </main>;
}
function NodeIcon({node}:{node:LabNode}) {const Icon=node.kind==='processor'?FlaskConical:node.kind==='motor'?Cog:node.kind==='pump'?ScanLine:node.kind==='valve'?SlidersHorizontal:node.kind==='membrane'?Layers:node.kind==='thermostat'?Thermometer:node.kind==='pin'?MapPin:node.kind==='rect'?Square:Circle;return <Icon size={13} className={`node-icon ${node.kind}`}/>;}

const MATERIAL_PATHS:Record<number,string>={0:'有限の空気：酸素23%・窒素77%を配置します。空白から酸素は供給されません。',1:'水 → 電解 → 水素＋酸素 → 燃焼 → 水蒸気 → 凝縮 → 水',2:'油＋酸素 → 二酸化炭素＋水蒸気。酸素不足では煤が残ります。',8:'煤＋酸素 → 二酸化炭素。着火には450°C以上が必要。',9:'水素＋酸素 → 水蒸気。自然着火は350°C以上。電解槽で水から再生。',11:'晶塩＋活性剤 → 複合結晶 → 加熱再生。抽出液による回収も可能。',14:'水溶液の晶塩を抽出 → 回収器で分離 → 抽出液を再利用。',15:'晶塩と反応。複合結晶を加熱再生すると戻ります。',16:'結晶再生器 → 晶塩＋活性剤 → 冷却・混合して再生成。',17:'電解槽で水から生成。燃焼で有限量を消費します。',18:'油・煤の燃焼生成物。燃料にはならず、酸素の代わりには使えません。'};
