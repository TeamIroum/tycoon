/** GameState 단위 테스트. 실행 방법은 README (Node 18 이상, 외부 패키지 없음) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYCOON } from './load.mjs';
import { sampleProject, sampleSuppliers, sampleContract, sampleDelivery, sampleEvaluation, sampleCandidates } from './fixtures/sampleData.mjs';

const { GameState, SAVE_VERSION, EVENTS, RESULT_EVENTS, PROJECT_STATUS } = TYCOON.core;

const INITIAL = { budget: 1000, currentDate: { month: 1, phase: 'PLAN' }, staff: { headcount: 1, seats: 1, hired: [] } };
const make = () => new GameState(INITIAL);

test('초기값: 예산, 날짜, 빈 슬롯', () => {
  const s = make();
  assert.equal(s.getBudget(), 1000);
  assert.deepEqual(s.getCurrentDate(), { month: 1, phase: 'PLAN' });
  assert.deepEqual(s.getStaff(), { headcount: 1, seats: 1, hired: [] });
  assert.equal(s.getCandidates(), null);
  assert.equal(s.getCurrentProject(), null);
  assert.deepEqual(s.getSuppliers(), []);
  assert.deepEqual(s.getFacilities(), {});
});

test('잘못된 초기 예산은 거부', () => {
  assert.throws(() => new GameState({ ...INITIAL, budget: -1 }));
  assert.throws(() => new GameState({ ...INITIAL, budget: 1.5 }));
  assert.throws(() => new GameState({ ...INITIAL, currentDate: { month: 1 } }), /phase/);
  assert.throws(() => new GameState({ ...INITIAL, staff: undefined }));
  assert.throws(() => new GameState());
});

test('예산 차감 성공과 이벤트', () => {
  const s = make();
  const seen = [];
  s.on(EVENTS.BUDGET_CHANGED, (p) => seen.push(p));
  s.on(EVENTS.STATE_CHANGED, (p) => seen.push(p));
  const r = s.spendBudget(300);
  assert.deepEqual(r, { ok: true, budget: 700 });
  assert.equal(s.getBudget(), 700);
  assert.deepEqual(seen, [{ budget: 700, delta: -300 }, { key: 'budget' }]);
});

test('예산 부족과 잘못된 금액은 상태를 바꾸지 않고 이벤트도 없다', () => {
  const s = make();
  let events = 0;
  s.on(EVENTS.STATE_CHANGED, () => events++);
  assert.deepEqual(s.spendBudget(1001), { ok: false, reason: 'INSUFFICIENT_BUDGET', budget: 1000 });
  for (const bad of [0, -5, 1.5, NaN, '100', null, undefined, Infinity]) {
    assert.equal(s.spendBudget(bad).reason, 'INVALID_AMOUNT', String(bad));
  }
  assert.equal(s.getBudget(), 1000);
  assert.equal(events, 0);
});

test('예산을 정확히 0까지 쓸 수 있다', () => {
  const s = make();
  assert.equal(s.spendBudget(1000).ok, true);
  assert.equal(s.getBudget(), 0);
  assert.equal(s.spendBudget(1).reason, 'INSUFFICIENT_BUDGET');
});

test('getter는 복사본: 받은 객체를 고쳐도 상태는 그대로', () => {
  const s = make();
  s.setCurrentProject(sampleProject);
  const p = s.getCurrentProject();
  p.items[0].quantity = 999;
  assert.equal(s.getCurrentProject().items[0].quantity, 14);
  const input = structuredClone(sampleContract);
  s.setContract(input);
  input.amount = 5;
  assert.equal(s.getContract().amount, 182);
  const date = s.getCurrentDate(); date.month = 9;
  assert.deepEqual(s.getCurrentDate(), { month: 1, phase: 'PLAN' });
});

test('각 setter가 해당 이벤트를 보낸다', () => {
  const s = make();
  const got = [];
  for (const e of Object.values(EVENTS)) s.on(e, () => got.push(e));
  s.setCurrentProject(sampleProject);
  s.setSuppliers(sampleSuppliers);
  s.setContract(sampleContract);
  s.setDelivery(sampleDelivery);
  s.setEvaluation(sampleEvaluation);
  s.setFacilityState('hall', { stage: 'IMPROVED' });
  s.setCurrentDate({ month: 2, phase: 'PLAN' });
  for (const e of [EVENTS.PROJECT_CHANGED, EVENTS.SUPPLIERS_CHANGED, EVENTS.CONTRACT_CHANGED, EVENTS.DELIVERY_CHANGED,
    EVENTS.EVALUATION_CHANGED, EVENTS.FACILITY_CHANGED, EVENTS.DATE_CHANGED]) {
    assert.ok(got.includes(e), e);
  }
  assert.equal(got.filter((e) => e === EVENTS.STATE_CHANGED).length, 7);
  assert.deepEqual(s.getFacilityState('hall'), { stage: 'IMPROVED' });
});

test('모양이 틀린 데이터는 예외로 바로 알린다 (상태는 그대로)', () => {
  const s = make();
  assert.throws(() => s.setCurrentProject({ id: 'P1' }), /title/);
  assert.throws(() => s.setCurrentProject({ ...sampleProject, items: [] }), /items/);
  assert.throws(() => s.setSuppliers([{ ...sampleSuppliers[0], price: -1 }]), /\[0\].*price/);
  assert.throws(() => s.setSuppliers({}));
  assert.throws(() => s.setContract({ ...sampleContract, amount: 0 }), /amount/);
  assert.throws(() => s.setContract([1]));
  assert.throws(() => s.setDelivery({ ...sampleDelivery, status: 'LOST' }), /status/);
  assert.throws(() => s.setEvaluation({ ...sampleEvaluation, grade: 'F' }), /grade/);
  assert.throws(() => s.setFacilityState('hall', { level: 1 }), /stage/);
  assert.throws(() => s.setFacilityState('', { stage: 'BEFORE' }));
  assert.throws(() => s.setCurrentDate(null));
  assert.throws(() => s.setCurrentDate({ month: 2, phase: 'NIGHT' }), /phase/);
  assert.equal(s.getCurrentProject(), null);
  assert.equal(s.getContract(), null);
  s.setContract(null);
  assert.equal(s.getContract(), null);
});

test('추가 필드는 허용한다', () => {
  const s = make();
  s.setCurrentProject({ ...sampleProject, note: '팀원이 더한 필드' });
  assert.equal(s.getCurrentProject().note, '팀원이 더한 필드');
});

test('사업 단계: 순서대로만 넘어가고 건너뛰기·되돌리기·중복은 거부', () => {
  const s = make();
  assert.equal(s.setProjectStatus(PROJECT_STATUS.REVIEWING).reason, 'INVALID_STATE');
  s.setCurrentProject(sampleProject);
  assert.equal(s.getProjectStatus(), 'REQUESTED');
  const seen = [];
  s.on(EVENTS.PROJECT_STATUS_CHANGED, (p) => seen.push(p));
  assert.equal(s.setProjectStatus('CONTRACTED').ok, false);
  assert.equal(s.setProjectStatus('REVIEWING').ok, true);
  assert.equal(s.setProjectStatus('CONTRACTED').ok, true);
  assert.equal(s.setProjectStatus('CONTRACTED').reason, 'INVALID_STATE');
  assert.equal(s.setProjectStatus('REVIEWING').reason, 'INVALID_STATE');
  for (const st of ['DELIVERING', 'INSPECTING', 'EVALUATED', 'COMPLETED']) assert.equal(s.setProjectStatus(st).ok, true, st);
  assert.equal(s.setProjectStatus('COMPLETED').ok, false);
  assert.deepEqual(seen[0], { from: 'REQUESTED', to: 'REVIEWING' });
  assert.equal(seen.length, 6);
});

test('notify: 결과 이벤트만 보낼 수 있고 payload는 복사본', () => {
  const s = make();
  let got = null;
  s.on(RESULT_EVENTS.CONTRACT_REJECTED, (p) => { got = p; });
  const payload = { supplierId: 'S2', reason: 'NOT_ELIGIBLE' };
  s.notify(RESULT_EVENTS.CONTRACT_REJECTED, payload);
  payload.reason = 'changed';
  assert.deepEqual(got, { supplierId: 'S2', reason: 'NOT_ELIGIBLE' });
  assert.throws(() => s.notify(EVENTS.BUDGET_CHANGED, {}), /notify/);
  assert.throws(() => s.notify('anything', {}), /notify/);
});

test('구독 해제: 끊은 뒤에는 호출되지 않고 리스너 수가 줄어든다', () => {
  const s = make();
  let n = 0;
  const off = s.on(EVENTS.BUDGET_CHANGED, () => n++);
  assert.equal(s.listenerCount(EVENTS.BUDGET_CHANGED), 1);
  s.spendBudget(1);
  off();
  s.spendBudget(1);
  assert.equal(n, 1);
  assert.equal(s.listenerCount(EVENTS.BUDGET_CHANGED), 0);
});

test('한 구독자의 오류가 다른 구독자를 막지 않는다', () => {
  const s = make();
  let reached = false;
  const original = console.error;
  console.error = () => {};
  s.on(EVENTS.BUDGET_CHANGED, () => { throw new Error('boom'); });
  s.on(EVENTS.BUDGET_CHANGED, () => { reached = true; });
  s.spendBudget(10);
  console.error = original;
  assert.equal(reached, true);
  assert.equal(s.getBudget(), 990);
});

test('reset: 초기값으로 돌아가고 구독은 유지', () => {
  const s = make();
  let resets = 0;
  s.on(EVENTS.STATE_RESET, () => resets++);
  s.spendBudget(500);
  s.setContract(sampleContract);
  s.reset();
  assert.equal(s.getBudget(), 1000);
  assert.equal(s.getContract(), null);
  assert.equal(resets, 1);
});

test('저장과 불러오기 왕복 (버전 포함)', () => {
  const a = make();
  a.spendBudget(250);
  a.setFacilityState('hall', { stage: 'IMPROVED' });
  a.setCurrentProject(sampleProject);
  a.setProjectStatus('REVIEWING');
  const saved = JSON.stringify(a);
  assert.equal(JSON.parse(saved).version, SAVE_VERSION);
  const b = make();
  assert.deepEqual(b.load(saved), { ok: true });
  assert.equal(b.getBudget(), 750);
  assert.deepEqual(b.getFacilityState('hall'), { stage: 'IMPROVED' });
  assert.equal(b.getProjectStatus(), 'REVIEWING');
});

test('저장 데이터가 없거나 손상되면 상태를 바꾸지 않는다', () => {
  const s = make();
  s.spendBudget(100);
  assert.equal(s.load(null).reason, 'EMPTY');
  assert.equal(s.load('').reason, 'EMPTY');
  assert.equal(s.load('{broken').reason, 'CORRUPTED');
  assert.equal(s.load({ version: 999, gameState: {} }).reason, 'VERSION_MISMATCH');
  assert.equal(s.load({ version: SAVE_VERSION, gameState: { budget: -1 } }).reason, 'CORRUPTED');
  assert.equal(s.load({ version: SAVE_VERSION }).reason, 'CORRUPTED');
  assert.equal(s.getBudget(), 900);
});

test('관청 인원: 혼자 시작 → 정원 승인 → 후보 저장 → 1명 선발', () => {
  const s = make();
  const got = [];
  s.on(EVENTS.STAFF_CHANGED, (p) => got.push(['staff', p]));
  s.on(EVENTS.CANDIDATES_CHANGED, (p) => got.push(['cand', p.length]));
  s.setStaff({ headcount: 2, seats: 2, hired: [] });
  s.setCandidates(sampleCandidates);
  assert.equal(s.getCandidates().length, 3);
  s.setStaff({ headcount: 2, seats: 2, hired: [sampleCandidates[1]] });
  assert.equal(s.getStaff().hired[0].name, sampleCandidates[1].name);
  assert.equal(got.length, 3);
});

test('관청 인원 검증: 정원 초과 선발, 잘못된 후보는 거부', () => {
  const s = make();
  assert.throws(() => s.setStaff({ headcount: 1, seats: 1, hired: [sampleCandidates[0]] }), /정원/);
  assert.throws(() => s.setCandidates([{ ...sampleCandidates[0], level: '고수' }]), /level/);
  assert.throws(() => s.setCandidates([{ ...sampleCandidates[0], abilities: { review: 3 } }]), /abilities/);
  assert.throws(() => s.setCandidates('x'));
  s.setCandidates(null);
  assert.equal(s.getCandidates(), null);
});

test('저장·불러오기에 인원과 후보가 포함된다', () => {
  const a = make();
  a.setStaff({ headcount: 2, seats: 2, hired: [] });
  a.setCandidates(sampleCandidates);
  const b = make();
  assert.deepEqual(b.load(JSON.stringify(a)), { ok: true });
  assert.equal(b.getStaff().headcount, 2);
  assert.equal(b.getCandidates()[2].id, sampleCandidates[2].id);
});


test('로드는 모든 저장 객체를 검사하며 실패 시 현재 상태와 이벤트를 보존', () => {
  const s = make(); s.spendBudget(100); s.setCurrentProject(sampleProject);
  const before = structuredClone(s.toJSON()); let changes = 0; s.on(EVENTS.STATE_CHANGED, () => changes++);
  const invalid = structuredClone(before); invalid.gameState.evaluation = { projectId: 'P01', grade: 'D', reason: '미통과' };
  assert.deepEqual(s.load(invalid), { ok: false, reason: 'CORRUPTED' });
  assert.deepEqual(s.toJSON(), before); assert.equal(changes, 0);
});
test('L-14: passed 누락은 CORRUPTED이며 기존 상태를 변경하지 않음', () => {
  const s = make(); s.spendBudget(123); const before = structuredClone(s.toJSON());
  const bad = structuredClone(before); bad.gameState.evaluation = { projectId: 'P01', grade: 'A', reason: 'test' };
  assert.deepEqual(s.load(bad), { ok: false, reason: 'CORRUPTED' }); assert.deepEqual(s.toJSON(), before);
});
test('candidate reference validation allows null/empty candidate sets but checks known IDs', () => {
  const s = make(); s.setStaff({ headcount: 2, seats: 2, hired: [sampleCandidates[0]] });
  const save = s.toJSON(); assert.equal(s.load(save).ok, true);
  s.setCandidates([]); assert.equal(s.load(s.toJSON()).ok, true);
  s.setCandidates([sampleCandidates[1]]); const invalid = s.toJSON();
  assert.deepEqual(s.load(invalid), { ok: false, reason: 'CORRUPTED' });
});
test('load verifies required contract specs and rejects malformed candidate data', () => {
  const s = make(); s.setContract(sampleContract); const a = s.toJSON(); delete a.gameState.contract.specs;
  assert.equal(s.load(a).reason, 'CORRUPTED');
  const b = s.toJSON(); b.gameState.candidates = [{ id: 'broken' }]; assert.equal(s.load(b).reason, 'CORRUPTED');
});
