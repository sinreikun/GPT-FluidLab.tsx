import { test, expect, type Page } from '@playwright/test';
async function boardPoint(page:Page,x:number,y:number) {const b=await page.getByLabel('流体実験キャンバス').boundingBox();if(!b)throw new Error('No board');return {x:b.x+b.width*x/400,y:b.y+b.height*y/224};}
async function clickCell(page:Page,x:number,y:number){const p=await boardPoint(page,x,y);await page.mouse.click(p.x,p.y);}
async function dragCell(page:Page,x:number,y:number,x1:number,y1:number){const a=await boardPoint(page,x,y),b=await boardPoint(page,x1,y1);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up();}
async function saveState(page:Page){await page.getByRole('button',{name:'保存',exact:true}).click();return page.evaluate(()=>JSON.parse(localStorage.getItem('cell-fluid-lab-v1')!));}
test('playback, edit while paused, property inputs, save/reload and Undo',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await expect(page.getByRole('heading',{name:'セル流体実験台 FLUID LAB'})).toBeVisible();
  await page.keyboard.press('Space');await expect(page.getByText('編集モード · 停止中')).toBeVisible();
  await page.getByRole('button',{name:'盤面を全消去'}).click();
  await page.getByRole('button',{name:'水',exact:true}).click();await dragCell(page,160,110,175,115);
  let s=await saveState(page);expect(s.cells.filter((n:number)=>n===1).length).toBeGreaterThan(80);
  await page.keyboard.press('9');await clickCell(page,200,100);await expect(page.getByLabel('オブジェクト名')).toBeVisible();
  await page.getByLabel('速度', {exact:true}).fill('3');await page.getByLabel('オブジェクト名').fill('試験モーター');
  // Space and Backspace in a text input must not reach canvas shortcuts.
  await page.getByLabel('オブジェクト名').press('Space');await page.getByLabel('オブジェクト名').press('Backspace');
  await expect(page.getByText('編集モード · 停止中')).toBeVisible();
  await page.getByLabel('オブジェクト名').blur();s=await saveState(page);expect(s.nodes).toHaveLength(1);expect(s.nodes[0].speed).toBe(3);expect(s.nodes[0].name).toBe('試験モーター');
  await dragCell(page,200,100,208,106);s=await saveState(page);expect(s.nodes[0].lx).toBeCloseTo(208.5,0);expect(s.nodes[0].ly).toBeCloseTo(106.5,0);
  await page.keyboard.press('Control+z');s=await saveState(page);expect(s.nodes[0].lx).toBeCloseTo(200.5,0);
  await page.reload();await page.keyboard.press('Space');await expect(page.getByRole('button',{name:'試験モーター',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'盤面を全消去'}).click();await page.getByRole('button',{name:'読込',exact:true}).click();await expect(page.getByRole('button',{name:'試験モーター',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});
test('mechanism construction, automatic joint, multi-select without drag and deletion',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'停止 Space',exact:true}).click();await expect(page.getByText('編集モード · 停止中')).toBeVisible();await page.getByRole('button',{name:'盤面を全消去'}).click();
  await page.keyboard.press('9');await clickCell(page,200,100);
  await page.keyboard.press('7');await dragCell(page,195,96,221,105);
  await page.keyboard.press('0');await clickCell(page,215,100);await clickCell(page,200,100);
  let s=await saveState(page);const body=s.nodes.find((n:any)=>n.kind==='rect'),motor=s.nodes.find((n:any)=>n.kind==='motor');expect(body.parent).toBe(motor.id);expect(s.nodes).toHaveLength(2);
  await page.getByRole('button',{name:'ばね復帰',exact:true}).click();s=await saveState(page);expect(s.nodes.find((n:any)=>n.kind==='rect').joint).toBe('spring');
  await page.getByRole('button',{name:'モーター',exact:true}).click({modifiers:['Shift']});await expect(page.getByText('2 個のオブジェクトを選択')).toBeVisible();
  await page.keyboard.press('Delete');s=await saveState(page);expect(s.nodes).toHaveLength(0);
  await page.keyboard.press('Control+z');s=await saveState(page);expect(s.nodes).toHaveLength(2);
});
test('right erase, square preview, temperature brushes and corrupted storage recovery',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'停止 Space',exact:true}).click();await expect(page.getByText('編集モード · 停止中')).toBeVisible();await page.getByRole('button',{name:'盤面を全消去'}).click();
  await page.getByRole('button',{name:'水',exact:true}).click();await clickCell(page,200,100);let s=await saveState(page);const count=s.cells.filter((n:number)=>n===1).length;expect(count).toBeGreaterThan(0);
  const p=await boardPoint(page,200,100);await page.mouse.click(p.x,p.y,{button:'right'});s=await saveState(page);expect(s.cells.filter((n:number)=>n===1).length).toBe(0);
  await page.keyboard.press('3');await page.keyboard.down('Shift');await dragCell(page,190,110,210,120);await page.keyboard.up('Shift');s=await saveState(page);const cells=s.terrain.map((n:number,i:number)=>n===1?i:-1).filter((i:number)=>i>=0);const xs=cells.map((i:number)=>i%400),ys=cells.map((i:number)=>Math.floor(i/400));expect(Math.max(...xs)-Math.min(...xs)).toBe(Math.max(...ys)-Math.min(...ys));
  await page.getByRole('button',{name:'加熱',exact:true}).click();await clickCell(page,200,100);s=await saveState(page);expect(s.temperature[100*400+200]).toBeGreaterThan(20);
  await page.evaluate(()=>localStorage.setItem('cell-fluid-lab-v1','{"version":4,"width":400,"height":224}'));await page.reload();await expect(page.getByRole('button',{name:'01 · 攪拌モーター',exact:true})).toBeVisible();
});
test('window movement, collapsed mobile panels and runtime without errors',async({page})=>{
  await page.goto('/');await expect(page.getByLabel('流体実験キャンバス')).toBeVisible();
  const tools=page.getByRole('region',{name:'ツール'});const original=await tools.boundingBox();const head=tools.locator('.panel-head');const bounds=await head.boundingBox();if(!bounds||!original)throw new Error('No tool window');
  await page.mouse.move(bounds.x+70,bounds.y+15);await page.mouse.down();await page.mouse.move(bounds.x+130,bounds.y+35,{steps:5});await page.mouse.up();expect((await tools.boundingBox())!.x).toBeGreaterThan(original.x+40);
  await page.getByRole('button',{name:'ツールを折りたたむ'}).click();await expect(page.getByRole('button',{name:'水',exact:true})).toBeHidden();await page.getByRole('button',{name:'ツールを展開'}).click();await expect(page.getByRole('button',{name:'水',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:'水',exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.reload();await expect(page.getByRole('button',{name:'プロパティを展開'})).toBeVisible();await expect(page.getByRole('button',{name:'オブジェクトを展開'})).toBeVisible();await expect(page.getByRole('button',{name:'水',exact:true})).toBeHidden();await page.getByRole('button',{name:'ツールを展開'}).click();await expect(page.getByRole('button',{name:'水',exact:true})).toBeVisible();await page.getByRole('button',{name:'ツールを折りたたむ'}).click();
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
});

test('places an adjustable temperature controller, heats/cools, saves and undoes',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'停止 Space',exact:true}).click();
  await page.getByRole('button',{name:'盤面を全消去'}).click();
  await page.getByRole('button',{name:'温度装置',exact:true}).click();await clickCell(page,200,100);
  await expect(page.getByLabel('目標温度',{exact:true})).toHaveValue('100');
  await page.getByLabel('目標温度',{exact:true}).fill('-50');await page.getByLabel('目標温度',{exact:true}).blur();
  await page.getByRole('button',{name:'目標温度を10度上げる',exact:true}).click();await expect(page.getByLabel('目標温度',{exact:true})).toHaveValue('-40');
  await page.getByRole('button',{name:'目標温度を10度下げる',exact:true}).click();await expect(page.getByLabel('目標温度',{exact:true})).toHaveValue('-50');
  await page.getByLabel('影響半径',{exact:true}).fill('8');await page.getByLabel('影響半径',{exact:true}).blur();
  let s=await saveState(page);expect(s.nodes[0].kind).toBe('thermostat');expect(s.nodes[0].targetTemperature).toBe(-50);expect(s.temperature[100*400+200]).toBe(20);
  await page.getByRole('button',{name:'再生 Space',exact:true}).click();
  await expect.poll(async()=>{const state=await saveState(page);return state.temperature[100*400+200];}).toBeLessThan(0);
  await page.getByRole('button',{name:'停止 Space',exact:true}).click();
  await page.getByLabel('目標温度',{exact:true}).fill('200');await page.getByLabel('目標温度',{exact:true}).blur();
  await page.getByRole('button',{name:'再生 Space',exact:true}).click();
  await expect.poll(async()=>{const state=await saveState(page);return state.temperature[100*400+200];}).toBeGreaterThan(100);
  await page.getByRole('button',{name:'停止 Space',exact:true}).click();await page.reload();
  await page.getByRole('button',{name:'停止 Space',exact:true}).click();await page.getByRole('button',{name:'温度調整装置',exact:true}).click();
  await expect(page.getByLabel('目標温度',{exact:true})).toHaveValue('200');await expect(page.getByLabel('影響半径',{exact:true})).toHaveValue('8');
  await page.keyboard.press('Delete');s=await saveState(page);expect(s.nodes).toHaveLength(0);await page.keyboard.press('Control+z');s=await saveState(page);expect(s.nodes[0].kind).toBe('thermostat');
});

