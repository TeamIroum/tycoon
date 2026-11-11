/** 튜토리얼 흐름 테스트. 시스템들이 GameState 위에서 기능정의서 순서대로 끝까지 진행되는지 확인한다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYCOON } from './load.mjs';

const { TutorialFlow, topAbility } = TYCOON.systems;

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function start(seed = 1) { const f = new TutorialFlow({ rng: seeded(seed) }); f.newGame(); return f; }
const d = (f, type, payload) => f.dispatch(type, payload);

function checks(f, withCondition) {
  d(f, 'CHECK_RESIDENTS'); d(f, 'CHECK_USER_SPEC'); d(f, 'CHECK_INVENTORY_COUNT');
  if (withCondition) d(f, 'CHECK_MATTRESS_CONDITION');
  let r = d(f, 'CONFIRM_QUANTITIES');
  if (r.events.includes('HINT_WET')) r = d(f, 'CONFIRM_QUANTITIES');
  return r;
}
function toEnd(f, withCondition) {
  checks(f, withCondition);
  for (const c of ['ADVANCE_MONTH', 'SIGN_CONTRACT', 'CLOSE_REPORT', 'ADVANCE_MONTH', 'EVENT_NEGOTIATE_SUPPLIER', 'EVENT_CONFIRM_REQUESTER', 'CONFIRM_INSPECTION', 'CLOSE_REPORT']) {
    assert.ok(d(f, c).ok, c);
  }
  assert.ok(d(f, 'HIRE', { candidateId: f.view().meta.candidates[0].id }).ok);
}

test('모든 확인: S 등급, 시설 개선, 동료 선발로 끝', () => {
  const f = start();
  toEnd(f, true);
  const v = f.view();
  assert.equal(v.phase, 'END');
  assert.equal(v.evaluation.grade, 'S');
  assert.equal(f.state.getProjectStatus(), 'COMPLETED');
  assert.deepEqual(f.state.getFacilityState('hall'), { stage: 'IMPROVED' });
  assert.equal(f.state.getStaff().hired.length, 1);
  assert.equal(v.budget.spent, 182);
});

test('매트 점검 생략: 힌트 1회, 보완 납품, C 등급', () => {
  const f = start();
  d(f, 'CHECK_RESIDENTS'); d(f, 'CHECK_USER_SPEC'); d(f, 'CHECK_INVENTORY_COUNT');
  assert.deepEqual(d(f, 'CONFIRM_QUANTITIES').events, ['HINT_WET']);
  assert.deepEqual(d(f, 'CONFIRM_QUANTITIES').events, ['QUANTITIES_CONFIRMED']);
  assert.equal(f.view().project.quantities.mattress, 12);
  for (const c of ['ADVANCE_MONTH', 'SIGN_CONTRACT', 'CLOSE_REPORT', 'ADVANCE_MONTH', 'EVENT_NEGOTIATE_SUPPLIER', 'EVENT_CONFIRM_REQUESTER', 'CONFIRM_INSPECTION']) d(f, c);
  const v = f.view();
  assert.equal(v.project.supplement.mattress, 2);
  assert.equal(v.evaluation.grade, 'C');
});

test('계약은 1순위와 한 번만, 예산은 한 번만 차감', () => {
  const f = start();
  checks(f, true); d(f, 'ADVANCE_MONTH');
  const { rows, winnerId } = f.compareSuppliers();
  assert.equal(rows.find((r) => r.id === 'S2').eligible, false);
  assert.equal(winnerId, 'S1');
  assert.equal(f.procurement.createContract('S3').reason, 'NOT_ELIGIBLE');
  assert.ok(d(f, 'SIGN_CONTRACT').ok);
  const budget = f.state.getBudget();
  assert.equal(d(f, 'SIGN_CONTRACT').ok, false);
  assert.equal(f.procurement.createContract('S1').reason, 'INVALID_STATE');
  assert.equal(f.state.getBudget(), budget);
});

test('확인 전에는 월 진행 불가, 사건 중에는 다음 단계로 못 감', () => {
  const f = start();
  assert.equal(d(f, 'ADVANCE_MONTH').ok, false);
  checks(f, true);
  d(f, 'ADVANCE_MONTH'); d(f, 'SIGN_CONTRACT'); d(f, 'CLOSE_REPORT'); d(f, 'ADVANCE_MONTH');
  assert.equal(f.view().pending, 'PARTIAL_DELIVERY');
  assert.equal(d(f, 'ADVANCE_MONTH').ok, false);
  assert.equal(d(f, 'CONFIRM_INSPECTION').ok, false);
  d(f, 'EVENT_NEGOTIATE_SUPPLIER');
  assert.equal(d(f, 'EVENT_NEGOTIATE_SUPPLIER').ok, false);
  d(f, 'EVENT_CONFIRM_REQUESTER');
  assert.equal(f.view().pending, 'INSPECTION');
  assert.equal(f.view().project.delivered.bedding, 8);
});

test('후보 3명: 강점과 전문 분야가 겹치지 않고, 두 명은 선발할 수 없음', () => {
  for (let seed = 1; seed < 30; seed++) {
    const f = start(seed);
    checks(f, true);
    for (const c of ['ADVANCE_MONTH', 'SIGN_CONTRACT', 'CLOSE_REPORT', 'ADVANCE_MONTH', 'EVENT_NEGOTIATE_SUPPLIER', 'EVENT_CONFIRM_REQUESTER', 'CONFIRM_INSPECTION', 'CLOSE_REPORT']) d(f, c);
    const c = f.state.getCandidates();
    assert.equal(new Set(c.map(topAbility)).size, 3);
    assert.equal(new Set(c.map((x) => x.specialty)).size, 3);
    assert.ok(d(f, 'HIRE', { candidateId: c[0].id }).ok);
    assert.equal(d(f, 'HIRE', { candidateId: c[1].id }).ok, false);
  }
});

test('힌트 끄기: 바로 확정', () => {
  const f = start();
  d(f, 'SET_HINTS', { on: false });
  d(f, 'CHECK_RESIDENTS'); d(f, 'CHECK_USER_SPEC'); d(f, 'CHECK_INVENTORY_COUNT');
  assert.deepEqual(d(f, 'CONFIRM_QUANTITIES').events, ['QUANTITIES_CONFIRMED']);
});

test('사업 단계가 기능정의서 순서대로 지나간다', () => {
  const f = start();
  const seen = [];
  f.state.on(TYCOON.core.EVENTS.PROJECT_STATUS_CHANGED, (p) => seen.push(p.to));
  toEnd(f, true);
  assert.deepEqual(seen, ['REVIEWING', 'CONTRACTED', 'DELIVERING', 'INSPECTING', 'EVALUATED', 'COMPLETED']);
});


test('D 평가 미통과: 시설·정원·후보·채용·사용 개시를 차단하고 튜토리얼 종료', () => {
  const balance = { ...TYCOON.config.BALANCE, gradeTable: [{ min: 0, grade: 'D' }], passingGrades: ['S', 'A', 'B', 'C'] };
  const f = new TutorialFlow({ rng: seeded(3), balance }); f.newGame();
  checks(f, true);
  for (const c of ['ADVANCE_MONTH','SIGN_CONTRACT','CLOSE_REPORT','ADVANCE_MONTH','EVENT_NEGOTIATE_SUPPLIER','EVENT_CONFIRM_REQUESTER']) assert.ok(d(f,c).ok,c);
  const events=[]; f.subscribe((_, e)=>events.push(...e));
  assert.ok(d(f,'CONFIRM_INSPECTION').ok);
  assert.equal(f.state.getProjectStatus(),'EVALUATED'); assert.equal(f.state.getFacilityState('hall').stage,'BEFORE');
  assert.equal(f.state.getStaff().headcount,1); assert.equal(f.state.getCandidates(),null);
  assert.ok(!events.includes('USE_STARTED'));
  assert.ok(d(f,'CLOSE_REPORT').ok); assert.equal(f.view().phase,'END'); assert.equal(f.state.getCandidates(),null);
  assert.ok(!f.view().reports[0].lines.some((line) => line.startsWith('사용 개시:')));
  assert.equal(f.recruit.hire('C01').ok,false);
});
test('D-1 점검 생략 TEMP 보완: 매트 2개, 18만원, 최종 수량·규격 통과', () => {
  const f=start(); checks(f,false);
  for (const c of ['ADVANCE_MONTH','SIGN_CONTRACT','CLOSE_REPORT','ADVANCE_MONTH','EVENT_NEGOTIATE_SUPPLIER','EVENT_CONFIRM_REQUESTER']) assert.ok(d(f,c).ok,c);
  assert.ok(d(f,'CONFIRM_INSPECTION').ok);
  const delivery=f.state.getDelivery();
  assert.equal(delivery.supplement.temp,true); assert.equal(delivery.supplement.mattress,2); assert.equal(delivery.supplement.amount,18);
  assert.equal(f.state.getContract().items.find((item) => item.itemId === 'mattress').quantity,12);
  assert.equal(delivery.delivered.find((item) => item.itemId === 'mattress').quantity,14);
  assert.equal(f.state.getBudget(),TYCOON.config.INITIAL_STATE.budget-182);
  assert.deepEqual(delivery.inspection,{passed:true,quantityPassed:true,specsPassed:true});
  assert.equal(f.state.getProjectStatus(),'COMPLETED');
});
test('초과 납품: 계약·실제 필요 검사 목표 이상이면 정식 검사 통과, 보완은 중복 집행하지 않음', () => {
  const f=start(); checks(f,true);
  for (const c of ['ADVANCE_MONTH','SIGN_CONTRACT','CLOSE_REPORT','ADVANCE_MONTH','EVENT_NEGOTIATE_SUPPLIER','EVENT_CONFIRM_REQUESTER']) assert.ok(d(f,c).ok,c);
  const contract=f.state.getContract();
  const delivery=f.state.getDelivery();
  const contractQty=contract.items.find((item)=>item.itemId==='mattress').quantity;
  const actualNeed=f.procurement.trueShortage().mattress;
  const target=Math.max(contractQty,actualNeed);
  const delivered=delivery.delivered.map((item)=>item.itemId==='mattress'?{...item,quantity:target+1}:item);
  f.state.setDelivery({...delivery,delivered});
  const budgetBefore=f.state.getBudget();
  assert.ok(d(f,'CONFIRM_INSPECTION').ok);
  const inspected=f.state.getDelivery();
  assert.equal(contractQty,14); assert.equal(actualNeed,14); assert.equal(target,14);
  assert.equal(inspected.delivered.find((item)=>item.itemId==='mattress').quantity,15);
  assert.deepEqual(inspected.inspection,{passed:true,quantityPassed:true,specsPassed:true});
  assert.equal(inspected.supplement,null); assert.equal(f.state.getBudget(),budgetBefore);
});
test('TEMP 보완 예산 부족: 검사 실패 사유 반환 및 명령 직전 INSPECTING snapshot 전체 복원', () => {
  const f=start(); checks(f,false);
  for (const c of ['ADVANCE_MONTH','SIGN_CONTRACT','CLOSE_REPORT','ADVANCE_MONTH','EVENT_NEGOTIATE_SUPPLIER','EVENT_CONFIRM_REQUESTER']) assert.ok(d(f,c).ok,c);
  const saved=f.state.toJSON(); saved.gameState.budget=17; assert.equal(f.state.load(saved).ok,true);
  const before=structuredClone(f.state.toJSON()), meta=structuredClone(f.meta), events=[]; f.subscribe((_,e)=>events.push(...e));
  const r=d(f,'CONFIRM_INSPECTION');
  assert.equal(r.ok,false); assert.equal(r.error,'집행 가능액이 부족합니다');
  assert.deepEqual(f.state.toJSON(),before); assert.deepEqual(f.meta,meta); assert.deepEqual(events,[]);
  assert.equal(f.state.getProjectStatus(),'INSPECTING'); assert.equal(f.state.getBudget(),17);
  assert.equal(f.state.getDelivery().supplement,undefined); assert.equal(f.state.getDelivery().inspection,undefined);
  assert.equal(f.view().fatal,null);
});
test('검사 실패 시 dispatch가 GameState·meta를 복원하고 실패 이벤트를 내지 않음', () => {
  const f=start(); const before=structuredClone(f.state.toJSON()); const meta=structuredClone(f.meta); const seen=[]; f.subscribe((_,e)=>seen.push(...e));
  f.procurement.checkResidents=()=>{ f.state.spendBudget(1); f.meta.hintsOn=false; return TYCOON.core.fail(TYCOON.core.REASON.INVALID_STATE); };
  const r=d(f,'CHECK_RESIDENTS'); assert.equal(r.ok,false); assert.deepEqual(f.state.toJSON(),before); assert.deepEqual(f.meta,meta); assert.deepEqual(seen,[]);
});
test('F-7: 명령 오류 뒤 snapshot 복원 성공', () => {
  const f=start(); const before=structuredClone(f.state.toJSON()); const meta=structuredClone(f.meta);
  f.procurement.checkResidents=()=>{f.state.spendBudget(7); f.meta.seenDialogs.push('temporary'); return TYCOON.core.fail('INVALID_STATE');};
  assert.equal(d(f,'CHECK_RESIDENTS').ok,false); assert.deepEqual(f.state.toJSON(),before); assert.deepEqual(f.meta,meta);
});
test('F-8/F-9/F-10: 롤백 실패는 fatal 차단, 두 오류 기록, 새 게임에서 해제', () => {
  const f=start(); const errors=[]; const original=console.error; console.error=(...args)=>errors.push(args);
  try {
    f.procurement.checkResidents=()=>{f.state.spendBudget(1); return TYCOON.core.fail('INVALID_STATE');};
    f.state.load=()=>{throw new Error('restore failed');};
    const r=d(f,'CHECK_RESIDENTS'); assert.equal(r.code,'ROLLBACK_FAILED'); assert.equal(f.view().fatal !== null,true);
    assert.equal(d(f,'CHECK_RESIDENTS').code,'ROLLBACK_FAILED'); assert.equal(errors.length,2);
    assert.match(JSON.stringify(errors[0][1]),/INVALID_STATE/); assert.match(String(errors[1][1]),/restore failed/);
  } finally { console.error=original; }
  f.newGame(); assert.equal(f.view().fatal,null);
});
test('toJSON/load 왕복: 시작부터 조달·계약·검사·평가·개선·후보·채용 정상 상태', () => {
  const f=start(); const roundTrip=()=>{const saved=f.state.toJSON(); assert.deepEqual(f.state.load(saved),{ok:true});};
  roundTrip(); checks(f,true); roundTrip();
  for (const c of ['ADVANCE_MONTH','SIGN_CONTRACT','CLOSE_REPORT','ADVANCE_MONTH','EVENT_NEGOTIATE_SUPPLIER','EVENT_CONFIRM_REQUESTER']) {assert.ok(d(f,c).ok,c); roundTrip();}
  assert.ok(d(f,'CONFIRM_INSPECTION').ok); roundTrip();
  assert.equal(f.state.getEvaluation().passed,true); assert.equal(f.state.getProjectStatus(),'COMPLETED');
  assert.ok(d(f,'CLOSE_REPORT').ok); roundTrip();
  assert.equal(f.state.getCandidates().length,3);
  assert.ok(d(f,'HIRE',{candidateId:f.state.getCandidates()[0].id}).ok); roundTrip();
  assert.equal(f.state.getStaff().hired.length,1);
});
test('L-10/L-11/L-12/L-13: 후보 생성·채용 복원, 목록 없음 허용, 알려진 ID 불일치 거부', () => {
  const f=start(); checks(f,true);
  for (const c of ['ADVANCE_MONTH','SIGN_CONTRACT','CLOSE_REPORT','ADVANCE_MONTH','EVENT_NEGOTIATE_SUPPLIER','EVENT_CONFIRM_REQUESTER','CONFIRM_INSPECTION','CLOSE_REPORT']) assert.ok(d(f,c).ok,c);
  let save=f.state.toJSON(); let restored=new TYCOON.core.GameState(TYCOON.config.INITIAL_STATE); assert.equal(restored.load(save).ok,true); assert.equal(restored.getCandidates().length,3);
  const id=f.state.getCandidates()[0].id; assert.ok(d(f,'HIRE',{candidateId:id}).ok); save=f.state.toJSON(); restored=new TYCOON.core.GameState(TYCOON.config.INITIAL_STATE); assert.equal(restored.load(save).ok,true); assert.equal(restored.getStaff().hired[0].id,id);
  const noPool=structuredClone(save); noPool.gameState.candidates=null; assert.equal(restored.load(noPool).ok,true);
  const bad=structuredClone(save); bad.gameState.candidates=[{...f.state.getCandidates()[1]}]; assert.equal(restored.load(bad).reason,'CORRUPTED');
});
test('정식 검사 실패 시 전체 snapshot rollback, 상태 중간값·비용·검사결과 없음', () => {
  const f=start(); checks(f,false);
  for (const c of ['ADVANCE_MONTH','SIGN_CONTRACT','CLOSE_REPORT','ADVANCE_MONTH','EVENT_NEGOTIATE_SUPPLIER','EVENT_CONFIRM_REQUESTER']) assert.ok(d(f,c).ok,c);
  const contract=f.state.getContract(); contract.specs=[]; f.state.setContract(contract);
  const delivery=f.state.getDelivery();
  f.state.setDelivery({...delivery,delivered:delivery.delivered.map((item)=>item.itemId==='mattress'?{...item,quantity:15}:item)});
  const before=structuredClone(f.state.toJSON()), meta=structuredClone(f.meta), events=[]; f.subscribe((_,e)=>events.push(...e));
  const r=d(f,'CONFIRM_INSPECTION'); assert.equal(r.ok,false); assert.match(r.error,/규격/);
  assert.deepEqual(f.state.toJSON(),before); assert.deepEqual(f.meta,meta); assert.deepEqual(events,[]); assert.equal(f.state.getProjectStatus(),'INSPECTING');
});

