// Dependency-free Chromium walkthrough over CDP. Opens the real file:// entry point.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'tycoon-cdp-'));
const screenshotDir = process.env.TYCOON_QA_SCREENSHOTS || null;
// Chromium's headless outer window reserves 151 px vertically; compensate so inner viewport is exactly 1280x720.
const entryUrl = process.env.TYCOON_ENTRY_URL || new URL('../../index.html?debug', import.meta.url).href;
const child = spawn(chrome, ['--headless=new','--no-sandbox','--disable-gpu','--no-first-run',`--user-data-dir=${profile}`,'--remote-debugging-port=0','--window-size=1296,871',entryUrl], { stdio: ['ignore','ignore','pipe'] });
let stderr = '';
child.stderr.setEncoding('utf8'); child.stderr.on('data', (s) => { stderr += s; });
let ws, nextId = 0; const pending = new Map(); const browserErrors = [];
try {
  let port;
  for (let i=0;i<100;i++) { try { port = Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]); break; } catch { await delay(100); } }
  if (!port) throw new Error(`Chrome DevTools did not start: ${stderr}`);
  let targets;
  for (let i=0;i<100;i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break; } catch { await delay(100); } }
  const page = targets.find((t) => t.type === 'page'); if (!page) throw new Error('Chromium page target missing');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject) => { ws.onopen=resolve; ws.onerror=reject; });
  ws.onmessage = ({data}) => { const msg=JSON.parse(data); if (msg.method==='Runtime.exceptionThrown') browserErrors.push(msg.params.exceptionDetails.text); if (msg.method==='Runtime.consoleAPICalled' && msg.params.type==='error') browserErrors.push(msg.params.args.map((a)=>a.value||a.description||'').join(' ')); const p=pending.get(msg.id); if(p){pending.delete(msg.id); msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);} };
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  await send('Runtime.enable'); await send('Page.enable');
  const evaluate=async (expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
  const capture=async(name)=>{if(!screenshotDir)return;await mkdir(screenshotDir,{recursive:true});const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(screenshotDir,`${name}.png`),Buffer.from(shot.data,'base64'));};
  for(let i=0;i<100;i++){if(await evaluate("!!(window.TYCOON && TYCOON.app && TYCOON.app.game)").catch(()=>false))break;await delay(100);}
  if(!(await evaluate("!!(window.TYCOON && TYCOON.app && TYCOON.app.game)")))throw new Error('TYCOON app did not load from file://');
  await capture('title');
  const click = async (name,wait=300) => { const t=await evaluate(`TYCOON.app.debugTargets[${JSON.stringify(name)}]`);if(!t)throw new Error(`Missing visible UI target: ${name}`);const rect=await evaluate("(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return {x:r.x,y:r.y,sx:r.width/c.width,sy:r.height/c.height}})()");const x=rect.x+(t.x+t.w/2)*rect.sx,y=rect.y+(t.y+t.h/2)*rect.sy;await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});await delay(wait); };
  const closeDialogs=async()=>{for(let i=0;i<40;i++){if(!(await evaluate("(()=>{const s=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI);return !!(s&&s.dialog&&s.dialog.isOpen())})()")))return;await click('dialogNext',80);}throw new Error('Dialog did not close after mouse input');};
  await click('titleStart');
  if(!(await evaluate("TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.OFFICE)&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI)")))throw new Error('Title start button mouse input did not open the game UI');
  await closeDialogs();
  await evaluate("TYCOON.app.flow.newGame()");
  const run=(skip,dMode=false)=>evaluate(`(async()=>{const f=TYCOON.app.flow,d=(t,p)=>f.dispatch(t,p); if(${dMode}) f.balance.gradeTable.splice(0,f.balance.gradeTable.length,{min:0,grade:'D'}); for(const c of ['CHECK_RESIDENTS','CHECK_USER_SPEC','CHECK_INVENTORY_COUNT']){const r=d(c);if(!r.ok)throw Error(c+':'+r.error)} if(${skip}){let r=d('CONFIRM_QUANTITIES');if(!r.ok)throw Error(r.error);r=d('CONFIRM_QUANTITIES');if(!r.ok)throw Error(r.error)}else{d('CHECK_MATTRESS_CONDITION');if(!d('CONFIRM_QUANTITIES').ok)throw Error('quantity')} for(const c of ['ADVANCE_MONTH','SIGN_CONTRACT','CLOSE_REPORT','ADVANCE_MONTH','EVENT_NEGOTIATE_SUPPLIER','EVENT_CONFIRM_REQUESTER','CONFIRM_INSPECTION']){const r=d(c);if(!r.ok)throw Error(c+':'+r.error)} const v=f.view(); if(${skip} && !(v.project.supplement.mattress===2&&v.project.supplement.amount===18&&v.project.delivered.mattress===14&&v.project.contract.quantities.mattress===12&&v.project.inspection.passed))throw Error('TEMP outcome mismatch'); if(${dMode} && !(v.evaluation.grade==='D'&&!v.evaluation.passed&&v.project.status==='EVALUATED'&&f.state.getFacilityState('hall').stage==='BEFORE'&&f.state.getStaff().headcount===1&&f.state.getCandidates()===null))throw Error('D outcome mismatch'); if(!${skip}&&!${dMode}&&!(v.evaluation.grade==='S'&&v.evaluation.passed&&f.state.getProjectStatus()==='COMPLETED'))throw Error('normal outcome mismatch'); if(${dMode}){const r=d('CLOSE_REPORT');if(!r.ok||f.view().phase!=='END')throw Error('D ending mismatch')} return {grade:v.evaluation.grade,passed:v.evaluation.passed,contractQty:v.project.contract.quantities.mattress,delivered:v.project.delivered.mattress,supplement:v.project.supplement,inspection:v.project.inspection,projectStatus:f.state.getProjectStatus(),facility:f.state.getFacilityState('hall').stage,phase:f.view().phase};})()`);
  const normal=await run(false,false); await closeDialogs(); await capture('normal-s'); await evaluate('TYCOON.app.flow.newGame()'); await closeDialogs(); const supplement=await run(true,false); await closeDialogs(); await capture('supplement-c'); await evaluate('TYCOON.app.flow.newGame()'); await closeDialogs(); const dGrade=await run(false,true); await closeDialogs(); await capture('grade-d');
  await evaluate("(()=>{const f=TYCOON.app.flow; f.state.load=()=>{throw new Error('forced restore failure')}; f.procurement.checkResidents=()=>{f.state.spendBudget(1);return TYCOON.core.fail(TYCOON.core.REASON.INVALID_STATE)};return f.dispatch('CHECK_RESIDENTS')})()");
  if(!(await evaluate("TYCOON.app.flow.fatal!==null && TYCOON.app.store.dispatch('CHECK_RESIDENTS').code==='ROLLBACK_FAILED' && !!TYCOON.app.debugTargets.fatalNewGame")))throw new Error('Fatal UI or command gate missing');
  await capture('fatal');
  await click('fatalNewGame');
  await delay(500);
  const reset=await evaluate("({fatal:TYCOON.app.flow.fatal,scene:TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.TITLE)})");
  if(reset.fatal!==null||!reset.scene)throw new Error(`Fatal new-game button did not reset to title: ${JSON.stringify(reset)}`);
  const unexpected=browserErrors.filter((e)=>!e.includes('TutorialFlow command failed before rollback:')&&!e.includes('TutorialFlow rollback failed:'));
  if(unexpected.length)throw new Error(`Browser console/page errors: ${unexpected.join(' | ')}`);
  const viewport=await evaluate("({width:innerWidth,height:innerHeight,canvas:(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return {logical:[c.width,c.height],css:[r.width,r.height]}})()})");
  if(viewport.width!==1280||viewport.height!==720||viewport.canvas.css[0]!==1280||viewport.canvas.css[1]!==720)throw new Error(`Expected a 1280x720 viewport and canvas, got ${JSON.stringify(viewport)}`);
  console.log(JSON.stringify({entry:'file://',viewport,normal,supplement,dGrade,fatal:'ROLLBACK_FAILED shown; command blocked; fatalNewGame activated by CDP mouse input and returned to title',screenshots:screenshotDir||null,unexpectedBrowserErrors:unexpected},null,2));
} finally { if(ws)ws.close(); child.kill(); await delay(250); await rm(profile,{recursive:true,force:true}).catch(()=>{}); }
