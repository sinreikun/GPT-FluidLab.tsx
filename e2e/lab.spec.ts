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
test('mechanism construction, connecting pin, multi-select without drag and deletion',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'停止 Space',exact:true}).click();await expect(page.getByText('編集モード · 停止中')).toBeVisible();await page.getByRole('button',{name:'盤面を全消去'}).click();
  await page.keyboard.press('9');await clickCell(page,200,100);
  await page.keyboard.press('7');await dragCell(page,195,96,221,105);
  await page.keyboard.press('0');await clickCell(page,200,100);
  await page.getByRole('button',{name:'この位置でつなぐ',exact:true}).click();
  let s=await saveState(page);const pin=s.nodes.find((n:any)=>n.kind==='pin'),body=s.nodes.find((n:any)=>n.kind==='rect'),motor=s.nodes.find((n:any)=>n.kind==='motor');expect(pin.parent).toBe(motor.id);expect(body.parent).toBe(pin.id);
  await page.getByRole('button',{name:'可動壁 · 矩形',exact:true}).click({modifiers:['Shift']});await expect(page.getByText('2 個のオブジェクトを選択')).toBeVisible();
  const snapshot=s.nodes.map((n:any)=>[n.lx,n.ly]);s=await saveState(page);expect(s.nodes.map((n:any)=>[n.lx,n.ly])).toEqual(snapshot);
  await page.keyboard.press('Delete');s=await saveState(page);expect(s.nodes).toHaveLength(1);expect(s.nodes[0].kind).toBe('motor');
  await page.keyboard.press('Control+z');s=await saveState(page);expect(s.nodes).toHaveLength(3);
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
  await expect(page.getByText('A + D → 沈殿E → 選択膜で回収',{exact:true})).toBeVisible();
  let s=await saveState(page);expect(s.version).toBe(5);expect(s.materialIds).toContain('precipitate-e');expect(s.chemistry.secondaryAmount.some((n:number)=>n>0)).toBe(true);
  await page.getByLabel('観察モード').selectOption('component');await page.getByLabel('観察成分').selectOption('11');
  await page.getByRole('button',{name:'E回収用の選択膜',exact:true}).click();
  await page.getByLabel('通過成分').selectOption('1');await page.getByLabel('流量',{exact:true}).fill('3.5');await page.getByLabel('流量',{exact:true}).blur();
  s=await saveState(page);const membrane=s.nodes.find((n:any)=>n.kind==='membrane');expect(membrane.filterMaterial).toBe(1);expect(membrane.flowRate).toBe(3.5);
  await page.getByLabel('観察モード').selectOption('flow');await page.getByRole('button',{name:'再生 Space',exact:true}).click();
  await expect(page.locator('.status-right')).toContainText(/0\.[1-9] s|[1-9]\d*\.\d s/);await page.getByRole('button',{name:'停止 Space',exact:true}).click();
  s=await saveState(page);const product=s.cells.reduce((sum:number,m:number,i:number)=>sum+(m===16?s.chemistry.amount[i]:0)+(s.chemistry.secondary[i]===16?s.chemistry.secondaryAmount[i]:0),0);expect(product).toBeGreaterThan(0);
  await page.screenshot({path:'test-results/chemistry-reaction.png'});
  await page.reload();await page.getByRole('button',{name:'停止 Space',exact:true}).click();await page.getByRole('button',{name:'E回収用の選択膜',exact:true}).click();await expect(page.getByLabel('通過成分')).toHaveValue('1');
  for(const example of ['dissolve','distill']){await page.getByLabel('実験見本').selectOption(example);await page.getByRole('button',{name:'見本',exact:true}).click();s=await saveState(page);expect(s.chemistry.amount).toHaveLength(89600);expect(s.nodes.length).toBeGreaterThan(0);}
  await page.screenshot({path:'test-results/chemistry-distill.png'});expect(errors).toEqual([]);
});
