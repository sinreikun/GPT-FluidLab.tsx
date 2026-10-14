import { Engine, W, H, SIZE, MATERIALS, type Pose } from './engine';
export interface RenderOptions { selected: Set<number>; temperature: boolean; view?: 'matter'|'temperature'|'component'|'flow'; component?:number; connections: boolean; grid: boolean; hints: boolean; preview?: {tool:string;x0:number;y0:number;x1:number;y1:number}; cursor?:{x:number;y:number;radius:number;tool:string} }
export class Renderer {
  private buffer=document.createElement('canvas');
  private image:ImageData;
  constructor() {this.buffer.width=W;this.buffer.height=H;this.image=new ImageData(W,H);}
  render(ctx:CanvasRenderingContext2D,engine:Engine,opts:RenderOptions) {
    const data=this.image.data;
    for(let i=0;i<SIZE;i++) {
      const m=engine.cells[i],terrain=engine.terrain[i],color=MATERIALS[m].color;
      let r=color[0],g=color[1],b=color[2];
      if(!m) {r=12;g=20;b=29;}
      else if(engine.chemistry.secondary[i]){
        const c=engine.chemistry,total=c.mass(i),a=c.amount[i]/total,b1=c.secondaryAmount[i]/total,b2=c.tertiaryAmount[i]/total;
        const s=MATERIALS[c.secondary[i]].color,t=MATERIALS[c.tertiary[i]].color;
        r=r*a+s[0]*b1+t[0]*b2;g=g*a+s[1]*b1+t[1]*b2;b=b*a+s[2]*b1+t[2]*b2;
      }
      if(m) {const noise=((i*17+i%W*13)%11-5)*.7;r+=noise;g+=noise;b+=noise;}
      if(m){const opacity=Math.min(1,2*Math.sqrt(engine.chemistry.mass(i)));r=12+(r-12)*opacity;g=20+(g-20)*opacity;b=29+(b-29)*opacity;}
      if(opts.view==='component'){
        const amount=engine.chemistry.quantity(i,opts.component??11),fraction=amount/Math.max(.00001,engine.chemistry.mass(i));
        r=12+fraction*88;g=20+fraction*220;b=29+fraction*140;
      }
      if(terrain===1){r=68;g=82;b=95;}
      if(terrain===2){if((i%W+Math.floor(i/W))%5===0){r=93;g=124;b=98;}else if(!m){r=20;g=36;b=32;}}
      if(opts.temperature) {
        const t=engine.temperature[i];const hot=t>25;const blend=Math.min(.72,Math.abs(t-20)/(hot?650:65));
        const overlay=hot?[255,72,37]:[65,145,255];r=r*(1-blend)+overlay[0]*blend;g=g*(1-blend)+overlay[1]*blend;b=b*(1-blend)+overlay[2]*blend;
      }
      data[i*4]=r;data[i*4+1]=g;data[i*4+2]=b;data[i*4+3]=255;
    }
    this.buffer.getContext('2d')!.putImageData(this.image,0,0);
    ctx.save();ctx.setTransform(ctx.canvas.width/W,0,0,ctx.canvas.height/H,0,0);ctx.imageSmoothingEnabled=false;
    ctx.drawImage(this.buffer,0,0);
    if(opts.grid) {ctx.strokeStyle='rgba(102,139,161,.09)';ctx.lineWidth=.25;ctx.beginPath();for(let x=0;x<=W;x+=20){ctx.moveTo(x,0);ctx.lineTo(x,H);}for(let y=0;y<=H;y+=20){ctx.moveTo(0,y);ctx.lineTo(W,y);}ctx.stroke();}
    const poses=engine.poses();
    if(opts.connections)for(const n of engine.nodes) if(n.parent!==null) {
      const p=poses.get(n.id)!,parent=poses.get(n.parent)!;ctx.strokeStyle=n.joint==='fixed'?'#6eb1a680':'#b6a7e099';ctx.lineWidth=.5;ctx.setLineDash([1.5,1.5]);ctx.beginPath();ctx.moveTo(parent.ax,parent.ay);const hinge=engine.jointPoint(n.id,poses);ctx.lineTo(hinge.x,hinge.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);
    }
    for(const n of engine.nodes.filter(n=>n.kind==='rect'||n.kind==='circle')) {
      const p=poses.get(n.id)!;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);
      const selected=opts.selected.has(n.id);ctx.fillStyle=selected?'#8fe5d4':'#8aabaf';ctx.strokeStyle=selected?'#e1fff6':'#bdd0d0';ctx.lineWidth=selected?.7:.35;
      ctx.beginPath();if(n.kind==='rect')ctx.rect(-n.width/2,-n.height/2,n.width,n.height);else ctx.arc(0,0,n.radius,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(selected){ctx.strokeStyle='#68e2bc';ctx.lineWidth=.35;ctx.setLineDash([2,1]);if(n.kind==='rect')ctx.strokeRect(-n.width/2-2,-n.height/2-2,n.width+4,n.height+4);else{ctx.beginPath();ctx.arc(0,0,n.radius+2,0,Math.PI*2);ctx.stroke();}}
      ctx.restore();
    }
    for(const n of engine.nodes.filter(n=>n.kind==='motor')) {
      const p=poses.get(n.id)!;const selected=opts.selected.has(n.id);const color=n.blocked?'#fb826b':'#f5c46a';
      if(n.mode==='piston') {
        const a=p.a+n.strokeAngle,ex=p.x+Math.cos(a)*n.amp,ey=p.y+Math.sin(a)*n.amp;
        ctx.strokeStyle='#f5c46a55';ctx.lineWidth=.5;ctx.setLineDash([1.5,1.5]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(ex,ey);ctx.stroke();ctx.setLineDash([]);
        ctx.strokeStyle=color;ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.ax,p.ay);ctx.stroke();
        ctx.beginPath();ctx.arc(p.ax,p.ay,1.4,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
      }
      this.motor(ctx,p,color,selected,n.mode==='rotation');
    }
    for(const n of engine.nodes.filter(n=>n.kind!=='motor'&&n.kind!=='pin'&&(opts.selected.has(n.id)||opts.connections&&n.parent!==null))){const p=engine.jointPoint(n.id,poses);ctx.fillStyle=n.jointContact?'#ffbc74':n.joint==='spring'?'#ffd878':n.joint==='free'?'#c5a4ff':'#6fe4c0';ctx.strokeStyle='#102b32';ctx.lineWidth=.6;ctx.beginPath();if(n.joint==='fixed')ctx.rect(p.x-1.3,p.y-1.3,2.6,2.6);else ctx.arc(p.x,p.y,1.7,0,Math.PI*2);ctx.fill();ctx.stroke();if(n.joint==='spring'){ctx.beginPath();ctx.arc(p.x,p.y,.7,0,Math.PI*2);ctx.stroke();}}
    for(const n of engine.nodes.filter(n=>n.kind==='pin')) {
      const p=poses.get(n.id)!;ctx.fillStyle=n.joint==='free'?'#beabef':'#6fe4c0';ctx.strokeStyle=opts.selected.has(n.id)?'#fff':'#153a35';ctx.lineWidth=.6;ctx.beginPath();ctx.arc(p.x,p.y,1.5,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    for(const n of engine.nodes.filter(n=>n.kind==='thermostat')){
      const p=poses.get(n.id)!,target=n.targetTemperature??100,selected=opts.selected.has(n.id);
      const color=!n.enabled?'#7c8994':target>=20?'#f1a572':'#83c5fa';
      ctx.save();ctx.strokeStyle=color;ctx.lineWidth=selected?.7:.4;
      if(selected){ctx.fillStyle=target>=20?'#f1a57212':'#83c5fa12';ctx.setLineDash([1.5,1.5]);ctx.beginPath();ctx.arc(p.x,p.y,n.effectRadius??12,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.setLineDash([]);}
      ctx.fillStyle='#182630';ctx.fillRect(p.x-2.5,p.y-2.5,5,5);ctx.strokeRect(p.x-2.5,p.y-2.5,5,5);
      ctx.beginPath();ctx.moveTo(p.x-1.3,p.y);ctx.lineTo(p.x+1.3,p.y);if(target>=20){ctx.moveTo(p.x,p.y-1.3);ctx.lineTo(p.x,p.y+1.3);}ctx.stroke();
      ctx.font='2.3px system-ui';ctx.fillStyle=color;ctx.fillText(n.enabled?`${target>=0?'+':''}${target}°C`:'OFF',p.x+4,p.y+1);ctx.restore();
    }
    for(const n of engine.nodes.filter(n=>['pump','valve','membrane'].includes(n.kind))){
      const p=poses.get(n.id)!,ports=engine.devicePorts(n),color=!n.enabled?'#8c9aa7':n.deviceStatus==='移送中'?'#78e4b3':'#a1c6df';
      ctx.save();ctx.strokeStyle=color;ctx.fillStyle='#172a35';ctx.lineWidth=.65;
      ctx.setLineDash(n.enabled?[]:[2,1]);ctx.beginPath();ctx.moveTo(ports.input.x,ports.input.y);ctx.lineTo(ports.output.x,ports.output.y);ctx.stroke();ctx.setLineDash([]);
      const a=Math.atan2(ports.output.y-ports.input.y,ports.output.x-ports.input.x);ctx.beginPath();ctx.moveTo(ports.output.x,ports.output.y);ctx.lineTo(ports.output.x-Math.cos(a-.5)*3,ports.output.y-Math.sin(a-.5)*3);ctx.moveTo(ports.output.x,ports.output.y);ctx.lineTo(ports.output.x-Math.cos(a+.5)*3,ports.output.y-Math.sin(a+.5)*3);ctx.stroke();
      ctx.beginPath();ctx.arc(ports.input.x,ports.input.y,1,0,Math.PI*2);ctx.stroke();
      ctx.fillRect(p.x-2.8,p.y-2.8,5.6,5.6);ctx.strokeRect(p.x-2.8,p.y-2.8,5.6,5.6);
      ctx.fillStyle=color;ctx.font='2.8px system-ui';ctx.fillText(n.kind==='pump'?'P':n.kind==='valve'?'V':'M',p.x-1,p.y+1);
      if(opts.selected.has(n.id)||opts.view==='flow'){
        ctx.font='2.1px system-ui';ctx.fillText(n.deviceStatus??'待機中',p.x+4,p.y+1);
        if(n.kind==='membrane')ctx.fillText(`通過: ${MATERIALS[n.filterMaterial??1].name}`,p.x+4,p.y+4);
        if(n.deviceStatus==='移送中'){const f=(engine.tick%50)/50;ctx.beginPath();ctx.arc(ports.input.x+(ports.output.x-ports.input.x)*f,ports.input.y+(ports.output.y-ports.input.y)*f,1,0,Math.PI*2);ctx.fill();}
      }
      ctx.restore();
    }
    if(opts.hints&&!engine.experimentTitle) {
      const label=(x:number,y:number,num:string,title:string,sub:string)=>{ctx.font='2.6px system-ui';ctx.fillStyle='#6fe4c0';ctx.fillText(num,x,y);ctx.fillStyle='#aabecb';ctx.fillText(title,x+7,y);ctx.font='2px system-ui';ctx.fillStyle='#567282';ctx.fillText(sub,x+7,y+4);};
      label(79,84,'01','密度と攪拌','油は浮き、水銀は沈む');label(188,125,'02','熱と相変化','水と溶岩の境界を観察');label(191,42,'03','気体の上昇','水素は上へ');
    }
    if(opts.preview) {
      const p=opts.preview;ctx.strokeStyle='#87eed4';ctx.fillStyle='#87eed419';ctx.lineWidth=.6;ctx.setLineDash([2,1]);ctx.beginPath();
      if(p.tool.endsWith('Circle'))ctx.arc(p.x0,p.y0,Math.hypot(p.x1-p.x0,p.y1-p.y0),0,Math.PI*2);else ctx.rect(Math.min(p.x0,p.x1),Math.min(p.y0,p.y1),Math.abs(p.x1-p.x0),Math.abs(p.y1-p.y0));ctx.fill();ctx.stroke();ctx.setLineDash([]);
      ctx.font='2.5px system-ui';ctx.fillStyle='#bdeddd';ctx.fillText(p.tool.endsWith('Circle')?`r ${Math.hypot(p.x1-p.x0,p.y1-p.y0).toFixed(0)}`:`${Math.abs(p.x1-p.x0).toFixed(0)} × ${Math.abs(p.y1-p.y0).toFixed(0)}`,p.x1+2,p.y1-2);
    }
    if(opts.cursor) {
      const p=opts.cursor;ctx.strokeStyle=p.tool==='erase'?'#f19a8b88':'#8ce9d388';ctx.lineWidth=.4;ctx.beginPath();ctx.arc(p.x,p.y,['fluid','erase','heat','cool'].includes(p.tool)?p.radius:1.5,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(p.x-2,p.y);ctx.lineTo(p.x+2,p.y);ctx.moveTo(p.x,p.y-2);ctx.lineTo(p.x,p.y+2);ctx.stroke();
    }
    ctx.restore();
  }
  private motor(ctx:CanvasRenderingContext2D,p:Pose,color:string,selected:boolean,rotation:boolean) {
    ctx.fillStyle='#19242b';ctx.strokeStyle=color;ctx.lineWidth=.65;ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();ctx.stroke();
    if(selected){ctx.strokeStyle='#edfff6';ctx.lineWidth=.35;ctx.beginPath();ctx.arc(p.x,p.y,4.2,0,Math.PI*2);ctx.stroke();}
    ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+Math.cos(p.a)*2,p.y+Math.sin(p.a)*2);ctx.stroke();
    if(rotation){ctx.beginPath();ctx.arc(p.x,p.y,1.8,p.a+.6,p.a+4.8);ctx.stroke();}
  }
}
