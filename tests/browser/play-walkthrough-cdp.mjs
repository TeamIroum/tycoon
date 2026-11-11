// Real input E2E: game commands are issued only with CDP mouse coordinates.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const root = process.cwd();
const shotRoot = process.env.TYCOON_QA_SCREENSHOTS || join(root, 'tests', 'browser', 'play-qa-shots');
const url = process.env.TYCOON_ENTRY_URL || new URL('../../index.html?debug', import.meta.url).href;
const outcomes = [];

async function withBrowser(scenario) {
  const profile = await mkdtemp(join(tmpdir(), `tycoon-play-${scenario}-`));
  const child = spawn(chrome, ['--headless=new','--no-sandbox','--disable-gpu','--no-first-run',`--user-data-dir=${profile}`,'--remote-debugging-port=0','--window-size=1296,871',url], { stdio: ['ignore','ignore','pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8'); child.stderr.on('data',(s)=>{stderr+=s;});
  let ws, id=0; const pending=new Map(), consoleErrors=[];
  try {
    let port;
    for(let i=0;i<120;i++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]);break}catch{await delay(100)}}
    if(!port)throw new Error(`Chrome DevTools did not start: ${stderr}`);
    let targets;
    for(let i=0;i<120;i++){try{targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();break}catch{await delay(100)}}
    const page=targets.find(t=>t.type==='page');if(!page)throw new Error('Chromium page target missing');
    ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
    ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')consoleErrors.push(m.params.exceptionDetails.text);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')consoleErrors.push(m.params.args.map(a=>a.value||a.description||'').join(' '));const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}};
    const send=(method,params={})=>new Promise((res,rej)=>{const n=++id;pending.set(n,{resolve:res,reject:rej});ws.send(JSON.stringify({id:n,method,params}))});
    await send('Runtime.enable');await send('Page.enable');
    const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value};
    const waitFor=async(expression,label=expression,timeout=10000)=>{const start=Date.now();while(Date.now()-start<timeout){const value=await evaluate(expression).catch(()=>false);if(value)return value;await delay(100)}throw new Error(`Timed out waiting for ${label}`)};
    await waitFor('!!(window.TYCOON&&TYCOON.app&&TYCOON.app.game)','TYCOON file page');
    const viewport=await evaluate("({width:innerWidth,height:innerHeight,canvas:(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return [c.width,c.height,r.width,r.height]})()})");
    assert.deepEqual(viewport,{width:1280,height:720,canvas:[1280,720,1280,720]});
    const target=(name)=>evaluate(`(()=>{const k=${JSON.stringify(name)},s=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI);return s&&s.sys.isActive()&&s.targets&&s.targets[k]||TYCOON.app.debugTargets[k]})()`);
    const click=async(name)=>{
      const rect=await evaluate("(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return{x:r.x,y:r.y,sx:r.width/c.width,sy:r.height/c.height}})()");
      await waitFor(`(()=>{const k=${JSON.stringify(name)},s=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI);return !!(s&&s.sys.isActive()&&s.targets&&s.targets[k]||TYCOON.app.debugTargets[k])})()`,`visible target ${name}`);
      const t=await target(name);
      const x=rect.x+(t.x+t.w/2)*rect.sx,y=rect.y+(t.y+t.h/2)*rect.sy;
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
      await delay(180);
      return {x,y,target:t};
    };
    const clickAt=async(x,y)=>{
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
      await delay(180);
    };
    const dialogState=()=>evaluate("(()=>{for(const k of [TYCOON.config.SCENE_KEYS.UI,TYCOON.config.SCENE_KEYS.ENDING]){const s=TYCOON.app.game.scene.getScene(k);if(s&&s.sys.isActive()&&s.dialog&&s.dialog.isOpen())return {open:true,id:s.dialog.current&&s.dialog.current.id,line:s.dialog.lineIndex}}return {open:false}})()");
    const closeDialogs=async(expected=[])=>{
      const seen=[];
      for(let i=0;i<35;i++){
        const d=await dialogState();if(!d.open)break;
        if(!seen.includes(d.id))seen.push(d.id);
        await click('dialogNext');
      }
      assert.equal((await dialogState()).open,false,`dialog left open: ${JSON.stringify(await dialogState())}`);
      for(const name of expected)assert.ok(seen.includes(name),`expected dialog ${name}; saw ${seen.join(',')}`);
      return seen;
    };
    const capture=async(stage)=>{await mkdir(shotRoot,{recursive:true});const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const p=join(shotRoot,`${scenario}-${stage}.png`);await writeFile(p,Buffer.from(r.data,'base64'));return p};
    const state=()=>evaluate("TYCOON.app.flow.view()");
    const startGame=async({closeIntro=true}={})=>{
      await capture('title');
      await click('titleStart');
      await waitFor("TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.OFFICE)&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI)",'office and UI scenes');
      if(closeIntro)await closeDialogs(['intro']);
    };
    const dialogInputBlocking=async()=>{
      await startGame({closeIntro:false});
      assert.deepEqual(await dialogState(),{open:true,id:'intro',line:0});
      await evaluate("(()=>{window.__qaDialogEvents=[];TYCOON.app.flow.subscribe((_,events)=>window.__qaDialogEvents.push(...events))})()");
      const baseline=await evaluate("({gs:TYCOON.app.flow.state.toJSON(),meta:structuredClone(TYCOON.app.flow.meta),phase:TYCOON.app.flow.view().phase,view:TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).view})");
      await capture('dialog-blocking-open');
      // Request card and bottom navigation are buttons behind the modal.
      await click('requestCard');
      assert.deepEqual(await dialogState(),{open:true,id:'intro',line:0},'request card click closed or advanced the dialog');
      await click('menuRegion');
      assert.deepEqual(await dialogState(),{open:true,id:'intro',line:0},'bottom navigation click closed or advanced the dialog');
      // The map panel itself is a separate interactive zone behind the modal.
      await clickAt(1128,145);
      assert.deepEqual(await dialogState(),{open:true,id:'intro',line:0},'map click closed or advanced the dialog');
      const blocked=await evaluate("({gs:TYCOON.app.flow.state.toJSON(),meta:structuredClone(TYCOON.app.flow.meta),phase:TYCOON.app.flow.view().phase,view:TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).view,events:window.__qaDialogEvents.slice()})");
      assert.deepEqual({gs:blocked.gs,meta:blocked.meta,phase:blocked.phase,view:blocked.view},{gs:baseline.gs,meta:baseline.meta,phase:baseline.phase,view:baseline.view});
      assert.deepEqual(blocked.events,[],'background clicks emitted flow events');
      await capture('dialog-blocking-after-clicks');
      // Close through the normal dialog button, advancing all intro lines.
      await click('dialogNext');await click('dialogNext');await click('dialogNext');
      assert.deepEqual(await dialogState(),{open:false},'dialog close button did not close the intro');
      const afterClose=await evaluate("({gs:TYCOON.app.flow.state.toJSON(),meta:structuredClone(TYCOON.app.flow.meta),events:window.__qaDialogEvents.slice()})");
      assert.deepEqual(afterClose.gs,baseline.gs);assert.deepEqual(afterClose.meta,baseline.meta);assert.deepEqual(afterClose.events,[]);
      // The same map zone and request card must work once the blocker is gone.
      await clickAt(1128,145);
      await waitFor("TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).view===TYCOON.config.SCENE_KEYS.VILLAGE",'map works after dialog close');
      await click('menuOffice');
      await waitFor("TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).view===TYCOON.config.SCENE_KEYS.OFFICE",'office navigation works after dialog close');
      await click('requestCard');
      await waitFor("TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).popup==='step'",'request card works after dialog close');
      await capture('dialog-blocking-closed');
      return {backgroundClicks:['requestCard button','menuRegion button','map interaction zone'],blocked:true,dialogClosedBy:'dialogNext button',postCloseClicks:['map zone switches to village','menuOffice returns to office','requestCard opens step panel'],stateMetaEventsUnchanged:true};
    };
    const openRequest=async()=>{
      await click('requestCard');await closeDialogs(['request']);
      assert.ok((await state()).phase==='PLAN');
    };
    const prepareInspection=async(skip=false)=>{
      await click('chkResidents');await click('chkUserSpec');await click('chkInventory');
      if(!skip)await click('chkCondition');
      await click('confirmQty');
      if(skip){
        await closeDialogs(['hint_wet']);
        assert.equal((await state()).project.quantities,null);
        await click('confirmQty');
      }
      await waitFor('TYCOON.app.flow.view().project.quantities!==null','confirmed quantities');
      const v=await state();
      assert.equal(v.project.quantities.mattress,skip?12:14);
      await capture('request-confirmed');
      await click('popupClose');
      await click('advance');
      await closeDialogs(['proposal']);
      await waitFor("TYCOON.app.flow.view().pending==='PROPOSAL_REVIEW'",'proposal review');
      await capture('proposals');
      assert.equal((await target('sign'))!==null,true);
      await click('sign');
      await closeDialogs(['contract']);
      await waitFor("TYCOON.app.flow.view().phase==='REPORT'",'first month report');
      await capture('month1-report');
      const contract=(await state()).project.contract;
      assert.ok(contract&&contract.supplierName);
      await click('closeReport');
      await closeDialogs(['month2']);
      await waitFor("TYCOON.app.flow.view().month===2&&TYCOON.app.flow.view().phase==='PLAN'",'second month plan');
      await click('popupClose');
      await click('advance');
      await closeDialogs(['partial']);
      await waitFor("TYCOON.app.flow.view().pending==='PARTIAL_DELIVERY'",'partial delivery screen');
      await capture('partial-delivery');
      const before=await state();
      assert.equal(before.project.event.supplierNegotiated,false);
      await click('negotiate');
      await waitFor('TYCOON.app.flow.view().project.event.supplierNegotiated','supplier negotiation');
      await click('confirmReq');
      await closeDialogs(['inspection']);
      await waitFor("TYCOON.app.flow.view().pending==='INSPECTION'&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.VILLAGE)",'inspection delivery in village');
      await waitFor('TYCOON.app.debugTargets.marker','inspection marker',12000);
      await capture('village-before-use');
      await click('marker');
      await waitFor('!!TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).targets.inspect','inspection dialog button');
      await capture('inspection');
      return {contract: (await state()).project.contract};
    };
    const completePassingPath=async({skip=false,dGrade=false}={})=>{
      if(dGrade)await evaluate("TYCOON.app.flow.balance.gradeTable.splice(0,TYCOON.app.flow.balance.gradeTable.length,{min:0,grade:'D'})");
      await startGame();await openRequest();await prepareInspection(skip);
      const before=await evaluate("({gs:TYCOON.app.flow.state.toJSON(),meta:structuredClone(TYCOON.app.flow.meta)})");
      const flowEvents=await evaluate("(()=>{window.__qaFlowEvents=[];TYCOON.app.flow.subscribe((_,events)=>window.__qaFlowEvents.push(...events));return true})()");
      assert.ok(flowEvents);
      await click('inspect');
      await waitFor("['COMPLETED','EVALUATED'].includes(TYCOON.app.flow.state.getProjectStatus())",'evaluation status');
      await closeDialogs(dGrade?['evaluation']:['use_started','evaluation']);
      const result=await evaluate("({v:TYCOON.app.flow.view(),delivery:TYCOON.app.flow.state.getDelivery(),contract:TYCOON.app.flow.state.getContract(),budget:TYCOON.app.flow.state.getBudget(),events:window.__qaFlowEvents.slice()})");
      assert.equal(result.v.evaluation.grade,dGrade?'D':skip?'C':'S');
      assert.equal(result.v.evaluation.passed,!dGrade);
      assert.equal(result.delivery.inspection.passed,true);
      if(skip){
        assert.equal(result.contract.items.find(i=>i.itemId==='mattress').quantity,12);
        assert.equal(result.v.project.quantities.mattress,12);
        assert.equal(result.delivery.supplement.mattress,2);
        assert.equal(result.delivery.supplement.amount,18);
        assert.equal(result.delivery.supplement.temp,true);
        assert.equal(result.delivery.delivered.find(i=>i.itemId==='mattress').quantity,14);
        assert.equal(result.budget,118);
        assert.equal(result.v.budget.spent,182);
      } else assert.equal(result.delivery.supplement,null);
      if(dGrade){
        assert.equal(result.v.project.status,'EVALUATED');
        assert.equal(result.v.region.hallBedded,false);
        assert.equal(result.v.staff.headcount,1);
        assert.equal(result.v.meta.candidates,null);
        assert.ok(!result.events.includes('USE_STARTED'));
      }else{
        assert.equal(result.v.project.status,'COMPLETED');
        assert.equal(result.v.region.hallBedded,true);
        assert.ok(result.events.includes('USE_STARTED'));
      }
      await capture('village-after-use');
      if(dGrade){
        await waitFor('!!TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).targets.closeReport','D report close button');
        await capture('d-report');
        await click('closeReport');
        await waitFor("TYCOON.app.flow.view().phase==='END'",'D tutorial end');
        await capture('d-end');
        assert.equal((await state()).meta.candidates,null);
        await click('ending');
        await waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.TITLE)','D end return to title');
      }else{
        await waitFor('!!TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).targets.closeReport','evaluation report button');
        await capture('evaluation-report');
        await click('closeReport');
        await closeDialogs(['recruit']);
        await waitFor("TYCOON.app.flow.view().phase==='RECRUIT'",'recruit selection');
        const v=await state();assert.equal(v.meta.candidates.length,3);
        await capture('recruit');
        await click('cand1');
        await waitFor("TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).selected!==null",'candidate selection');
        await click('hire');
        await waitFor("TYCOON.app.flow.view().staff.headcount===2&&TYCOON.app.flow.view().phase==='END'",'colleague hired');
        await waitFor('!!TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).targets.ending','end button',6000);
        await capture('colleague-hired');
        await click('ending');
        await waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.ENDING)','ending scene');
        await capture('ending-residents');
        await click('endingNext');await waitFor("TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.ENDING).step===1",'colleague ending panel');
        await capture('ending-colleague');
        await click('endingNext');await waitFor("TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.ENDING).step===2",'next project ending panel');
        await closeDialogs(['ending']);await capture('ending-next-project');
        await click('endingNext');
        await waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.TITLE)','return to title');
      }
      return result;
    };
    const autosaveContinuation=async()=>{
      const storageProbe=await evaluate("(()=>{const k='__tycoon_file_origin_probe__';try{localStorage.setItem(k,'ok');const v=localStorage.getItem(k);localStorage.removeItem(k);return {ok:v==='ok'}}catch(e){return {ok:false,error:String(e)}}})()");
      assert.equal(storageProbe.ok,true,`file:// localStorage unavailable: ${storageProbe.error||''}`);
      await startGame();
      const assertSaved=async(label)=>{
        const x=await evaluate("(()=>({record:JSON.parse(localStorage.getItem(TYCOON.core.AUTOSAVE_KEY)),game:TYCOON.app.flow.state.toJSON(),meta:structuredClone(TYCOON.app.flow.meta),status:TYCOON.app.autoSave.lastResult}))()");
        assert.ok(x.record,`${label}: no autosave record`);
        assert.equal(x.status.ok,true,`${label}: autosave status ${JSON.stringify(x.status)}`);
        assert.equal(x.record.version,1);
        assert.deepEqual(x.record.gameState,x.game,`${label}: GameState differs from stored record`);
        assert.deepEqual(x.record.meta,x.meta,`${label}: meta differs from stored record`);
        return x.record;
      };
      await assertSaved('new game');
      await openRequest();
      for(const [button,check] of [
        ['chkResidents','residents'],['chkUserSpec','userSpec'],['chkInventory','inventoryCount'],['chkCondition','mattressCondition'],['confirmQty','quantity']
      ]){
        await click(button);
        await assertSaved(`request confirmation ${check}`);
      }
      await capture('autosave-after-request');
      await click('popupClose');await click('advance');await closeDialogs(['proposal']);
      await click('sign');await closeDialogs(['contract']);
      let contractSaved=await assertSaved('after contract');
      assert.ok(contractSaved.gameState.gameState.contract);
      await capture('autosave-after-contract');

      const reloadAndCompare=async(label,expected)=>{
        await send('Page.reload',{ignoreCache:true});
        await waitFor("!!(window.TYCOON&&TYCOON.app&&TYCOON.app.game&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI))",`${label} resumed UI`,20000);
        await waitFor('TYCOON.app.resumeOnLoad===false',`${label} restore finished`,10000);
        const actual=await evaluate("({gameState:TYCOON.app.flow.state.toJSON(),meta:structuredClone(TYCOON.app.flow.meta),view:TYCOON.app.flow.view(),saveStatus:TYCOON.app.autoSave.lastResult,sceneView:TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).view})");
        assert.deepEqual(actual.gameState,expected.gameState,`${label}: restored GameState mismatch`);
        assert.deepEqual(actual.meta,expected.meta,`${label}: restored meta mismatch`);
        assert.equal(actual.saveStatus.ok,true,`${label}: load status was not successful`);
        return actual;
      };
      const afterContract=await reloadAndCompare('after contract',contractSaved);
      await capture('autosave-resumed-contract');
      await click('closeReport');await closeDialogs(['month2']);
      await waitFor("TYCOON.app.flow.view().month===2&&TYCOON.app.flow.view().phase==='PLAN'",'month 2 plan after resume');
      await click('popupClose');await click('advance');await closeDialogs(['partial']);
      await click('negotiate');await assertSaved('supplier negotiation');
      await click('confirmReq');await closeDialogs(['inspection']);
      await waitFor("TYCOON.app.flow.view().pending==='INSPECTION'",'inspection ready after resume path');
      await waitFor('!!TYCOON.app.debugTargets.marker','inspection marker after resume path');
      await click('marker');await click('inspect');
      await waitFor("['COMPLETED','EVALUATED'].includes(TYCOON.app.flow.state.getProjectStatus())",'evaluation state saved');
      await closeDialogs(['use_started','evaluation']);
      const evaluationSaved=await assertSaved('after inspection and evaluation');
      assert.ok(evaluationSaved.gameState.gameState.evaluation);
      await capture('autosave-after-evaluation');
      await reloadAndCompare('after evaluation',evaluationSaved);
      await capture('autosave-resumed-evaluation');
      await click('closeReport');await closeDialogs(['recruit']);
      await waitFor("TYCOON.app.flow.view().phase==='RECRUIT'",'recruit phase');
      const recruitSaved=await assertSaved('after candidate generation');
      assert.equal(recruitSaved.gameState.gameState.candidates.length,3);
      await click('cand1');await click('hire');
      await waitFor("TYCOON.app.flow.view().staff.headcount===2&&TYCOON.app.flow.view().phase==='END'",'hire completion');
      const hiredSaved=await assertSaved('after hire');
      assert.equal(hiredSaved.gameState.gameState.staff.hired.length,1);
      await capture('autosave-after-hire');
      await reloadAndCompare('after hire',hiredSaved);
      await waitFor('!!TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).targets.ending','resume ending UI');
      await capture('autosave-resumed-hire');

      // Finish the visual ending, start a fresh game, and confirm it replaced the old slot.
      await click('ending');await waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.ENDING)','ending scene after resume');
      await click('endingNext');await click('endingNext');await closeDialogs(['ending']);await click('endingNext');
      await waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.TITLE)','title after ending');
      await click('titleStart');
      await waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI)','new game UI after ending');
      await closeDialogs(['intro']);
      const fresh=await evaluate("({v:TYCOON.app.flow.view(),r:JSON.parse(localStorage.getItem(TYCOON.core.AUTOSAVE_KEY))})");
      assert.equal(fresh.v.staff.headcount,1);assert.equal(fresh.v.project.contract,null);assert.equal(fresh.v.phase,'PLAN');
      assert.deepEqual(fresh.r.gameState,await evaluate('TYCOON.app.flow.state.toJSON()'));
      assert.equal(fresh.r.meta.seenDialogs.includes('intro'),true);
      return {fileLocalStorage:storageProbe.ok,checkpoints:['new game','request confirmation','contract','delivery/inspection/evaluation','candidate generation','hire'],reloads:['after contract','after evaluation','after hire'],candidateCount:3,hiredCount:1,newGameReplacedPriorSave:true,saveAfterSuccessfulCommands:true};
    };
    const autosaveCorrupt=async()=>{
      await startGame();
      await evaluate("localStorage.setItem(TYCOON.core.AUTOSAVE_KEY,'{broken')");
      await send('Page.reload',{ignoreCache:true});
      await waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.TITLE)','fresh title after corrupt save',20000);
      const fresh=await evaluate("({project:TYCOON.app.flow.state.getCurrentProject(),meta:structuredClone(TYCOON.app.flow.meta),raw:localStorage.getItem(TYCOON.core.AUTOSAVE_KEY),resume:TYCOON.app.resumeOnLoad})");
      assert.equal(fresh.project,null);assert.deepEqual(fresh.meta,{hintsOn:true,seenDialogs:[]});assert.equal(fresh.raw,null);assert.equal(fresh.resume,false);
      await capture('autosave-corrupt-safe-title');
      await click('titleStart');await waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI)','new game after corrupt data');
      await closeDialogs(['intro']);
      assert.equal(await assertSavedAfterNewGame(),true,'new game was not autosaved after corrupt record removal');
      return {corruptRecordDiscarded:true,partialRestore:false,freshGameStarted:true};
    };
    const assertSavedAfterNewGame=async()=>evaluate("(()=>{const r=JSON.parse(localStorage.getItem(TYCOON.core.AUTOSAVE_KEY));return !!r&&r.gameState.gameState.currentProject&&r.gameState.gameState.currentProject.status==='REQUESTED'})()");
    const autosaveUnavailable=async()=>{
      await evaluate("window.__qaOriginalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('blocked for F-18 test','QuotaExceededError')}");
      await startGame();
      const started=await evaluate("(()=>{const s=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI);return {v:TYCOON.app.flow.view(),status:TYCOON.app.autoSave.lastResult,raw:localStorage.getItem(TYCOON.core.AUTOSAVE_KEY),warning:s.dyn.list.some(o=>o.text==='진행 상황이 저장되지 않았습니다')}})()");
      assert.equal(started.v.project.status,'REQUESTED');assert.equal(started.status.ok,false);assert.equal(started.status.reason,'WRITE_FAILED');assert.equal(started.raw,null);
      assert.equal(started.warning,true,'save failure warning was not rendered');
      await capture('autosave-warning-visible');
      await click('requestCard');await closeDialogs(['request']);
      await click('chkResidents');
      const continued=await evaluate("(()=>{const s=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI);return {checked:TYCOON.app.flow.view().project.checks.residents,status:TYCOON.app.autoSave.lastResult,warning:s.dyn.list.some(o=>o.text==='진행 상황이 저장되지 않았습니다')}})()");
      assert.equal(continued.checked,true);assert.equal(continued.status.reason,'WRITE_FAILED');
      assert.equal(continued.warning,true,'warning disappeared before storage recovered');
      await evaluate("Storage.prototype.setItem=window.__qaOriginalSetItem");
      await click('chkUserSpec');
      const recovered=await evaluate("(()=>{const s=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI);return {checked:TYCOON.app.flow.view().project.checks.userSpec,status:TYCOON.app.autoSave.lastResult,warning:s.dyn.list.some(o=>o.text==='진행 상황이 저장되지 않았습니다'),successNotice:s.dyn.list.some(o=>typeof o.text==='string'&&o.text.includes('저장되었습니다'))}})()");
      assert.equal(recovered.checked,true);assert.equal(recovered.status.ok,true);assert.equal(recovered.warning,false,'warning remained after successful save');assert.equal(recovered.successNotice,false,'successful saves should not announce repeatedly');
      await capture('autosave-warning-cleared');
      return {storageWriteRejected:true,gameProgressContinued:true,warningShown:true,warningClearedAfterSuccessfulSave:true,noSuccessNotice:true};
    };
    const preInspectionFailure=async(kind)=>{
      await startGame();await openRequest();await prepareInspection(kind==='budget');
      await evaluate(kind==='specs'
        ? "(()=>{const c=TYCOON.app.flow.state.getContract();c.specs=[];TYCOON.app.flow.state.setContract(c)})()"
        : "(()=>{const s=TYCOON.app.flow.state.toJSON();s.gameState.budget=17;TYCOON.app.flow.state.load(s)})()");
      const before=await evaluate("({gs:TYCOON.app.flow.state.toJSON(),meta:structuredClone(TYCOON.app.flow.meta)})");
      await evaluate("(()=>{window.__qaFlowEvents=[];TYCOON.app.flow.subscribe((_,events)=>window.__qaFlowEvents.push(...events))})()");
      await click('inspect');
      const check=await evaluate("({gs:TYCOON.app.flow.state.toJSON(),meta:TYCOON.app.flow.meta,events:window.__qaFlowEvents.slice(),toast:TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).toast,fatal:TYCOON.app.flow.fatal,status:TYCOON.app.flow.state.getProjectStatus(),delivery:TYCOON.app.flow.state.getDelivery()})");
      assert.deepEqual(check.gs,before.gs);assert.deepEqual(check.meta,before.meta);assert.deepEqual(check.events,[]);assert.equal(check.fatal,null);assert.equal(check.status,'INSPECTING');
      assert.match(check.toast.text,kind==='budget'?/집행 가능액이 부족합니다/:/계약 규격/);
      assert.equal(check.delivery.inspection,undefined);
      await capture(kind==='budget'?'budget-failure-toast':'inspection-failure-toast');
      return {status:check.status,toast:check.toast.text,rollback:'GameState/meta equal; no flow events; non-fatal'};
    };
    if(scenario==='dialog-input-blocking'){
      const result=await dialogInputBlocking();
      assert.deepEqual(consoleErrors,[],'unexpected browser console/page errors');
      return {...result,consoleErrors};
    }
    if(scenario==='autosave-continuation'){
      const result=await autosaveContinuation();
      assert.deepEqual(consoleErrors,[],'unexpected browser console/page errors');
      return {...result,consoleErrors};
    }
    if(scenario==='autosave-corrupt'){
      const result=await autosaveCorrupt();
      assert.deepEqual(consoleErrors,[],'unexpected browser console/page errors');
      return {...result,consoleErrors};
    }
    if(scenario==='autosave-unavailable'){
      const result=await autosaveUnavailable();
      assert.deepEqual(consoleErrors,[],'unexpected browser console/page errors');
      return {...result,consoleErrors};
    }
    if(scenario==='inspection-failure'||scenario==='budget-failure'){
      const result=await preInspectionFailure(scenario==='inspection-failure'?'specs':'budget');
      assert.deepEqual(consoleErrors,[],'unexpected browser console/page errors');
      return {...result,consoleErrors};
    }
    if(scenario==='normal'||scenario==='temp'||scenario==='d-grade'){
      const result=await completePassingPath({skip:scenario==='temp',dGrade:scenario==='d-grade'});
      assert.deepEqual(consoleErrors,[],'unexpected browser console/page errors');
      return {...result,consoleErrors};
    }
    if(scenario==='fatal'){
      await evaluate("window.__qaOriginalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('blocked until fatal recovery','QuotaExceededError')}");
      await startGame();await openRequest();
      await evaluate("(()=>{const f=TYCOON.app.flow;f.state.load=()=>{throw new Error('forced UI E2E restore failure')};f.procurement.checkResidents=()=>{f.state.spendBudget(1);return TYCOON.core.fail(TYCOON.core.REASON.INVALID_STATE)}})()");
      await click('chkResidents');
      await waitFor('!!TYCOON.app.debugTargets.fatalNewGame&&TYCOON.app.flow.fatal!==null','fatal recovery screen');
      await capture('fatal-screen');
      const fatal=await evaluate("({state:TYCOON.app.flow.fatal,events:window.__qaFlowEvents||[],target:TYCOON.app.debugTargets.fatalNewGame})");
      assert.ok(fatal.state.originalError.includes('INVALID_STATE'),'fatal state does not retain the original command error');
      assert.ok(consoleErrors.some(e=>e.includes('TutorialFlow command failed before rollback')),'original command error was not logged to browser console');
      assert.ok(consoleErrors.some(e=>e.includes('forced UI E2E restore failure')),'rollback error was not logged to browser console');
      await evaluate("Storage.prototype.setItem=window.__qaOriginalSetItem");
      await click('fatalNewGame');
      await waitFor("TYCOON.app.flow.fatal===null&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.TITLE)",'fatal new game recovery');
      await click('titleStart');await waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI)','fatal recovery new game UI');await closeDialogs(['intro']);
      const recovered=await evaluate("(()=>{const s=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI);return {status:TYCOON.app.autoSave.lastResult,warning:s.dyn.list.some(o=>o.text==='진행 상황이 저장되지 않았습니다')}})()");
      assert.equal(recovered.status.ok,true);assert.equal(recovered.warning,false,'old save warning remained after fatal new game recovery');
      return {fatal:'fatal state shown; CDP mouse activated new game and started a fresh game',state:fatal.state,returnedToTitle:true,oldSaveWarningCleared:true,consoleErrors};
    }
    throw new Error(`Unknown UI E2E scenario: ${scenario}`);
  } finally {
    if(ws)ws.close();child.kill();await delay(300);await rm(profile,{recursive:true,force:true}).catch(()=>{});
  }
}

const selected=process.argv[2]?[process.argv[2]]:['autosave-continuation','autosave-corrupt','autosave-unavailable','dialog-input-blocking','normal','temp','d-grade','inspection-failure','budget-failure','fatal'];
for(const scenario of selected){
  const result=await withBrowser(scenario);
  outcomes.push({scenario,...result});
  console.log(`${scenario}: PASS`);
}
console.log(JSON.stringify({testedBy:'Chromium CDP mouse coordinates; no gameplay dispatch calls',viewport:'1280x720',scenarios:outcomes,screenshots:shotRoot},null,2));