test('chemistry experiments expose composition and configurable separation devices',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await page.getByRole('button',{name:'停止 Space',exact:true}).click();
  await page.getByLabel('実験見本').selectOption('reaction');await page.getByRole('button',{name:'見本',exact:true}).click();
  await expect(page.getByText('晶塩 + 活性剤 → 複合結晶 → 選択膜で回収',{exact:true})).toBeVisible();
  let s=await saveState(page);expect(s.version).toBe(7);expect(s.materialIds).toContain('precipitate-e');expect(s.chemistry.secondaryAmount.some((n:number)=>n>0)).toBe(true);
  await page.getByLabel('観察モード').selectOption('component');await page.getByLabel('観察成分').selectOption('11');
  await page.getByRole('button',{name:'結晶回収用の選択膜',exact:true}).click();
  await page.getByLabel('通過成分').selectOption('1');await page.getByLabel('流量',{exact:true}).fill('3.5');await page.getByLabel('流量',{exact:true}).blur();
  s=await saveState(page);const membrane=s.nodes.find((n:any)=>n.kind==='membrane');expect(membrane.filterMaterial).toBe(1);expect(membrane.flowRate).toBe(3.5);
  await page.getByLabel('観察モード').selectOption('flow');await page.getByRole('button',{name:'再生 Space',exact:true}).click();
  await expect(page.locator('.status-right')).toContainText(/0\.[1-9] s|[1-9]\d*\.\d s/);await page.getByRole('button',{name:'停止 Space',exact:true}).click();
  s=await saveState(page);const product=s.cells.reduce((sum:number,m:number,i:number)=>sum+(m===16?s.chemistry.amount[i]:0)+(s.chemistry.secondary[i]===16?s.chemistry.secondaryAmount[i]:0),0);expect(product).toBeGreaterThan(0);
  await page.screenshot({path:'test-results/chemistry-reaction.png'});
  await page.reload();await page.getByRole('button',{name:'停止 Space',exact:true}).click();await page.getByRole('button',{name:'結晶回収用の選択膜',exact:true}).click();await expect(page.getByLabel('通過成分')).toHaveValue('1');
  for(const example of ['dissolve','distill']){await page.getByLabel('実験見本').selectOption(example);await page.getByRole('button',{name:'見本',exact:true}).click();s=await saveState(page);expect(s.chemistry.amount).toHaveLength(89600);expect(s.nodes.length).toBeGreaterThan(0);}
  await page.screenshot({path:'test-results/chemistry-distill.png'});expect(errors).toEqual([]);
});

