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
    // 대기 시간 초과 시 Scene·진행 상태·UI 버튼·대화·저장 상태를 함께 출력한다.
    const diagnose=()=>evaluate(`(()=>{try{const T=window.TYCOON,K=T.config.SCENE_KEYS,g=T.app.game,u=g.scene.getScene(K.UI),v=T.app.flow.view();
      return {scenes:g.scene.getScenes(false).map(s=>s.sys.settings.key+':'+s.sys.settings.status+(s.sys.isActive()?':active':'')),
        view:{month:v.month,phase:v.phase,pending:v.pending,status:v.project.status,grade:v.evaluation&&v.evaluation.grade,headcount:v.staff.headcount,fatal:!!v.fatal},
        ui:u?{view:u.view,popup:u.popup,targets:Object.keys(u.targets||{}),dialog:u.dialog&&u.dialog.isOpen()?(u.dialog.current&&u.dialog.current.id):null}:null,
        resumeOnLoad:T.app.resumeOnLoad,save:T.app.autoSave&&T.app.autoSave.lastResult,debugTargets:Object.keys(T.app.debugTargets||{})}}catch(e){return {diagnoseError:String(e)}}})()`).catch((e)=>({evaluateError:e.message}));
    const waitFor=async(expression,label=expression,timeout=10000)=>{const start=Date.now();while(Date.now()-start<timeout){const value=await evaluate(expression).catch(()=>false);if(value)return value;await delay(100)}throw new Error(`Timed out after ${timeout}ms waiting for ${label}\n${JSON.stringify({diagnostics:await diagnose(),consoleErrors},null,2)}`)};
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
      // 시작 화면 정책(A안): 엔딩 장면 도중 새로고침하면 END 저장은 그대로 두고 타이틀을 보여 준다.
      await waitFor('!!TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).targets.ending','END panel');
      await click('ending');await waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.ENDING)','ending scene');
      await click('endingNext');await waitFor("TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.ENDING).step===1",'colleague ending panel');
      await capture('autosave-ending-before-reload');
      const beforeReload=await evaluate("localStorage.getItem(TYCOON.core.AUTOSAVE_KEY)");
      assert.deepEqual(JSON.parse(beforeReload).gameState,hiredSaved.gameState,'END save changed by opening the ending');
      await send('Page.reload',{ignoreCache:true});
      await waitFor("!!(window.TYCOON&&TYCOON.app&&TYCOON.app.game)&&TYCOON.app.resumeOnLoad===false&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.TITLE)&&!!TYCOON.app.debugTargets.titleStart",'title after reload with END save',20000);
      const atTitle=await evaluate("(()=>{const g=TYCOON.app.game,K=TYCOON.config.SCENE_KEYS;return {raw:localStorage.getItem(TYCOON.core.AUTOSAVE_KEY),gameState:TYCOON.app.flow.state.toJSON(),phase:TYCOON.app.flow.view().phase,status:TYCOON.app.autoSave.lastResult,office:g.scene.isActive(K.OFFICE),ui:g.scene.isActive(K.UI),ending:g.scene.isActive(K.ENDING)}})()");
      assert.equal(atTitle.raw,beforeReload,'END save removed or rewritten by title entry');
      assert.deepEqual(atTitle.gameState,hiredSaved.gameState,'END state not restored behind title');
      assert.equal(atTitle.phase,'END');assert.equal(atTitle.status.ok,true);
      assert.deepEqual([atTitle.office,atTitle.ui,atTitle.ending],[false,false,false],'world/UI/ending scenes started with END save');
      await capture('autosave-end-title');
      await click('titleStart');
      await waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI)','new game UI after ending');
      await closeDialogs(['intro']);
      const fresh=await evaluate("({v:TYCOON.app.flow.view(),r:JSON.parse(localStorage.getItem(TYCOON.core.AUTOSAVE_KEY))})");
      assert.equal(fresh.v.staff.headcount,1);assert.equal(fresh.v.project.contract,null);assert.equal(fresh.v.phase,'PLAN');
      assert.deepEqual(fresh.r.gameState,await evaluate('TYCOON.app.flow.state.toJSON()'));
      assert.equal(fresh.r.meta.seenDialogs.includes('intro'),true);
      return {fileLocalStorage:storageProbe.ok,checkpoints:['new game','request confirmation','contract','delivery/inspection/evaluation','candidate generation','hire'],reloads:['after contract','after evaluation','during ending after hire -> title (END save kept)'],candidateCount:3,hiredCount:1,newGameReplacedPriorSave:true,saveAfterSuccessfulCommands:true};
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
      const before=await evaluate("({gs:TYCOON.app.flow.state.toJSON(),meta:structuredClone(TYCOON.app.flow.meta),raw:localStorage.getItem(TYCOON.core.AUTOSAVE_KEY)})");
      await evaluate("(()=>{window.__qaFlowEvents=[];TYCOON.app.flow.subscribe((_,events)=>window.__qaFlowEvents.push(...events))})()");
      await click('inspect');
      const check=await evaluate("({gs:TYCOON.app.flow.state.toJSON(),meta:TYCOON.app.flow.meta,events:window.__qaFlowEvents.slice(),toast:TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).toast,fatal:TYCOON.app.flow.fatal,status:TYCOON.app.flow.state.getProjectStatus(),delivery:TYCOON.app.flow.state.getDelivery()})");
      assert.deepEqual(check.gs,before.gs);assert.deepEqual(check.meta,before.meta);assert.deepEqual(check.events,[]);assert.equal(check.fatal,null);assert.equal(check.status,'INSPECTING');
      assert.match(check.toast.text,kind==='budget'?/집행 가능액이 부족합니다/:/계약 규격/);
      assert.equal(check.delivery.inspection,undefined);
      await capture(kind==='budget'?'budget-failure-toast':'inspection-failure-toast');
      // F-11/F-18: 실패한 검사는 저장 기록을 바꾸지 않는다. 새로고침하면 마지막 정상 저장(주입 전, 검사 대기)으로 복원되고 같은 마우스 입력으로 재시도할 수 있다.
      const saved=await evaluate("localStorage.getItem(TYCOON.core.AUTOSAVE_KEY)");
      assert.equal(saved,before.raw,'failed inspection rewrote the autosave record');
      const record=JSON.parse(saved);
      assert.equal(record.gameState.gameState.currentProject.status,'INSPECTING');
      await installSaveWriteCounter();
      await evaluate('window.__qaBeforeReload=true');
      await send('Page.reload',{ignoreCache:true});
      await waitFor("!window.__qaBeforeReload&&!!(window.TYCOON&&TYCOON.app&&TYCOON.app.game)&&TYCOON.app.resumeOnLoad===false&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI)",'resumed UI after failed inspection reload',20000);
      const resumed=await persisted();
      assert.equal(resumed.status.ok,true,`restore status ${JSON.stringify(resumed.status)}`);
      assert.deepEqual(resumed.gameState,record.gameState,'reload did not restore the last successful save');
      assert.deepEqual(resumed.meta,record.meta,'reload did not restore saved meta');
      assert.equal(resumed.raw,saved,'reload rewrote the autosave record');
      assert.equal(resumed.view.pending,'INSPECTION');assert.equal(resumed.view.project.status,'INSPECTING');
      assert.equal(resumed.view.project.inspection,null);assert.equal(resumed.view.evaluation,null);
      assert.equal(await evaluate('window.__qaSaveWrites'),0,'autosave writes during reload mean a command ran');
      await capture(kind==='budget'?'budget-failure-resumed':'inspection-failure-resumed');
      await waitFor("!!(TYCOON.app.debugTargets.marker||TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).targets.inspect)",'inspection entry after reload',15000);
      if(!(await evaluate("!!TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).targets.inspect")))await click('marker');
      await click('inspect');
      await waitFor("TYCOON.app.flow.state.getProjectStatus()==='COMPLETED'",'evaluation after retry');
      await closeDialogs(['use_started','evaluation']);
      const retried=await savedNow('inspection retry after reload');
      const g=retried.gameState.gameState;
      assert.equal(g.delivery.inspection.passed,true);
      assert.equal(retried.view.evaluation.grade,kind==='budget'?'C':'S');
      const supplement=kind==='budget'?18:0;
      assert.deepEqual(g.delivery.supplement&&g.delivery.supplement.amount||0,supplement);
      assert.equal(retried.view.budget.spent,retried.view.project.contract.amount+supplement,'contract and supplement must be charged exactly once');
      assert.notEqual(record.gameState.gameState.facilities.hall&&record.gameState.gameState.facilities.hall.stage,'IMPROVED','hall must not be improved in the saved pre-inspection state');
      assert.equal(g.facilities.hall.stage,'IMPROVED','hall improved after retry');
      assert.ok(await evaluate('window.__qaSaveWrites')>=1,'successful retry was not autosaved');
      await capture(kind==='budget'?'budget-failure-retried':'inspection-failure-retried');
      return {status:check.status,toast:check.toast.text,rollback:'GameState/meta equal; no flow events; non-fatal',
        reload:'restored last successful save (INSPECTING, pending INSPECTION, no inspection result)',retry:{grade:retried.view.evaluation.grade,supplement,budgetSpent:retried.view.budget.spent}};
    };
    // ---------- F-18 추가 복원 시점: 2월차 일부 납품 대응 중, 튜토리얼 END (진행은 마우스 입력만, 상태 주입 없음) ----------
    // 새 문서마다 페이지 스크립트보다 먼저 실행되어 자동 저장 쓰기 횟수를 센다. 복원만으로는 쓰기(=성공 명령)가 없어야 한다.
    const installSaveWriteCounter=()=>send('Page.addScriptToEvaluateOnNewDocument',{source:"(()=>{window.__qaSaveWrites=0;const o=Storage.prototype.setItem;Storage.prototype.setItem=function(k){if(k==='tycoon.autosave')window.__qaSaveWrites++;return o.apply(this,arguments)}})()"});
    const persisted=()=>evaluate("({gameState:TYCOON.app.flow.state.toJSON(),meta:structuredClone(TYCOON.app.flow.meta),view:TYCOON.app.flow.view(),raw:localStorage.getItem(TYCOON.core.AUTOSAVE_KEY),status:TYCOON.app.autoSave.lastResult})");
    const savedNow=async(label)=>{
      const x=await persisted();
      assert.ok(x.raw,`${label}: no autosave record`);
      assert.equal(x.status.ok,true,`${label}: autosave status ${JSON.stringify(x.status)}`);
      const record=JSON.parse(x.raw);
      assert.deepEqual(record.gameState,x.gameState,`${label}: stored GameState differs from live state`);
      assert.deepEqual(record.meta,x.meta,`${label}: stored meta differs from live meta`);
      return x;
    };
    const uiSnapshot=()=>evaluate(`(()=>{const K=TYCOON.config.SCENE_KEYS,g=TYCOON.app.game,u=g.scene.getScene(K.UI);
      const texts=(root)=>{const out=[];const walk=(o)=>{if(!o)return;if(typeof o.text==='string'&&o.visible!==false)out.push(o.text);if(o.list)o.list.forEach(walk)};walk(root);return out};
      const buttons=[];const walkB=(o)=>{if(!o)return;if(typeof o.setEnabled==='function'&&o.list){const t=o.list.find(x=>typeof x.text==='string'),z=o.list.find(x=>x.input);buttons.push({label:t?t.text:null,enabled:!!(z&&z.input.enabled&&z.input.cursor==='pointer')})}if(o.list)o.list.forEach(walkB)};walkB(u.dyn);
      return {active:Object.fromEntries(['TITLE','OFFICE','VILLAGE','HALL','UI','ENDING'].map(k=>[k,g.scene.isActive(K[k])])),uiView:u.view,popup:u.popup,
        targets:Object.keys(u.targets||{}).sort(),texts:texts(u.dyn),guide:texts(u.guide),buttons,dialogOpen:!!(u.dialog&&u.dialog.isOpen()),
        unit:TYCOON.config.BALANCE.currencyUnit,gradeLabels:TYCOON.config.BALANCE.gradeLabels,saveWrites:window.__qaSaveWrites}})()`);
    const reloadResume=async(label,before)=>{
      await evaluate('window.__qaBeforeReload=true');
      await send('Page.reload',{ignoreCache:true});
      await waitFor("!window.__qaBeforeReload&&!!(window.TYCOON&&TYCOON.app&&TYCOON.app.game)&&TYCOON.app.resumeOnLoad===false&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI)&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.OFFICE)",`${label}: resumed Office and UI after reload`,20000);
      assert.equal(await evaluate('TYCOON.core.AUTOSAVE_KEY'),'tycoon.autosave','save write counter watches the wrong key');
      const after=await persisted();
      assert.equal(after.status.ok,true,`${label}: restore status ${JSON.stringify(after.status)}`);
      assert.deepEqual(after.gameState,before.gameState,`${label}: GameState changed by reload`);
      assert.deepEqual(after.meta,before.meta,`${label}: meta changed by reload`);
      assert.deepEqual(after.view,before.view,`${label}: view() changed by reload`);
      assert.equal(after.raw,before.raw,`${label}: autosave record rewritten by reload`);
      assert.equal(await evaluate('window.__qaSaveWrites'),0,`${label}: autosave writes during reload mean a command ran`);
      return after;
    };
    // END 저장으로 새로고침하면 타이틀이 보이고, 저장·상태는 그대로이며 명령(저장 쓰기)도 없어야 한다.
    const reloadToTitle=async(label,before)=>{
      await evaluate('window.__qaBeforeReload=true');
      await send('Page.reload',{ignoreCache:true});
      await waitFor("!window.__qaBeforeReload&&!!(window.TYCOON&&TYCOON.app&&TYCOON.app.game)&&TYCOON.app.resumeOnLoad===false&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.TITLE)&&!!TYCOON.app.debugTargets.titleStart",`${label}: title after reload`,20000);
      await delay(300);
      const ui=await uiSnapshot();
      assert.deepEqual(ui.active,{TITLE:true,OFFICE:false,VILLAGE:false,HALL:false,UI:false,ENDING:false},`${label}: only TitleScene should run ${JSON.stringify(ui.active)}`);
      const after=await persisted();
      assert.equal(after.status.ok,true,`${label}: restore status ${JSON.stringify(after.status)}`);
      assert.equal(after.view.phase,'END',`${label}: restored phase`);
      assert.deepEqual(after.gameState,before.gameState,`${label}: GameState changed by reload`);
      assert.deepEqual(after.meta,before.meta,`${label}: meta changed by reload`);
      assert.equal(after.raw,before.raw,`${label}: END save removed or rewritten by title entry`);
      assert.equal(await evaluate('window.__qaSaveWrites'),0,`${label}: autosave writes during reload mean a command ran`);
      return after;
    };
    const assertNoWritesSinceReload=async(label)=>assert.equal(await evaluate('window.__qaSaveWrites'),0,`${label}: autosave writes after reload without input`);
    const toPartialDelivery=async()=>{
      await startGame();await openRequest();
      for(const b of ['chkResidents','chkUserSpec','chkInventory','chkCondition'])await click(b);
      await click('confirmQty');
      await waitFor('TYCOON.app.flow.view().project.quantities!==null','confirmed quantities');
      await click('popupClose');await click('advance');await closeDialogs(['proposal']);
      await waitFor("TYCOON.app.flow.view().pending==='PROPOSAL_REVIEW'",'proposal review');
      await click('sign');await closeDialogs(['contract']);
      await waitFor("TYCOON.app.flow.view().month===1&&TYCOON.app.flow.view().phase==='REPORT'",'month 1 report');
      await capture('month1-report');
      await click('closeReport');await closeDialogs(['month2']);
      await waitFor("TYCOON.app.flow.view().month===2&&TYCOON.app.flow.view().phase==='PLAN'",'month 2 plan');
      await click('popupClose');await click('advance');await closeDialogs(['partial']);
      await waitFor("TYCOON.app.flow.view().pending==='PARTIAL_DELIVERY'",'partial delivery event');
    };
    const assertPartialUi=async(label,v,negotiated)=>{
      await waitFor("(()=>{const u=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI);return u.popup==='step'&&!!u.targets.negotiate&&!!u.targets.confirmReq})()",`${label}: partial delivery panel redrawn`);
      const ui=await uiSnapshot();
      const pd=await evaluate('TYCOON.ui.SCENARIO.project.partialDelivery');
      const has=(s)=>ui.texts.includes(s), some=(s)=>[...ui.texts,...ui.guide].some((t)=>t.includes(s));
      const button=(name)=>ui.buttons.filter((b)=>b.label===name);
      assert.equal(ui.active.UI&&ui.active.OFFICE,true,`${label}: scenes ${JSON.stringify(ui.active)}`);
      assert.equal(ui.uiView,'OfficeScene');assert.equal(ui.dialogOpen,false,`${label}: dialog reopened after reload`);
      assert.ok(has('2월차 진행 중'),`${label}: phase label`);
      assert.ok(has('진행 업무 1건'),`${label}: active work count`);
      assert.ok(has(`집행 가능 ${v.budget.total-v.budget.spent}${ui.unit} / ${v.budget.total}${ui.unit}`),`${label}: budget label`);
      assert.ok(has(`매트  ${v.project.delivered.mattress} / ${v.project.contract.quantities.mattress}개`),`${label}: mattress delivery`);
      assert.ok(has(`침구  ${v.project.delivered.bedding} / ${v.project.contract.quantities.bedding}세트`),`${label}: bedding delivery`);
      assert.ok(has('확인 전'),`${label}: requester not confirmed yet`);
      assert.deepEqual(button('요청기관에 확인'),[{label:'요청기관에 확인',enabled:true}],`${label}: requester button`);
      if(negotiated){
        assert.ok(has(pd.supplierAnswer),`${label}: supplier answer kept`);
        assert.deepEqual(button('확인함'),[{label:'확인함',enabled:false}],`${label}: supplier response shown as done`);
        assert.deepEqual(button('일정 협의'),[],`${label}: negotiation offered again`);
        assert.ok(some('[지급 순서 확인]'),`${label}: guide points to requester confirmation`);
      }else{
        assert.ok(has('협의 전'),`${label}: supplier not negotiated yet`);
        assert.deepEqual(button('일정 협의'),[{label:'일정 협의',enabled:true}],`${label}: negotiation button`);
        assert.ok(some('[일정 협의]'),`${label}: guide points to negotiation`);
      }
      return {phaseLabel:'2월차 진행 중',delivered:`${v.project.delivered.mattress}/${v.project.contract.quantities.mattress}, ${v.project.delivered.bedding}/${v.project.contract.quantities.bedding}`,buttons:ui.buttons.filter((b)=>['확인함','일정 협의','요청기관에 확인'].includes(b.label))};
    };
    const autosavePartialDelivery=async()=>{
      await installSaveWriteCounter();
      await toPartialDelivery();
      const arrival=await savedNow('partial delivery arrival');
      const g0=arrival.gameState.gameState;
      assert.equal(arrival.view.month,2);assert.equal(arrival.view.phase,'PAUSED');assert.equal(arrival.view.pending,'PARTIAL_DELIVERY');
      assert.ok(arrival.view.project.delivered.bedding<arrival.view.project.contract.quantities.bedding,'partial delivery should be short');
      await capture('arrival-before-reload');
      await reloadResume('partial arrival',arrival);
      const arrivalUi=await assertPartialUi('partial arrival',arrival.view,false);
      await assertNoWritesSinceReload('partial arrival');
      await capture('arrival-resumed');

      await click('negotiate');
      await waitFor('TYCOON.app.flow.view().project.event.supplierNegotiated','supplier negotiation after resume');
      const negotiated=await savedNow('supplier negotiated');
      const g1=negotiated.gameState.gameState;
      assert.deepEqual(negotiated.view.project.event,{supplierNegotiated:true,requesterConfirmed:false});
      assert.equal(negotiated.view.pending,'PARTIAL_DELIVERY');
      assert.deepEqual(negotiated.view.budget,arrival.view.budget,'negotiation changed budget');
      assert.deepEqual(g1.delivery.delivered,g0.delivery.delivered,'negotiation alone changed delivered quantities');
      assert.deepEqual(g1.contract,g0.contract,'contract changed during partial delivery');
      assert.ok(g1.delivery.issues.some((i)=>!i.resolved),'issue resolved before both responses');
      await capture('negotiated-before-reload');
      await reloadResume('partial negotiated',negotiated);
      const negotiatedUi=await assertPartialUi('partial negotiated',negotiated.view,true);
      await assertNoWritesSinceReload('partial negotiated');
      await capture('negotiated-resumed');

      // 새로고침 후 다음 단계 진행: 요청기관 확인 → 검사 → 평가
      await click('confirmReq');await closeDialogs(['inspection']);
      await waitFor("TYCOON.app.flow.view().pending==='INSPECTION'&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.VILLAGE)",'inspection after resumed partial delivery');
      const inspecting=await savedNow('requester confirmed after resume');
      const g2=inspecting.gameState.gameState;
      assert.deepEqual(inspecting.view.project.delivered,inspecting.view.project.contract.quantities,'delivery not completed to contract quantities');
      assert.deepEqual(inspecting.view.budget,negotiated.view.budget,'delivery response charged budget');
      assert.equal(g2.delivery.issues.length,g1.delivery.issues.length,'delivery issues duplicated');
      assert.ok(g2.delivery.issues.every((i)=>i.resolved));
      assert.deepEqual(g2.contract,g0.contract,'contract duplicated or changed');
      assert.equal(g2.currentProject.status,'INSPECTING');
      await waitFor('!!TYCOON.app.debugTargets.marker','inspection marker',12000);
      await click('marker');
      await waitFor('!!TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).targets.inspect','inspection button');
      await click('inspect');
      await waitFor("TYCOON.app.flow.state.getProjectStatus()==='COMPLETED'",'evaluation after resumed partial delivery');
      await closeDialogs(['use_started','evaluation']);
      const evaluated=await savedNow('evaluation after resume');
      assert.equal(evaluated.view.evaluation.grade,'S');assert.equal(evaluated.view.evaluation.passed,true);
      assert.equal(evaluated.view.project.supplement,null);
      assert.equal(evaluated.view.budget.spent,evaluated.view.project.contract.amount,'budget spent must equal exactly one contract payment');
      await capture('evaluated-after-resume');
      return {reloads:['partial delivery arrival (no response)','supplier negotiated, requester not confirmed'],
        restored:{month:negotiated.view.month,phase:negotiated.view.phase,pending:negotiated.view.pending,event:negotiated.view.project.event,delivered:negotiated.view.project.delivered,budgetSpent:negotiated.view.budget.spent},
        ui:{arrival:arrivalUi,negotiated:negotiatedUi},saveWritesDuringReload:0,
        afterResume:{inspection:'requester confirmed by mouse, delivery completed, no extra charge',grade:evaluated.view.evaluation.grade,budgetSpent:evaluated.view.budget.spent,contractAmount:evaluated.view.project.contract.amount}};
    };
    const officeSeat=()=>evaluate("(()=>{const g=TYCOON.app.game,o=g.scene.getScene(TYCOON.config.SCENE_KEYS.OFFICE),objs=o.objs||[];return {active:o.sys.isActive(),arrived:g.registry.get('colleagueArrived')===true,walking:!!o.walker&&o.walker.sprite.texture.key!=='colleague_sit',seated:(o.walker&&o.walker.sprite.texture.key==='colleague_sit')||objs.some(x=>x.texture&&x.texture.key==='colleague_sit'),emptySeatTag:objs.some(x=>x.text==='정비 전 업무석')}})()");
    const assertEndUi=async(label,v)=>{
      await waitFor("(()=>{const u=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI);return u.popup==='step'&&!!u.targets.ending})()",`${label}: END panel redrawn`);
      const ui=await uiSnapshot();
      const has=(s)=>ui.texts.includes(s);
      const h=v.staff.hired;
      assert.equal(ui.active.UI&&ui.active.OFFICE,true,`${label}: scenes ${JSON.stringify(ui.active)}`);
      assert.equal(ui.dialogOpen,false,`${label}: dialog reopened after reload`);
      assert.ok(has('튜토리얼 완료'),`${label}: END phase label`);
      assert.ok(has('진행 업무 0건'),`${label}: active work count`);
      assert.ok(has(`종합 등급 ${v.evaluation.grade} ${ui.gradeLabels[v.evaluation.grade]}`),`${label}: grade label`);
      assert.ok(has(`집행 가능 ${v.budget.total-v.budget.spent}${ui.unit} / ${v.budget.total}${ui.unit}`),`${label}: budget label`);
      assert.ok(has('첫 동료 선발 완료'),`${label}: completion panel title`);
      assert.ok(ui.texts.some((t)=>t.startsWith(`${h.name}(${h.specialty})이 두 번째 업무석에 앉았습니다.`)),`${label}: hired colleague text`);
      assert.deepEqual(ui.buttons.filter((b)=>b.label==='마무리 장면 보기'),[{label:'마무리 장면 보기',enabled:true}]);
      for(const gone of ['hire','cand0','cand1','cand2','closeReport','inspect'])assert.equal(ui.targets.includes(gone),false,`${label}: progress button ${gone} still offered`);
      // 월 진행 버튼은 항상 그려지지만 END에서는 '진행 완료'로 비활성이어야 한다.
      assert.deepEqual(ui.buttons.filter((b)=>b.label==='진행 완료'),[{label:'진행 완료',enabled:false}],`${label}: month advance button must be disabled`);
      await waitFor("(()=>{const o=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.OFFICE);return TYCOON.app.game.registry.get('colleagueArrived')===true||(o.objs||[]).some(x=>x.texture&&x.texture.key==='colleague_sit')})()",`${label}: colleague seated in office`,15000);
      const seat=await officeSeat();
      assert.equal(seat.seated,true,`${label}: colleague not seated ${JSON.stringify(seat)}`);
      assert.equal(seat.emptySeatTag,false,`${label}: empty-seat tag shown`);
      return {phaseLabel:'튜토리얼 완료',grade:`${v.evaluation.grade} ${ui.gradeLabels[v.evaluation.grade]}`,colleague:`${h.name}(${h.specialty})`,endingButtonEnabled:true,progressButtonsOffered:false,seat};
    };
    const autosaveEnd=async()=>{
      await installSaveWriteCounter();
      await startGame();await openRequest();await prepareInspection(false);
      await click('inspect');
      await waitFor("TYCOON.app.flow.state.getProjectStatus()==='COMPLETED'",'evaluation');
      await closeDialogs(['use_started','evaluation']);
      await waitFor('!!TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).targets.closeReport','evaluation report button');
      await click('closeReport');await closeDialogs(['recruit']);
      await waitFor("TYCOON.app.flow.view().phase==='RECRUIT'",'recruit selection');
      // F-14/F-18: 후보 공개 직후 새로고침해도 같은 후보·정원·진행 단계로 복원되고, 채용은 일어나지 않는다.
      const recruit=await savedNow('recruit opened');
      assert.equal(recruit.view.phase,'RECRUIT');assert.equal(recruit.gameState.gameState.currentDate.pending,'RECRUIT');
      assert.equal(recruit.gameState.gameState.candidates.length,3);assert.deepEqual(recruit.gameState.gameState.staff.hired,[]);
      await capture('recruit-before-reload');
      await reloadResume('recruit opened',recruit);
      await waitFor("['cand0','cand1','cand2'].every(k=>!!TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).targets[k])",'candidate cards after reload',10000);
      const recruitUi=await uiSnapshot();
      assert.equal(recruitUi.dialogOpen,false,'recruit dialog reopened after reload');
      assert.equal(recruitUi.targets.includes('ending'),false,'END panel shown before hire');
      await assertNoWritesSinceReload('recruit opened');
      await capture('recruit-resumed');
      await click('cand1');
      await waitFor("TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).selected!==null",'candidate selection');
      const chosen=await evaluate("TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).selected");
      await click('hire');
      await waitFor("TYCOON.app.flow.view().phase==='END'&&TYCOON.app.flow.view().staff.headcount===2",'tutorial END');
      await waitFor('!!TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI).targets.ending','END panel',8000);
      await waitFor("TYCOON.app.game.registry.get('colleagueArrived')===true",'colleague walked to seat before reload',15000);
      const end=await savedNow('tutorial END');
      const g=end.gameState.gameState;
      assert.equal(end.view.phase,'END');assert.equal(end.view.evaluation.grade,'S');assert.equal(end.view.evaluation.passed,true);
      assert.equal(end.view.staff.hired.id,chosen);assert.equal(g.staff.headcount,2);assert.equal(g.staff.hired.length,1);
      assert.equal(g.candidates.length,3);assert.equal(g.facilities.hall.stage,'IMPROVED');assert.equal(g.currentProject.status,'COMPLETED');
      assert.equal(end.view.region.secondSeat,true);
      await capture('end-before-reload');

      // END 완료 화면(새로고침 전, 같은 세션)
      const endUi=await assertEndUi('tutorial END',end.view);
      await capture('end-before-reload-ui');

      // 시작 화면 정책(A안): END 저장으로 새로고침하면 타이틀. 저장은 지우지 않고 명령도 실행하지 않는다.
      await reloadToTitle('tutorial END',end);
      await capture('end-reload-title');
      // 타이틀에서 다시 새로고침해도 END 저장이 남아 있고 타이틀이 보인다.
      await reloadToTitle('reload again on title',end);

      // (엔딩 장면 도중 새로고침 → 타이틀은 autosave-continuation 시나리오에서 확인한다.)

      // 타이틀 '새로 시작' → 저장이 새 게임 상태로 교체
      await click('titleStart');
      await waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI)','new game UI');
      await closeDialogs(['intro']);
      const fresh=await savedNow('new game after END');
      const f=fresh.gameState.gameState;
      assert.notEqual(fresh.raw,end.raw);
      assert.equal(fresh.view.month,1);assert.equal(fresh.view.phase,'PLAN');assert.equal(fresh.view.project.status,'REQUESTED');
      assert.equal(fresh.view.budget.spent,0);assert.equal(f.contract,null);assert.equal(f.delivery,null);assert.equal(f.evaluation,null);
      assert.equal(f.candidates,null);assert.deepEqual(f.staff.hired,[]);assert.equal(f.staff.headcount,1);assert.equal(f.facilities.hall.stage,'BEFORE');
      assert.deepEqual(fresh.meta.seenDialogs,['intro'],'old dialog history kept after new game');
      await reloadResume('new game after END',fresh);
      const freshUi=await uiSnapshot();
      assert.ok(freshUi.texts.includes('1월차 월초 계획'),'new game phase label after reload');
      assert.equal(freshUi.targets.includes('ending'),false,'END panel shown after new game reload');
      await capture('new-game-resumed');
      return {reloads:['recruit opened (candidates revealed, no hire) -> Office','tutorial END -> Title','again on Title -> Title','new game after END -> Office'],
        restored:{phase:end.view.phase,grade:end.view.evaluation.grade,headcount:g.staff.headcount,hired:end.view.staff.hired.id,candidates:g.candidates.length,hall:g.facilities.hall.stage,budgetSpent:end.view.budget.spent},
        ui:endUi,endSaveKeptOnTitle:true,saveWritesDuringReload:0,
        newGame:{replacedSave:true,month:fresh.view.month,phase:fresh.view.phase,headcount:f.staff.headcount,restoredAsNewGame:true}};
    };
    if(scenario==='autosave-partial-delivery'||scenario==='autosave-end'){
      const result=scenario==='autosave-end'?await autosaveEnd():await autosavePartialDelivery();
      assert.deepEqual(consoleErrors,[],'unexpected browser console/page errors');
      return {...result,consoleErrors};
    }
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

const selected=process.argv.length>2?process.argv.slice(2):['autosave-continuation','autosave-partial-delivery','autosave-end','autosave-corrupt','autosave-unavailable','dialog-input-blocking','normal','temp','d-grade','inspection-failure','budget-failure','fatal'];
for(const scenario of selected){
  const result=await withBrowser(scenario);
  outcomes.push({scenario,...result});
  console.log(`${scenario}: PASS`);
}
console.log(JSON.stringify({testedBy:'Chromium CDP mouse coordinates; no gameplay dispatch calls',viewport:'1280x720',scenarios:outcomes,screenshots:shotRoot},null,2));