test('CPU Worker keeps the UI responsive with dense cells and 240 devices, and cannot overwrite edits',async({page})=>{
  test.setTimeout(60000);
  await page.addInitScript(()=>{
    const state={created:0,received:0,pending:0,maxPending:0};(window as any).__cpuWorker=state;
    const Native=window.Worker;
    window.Worker=class extends Native{
      constructor(url:string|URL,options?:WorkerOptions){super(url,options);state.created++;this.addEventListener('message',()=>{state.received++;state.pending--;});}
      postMessage(message:any,transfer:any=[]){state.pending++;state.maxPending=Math.max(state.maxPending,state.pending);super.postMessage(message,transfer);}
    };
  });
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.keyboard.press('Space');const saved=await saveState(page);
  await page.evaluate(s=>{
    const motor=s.nodes.find((n:any)=>n.kind==='motor'),body=s.nodes.find((n:any)=>n.kind==='rect'),pump=s.nodes.find((n:any)=>n.kind==='membrane');s.nodes=[];s.terrain.fill(0);s.cells.fill(0);s.temperature.fill(20);s.chemistry.amount.fill(1);for(const key of ['secondary','secondaryAmount','tertiary','tertiaryAmount'])s.chemistry[key].fill(0);s.trapped=[];
    for(let y=150;y<220;y++)for(let x=5;x<395;x++)s.cells[y*400+x]=1;
    let id=1;for(let n=0;n<80;n++){const x=20+n%16*23,y=20+Math.floor(n/16)*25,m=id++;s.nodes.push({...motor,id:m,name:`負荷モーター${n}`,parent:null,lx:x,ly:y,la:0,speed:.3,anchorX:0,anchorY:0,joint:'fixed',jointOffset:0});s.nodes.push({...body,id:id++,name:`負荷パドル${n}`,parent:m,lx:5,ly:0,la:0,width:10,height:3,anchorX:0,anchorY:0,joint:'fixed',jointOffset:0});s.nodes.push({...pump,id:id++,name:`負荷ポンプ${n}`,kind:'pump',parent:null,lx:x,ly:y+10,la:0,portDistance:6,filterMaterial:0,flowRate:1});}s.nextId=id;localStorage.setItem('cell-fluid-lab-v1',JSON.stringify(s));
  },saved);
  await page.reload();await expect.poll(()=>page.evaluate(()=>(window as any).__cpuWorker.received)).toBeGreaterThan(2);
  const frames=await page.evaluate(()=>new Promise<number>(resolve=>{let count=0;const start=performance.now();function frame(){count++;if(performance.now()-start>=500)resolve(count);else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));expect(frames).toBeGreaterThan(4);
  expect(await page.evaluate(()=>(window as any).__cpuWorker.maxPending)).toBe(1);
  await page.keyboard.press('Space');await expect(page.getByText('編集モード · 停止中')).toBeVisible();await page.getByRole('button',{name:'盤面を全消去'}).click();expect((await saveState(page)).nodes).toHaveLength(0);await page.keyboard.press('Space');await expect.poll(()=>page.evaluate(()=>(window as any).__cpuWorker.received)).toBeGreaterThan(4);await page.keyboard.press('Space');expect((await saveState(page)).nodes).toHaveLength(0);expect(errors).toEqual([]);
});

test('three closed cycles expose processor controls, finite air and persist their counters',async({page})=>{
  test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.getByRole('button',{name:'停止 Space',exact:true}).click();
  await page.getByLabel('実験見本').selectOption('cycles');await page.getByRole('button',{name:'見本',exact:true}).click();
  await expect(page.getByText('材料を再利用する三つの循環',{exact:true})).toBeVisible();await page.getByLabel('物質分類').selectOption('reaction');await expect(page.getByRole('button',{name:'晶塩',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'炭化水素油',exact:true})).toHaveCount(0);await page.getByLabel('物質分類').selectOption('all');await expect(page.getByRole('button',{name:'空気',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'水素循環 · 電解槽',exact:true}).click();await expect(page.getByLabel('処理方式')).toHaveValue('electrolysis');await page.locator('.properties-panel summary').filter({hasText:'ポートの個別配置'}).click();await expect(page.getByLabel('主入口 X',{exact:true})).toBeVisible();
  let s=await saveState(page);const mass=(s:any)=>s.cells.reduce((sum:number,m:number,i:number)=>sum+(m?s.chemistry.amount[i]+s.chemistry.secondaryAmount[i]+s.chemistry.tertiaryAmount[i]:0),0);const initial=mass(s);
  await page.getByRole('button',{name:'再生 Space',exact:true}).click();await expect.poll(async()=>{const state=await saveState(page);return Math.min(...state.nodes.filter((n:any)=>n.kind==='processor').map((n:any)=>n.transported));},{timeout:15000}).toBeGreaterThan(.1);await page.getByRole('button',{name:'停止 Space',exact:true}).click();s=await saveState(page);expect(mass(s)).toBeCloseTo(initial,4);expect(s.nodes.some((n:any)=>n.energyUsed>0)).toBe(true);expect(s.nodes.some((n:any)=>n.heatRemoved>0)).toBe(true);await page.screenshot({path:'test-results/cycles.png'});
  await page.reload();await page.getByRole('button',{name:'停止 Space',exact:true}).click();await page.getByRole('button',{name:'水素循環 · 電解槽',exact:true}).click();await expect(page.getByLabel('処理方式')).toHaveValue('electrolysis');await page.getByLabel('電力・冷却能力',{exact:true}).fill('0');await page.getByLabel('電力・冷却能力',{exact:true}).blur();s=await saveState(page);expect(s.nodes.find((n:any)=>n.process==='electrolysis').power).toBe(0);expect(errors).toEqual([]);
});
