/**
 * 화면 API 계약 테스트 (API명세서 1장, 4장, 5-2, 6-3, 6-4).
 * 화면(팀원 2·3)이 쓰는 공개 계약만 검사한다: dispatch 반환, 화면 알림, view() 필드, 실패 시 이벤트 전달 여부.
 * 필드는 추가될 수 있으므로 view()는 "있어야 할 필드와 자료형"만 확인한다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYCOON } from './load.mjs';

const { TutorialFlow } = TYCOON.systems;
const { REASON, FLOW_REASON, EVENTS, RESULT_EVENTS } = TYCOON.core;

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function start(options = {}) { const f = new TutorialFlow({ rng: seeded(1), ...options }); f.newGame(); return f; }
const D_BALANCE = { ...TYCOON.config.BALANCE, gradeTable: [{ min: 0, grade: 'D' }], passingGrades: ['S', 'A', 'B', 'C'] };
const TO_INSPECTION = ['ADVANCE_MONTH', 'SIGN_CONTRACT', 'CLOSE_REPORT', 'ADVANCE_MONTH', 'EVENT_NEGOTIATE_SUPPLIER', 'EVENT_CONFIRM_REQUESTER'];

function checks(f, withCondition) {
  for (const c of ['CHECK_RESIDENTS', 'CHECK_USER_SPEC', 'CHECK_INVENTORY_COUNT']) assert.ok(f.dispatch(c).ok, c);
  if (withCondition) assert.ok(f.dispatch('CHECK_MATTRESS_CONDITION').ok);
  let r = f.dispatch('CONFIRM_QUANTITIES');
  if (r.events.includes('HINT_WET')) r = f.dispatch('CONFIRM_QUANTITIES');
  assert.ok(r.ok);
}
function toInspection(f, withCondition) {
  checks(f, withCondition);
  for (const c of TO_INSPECTION) assert.ok(f.dispatch(c).ok, c);
}
/** 저장 데이터를 고쳐 불러와 실패 조건을 만든다(브라우저 테스트의 상태 주입과 같은 방식). */
function patchState(f, change) {
  const saved = f.state.toJSON(); change(saved.gameState);
  assert.equal(f.state.load(saved).ok, true);
}
/** GameState의 모든 상태·결과 이벤트를 기록한다. */
function recordStateEvents(f) {
  const seen = [];
  for (const name of [...Object.values(EVENTS), ...Object.values(RESULT_EVENTS)]) f.state.on(name, (payload) => seen.push([name, payload]));
  return seen;
}

// ---------- 6-4: view() 필드와 자료형 ----------

const PHASES = ['PLAN', 'PAUSED', 'REPORT', 'RECRUIT', 'END'];
const PENDINGS = ['PROPOSAL_REVIEW', 'PARTIAL_DELIVERY', 'INSPECTION', null];
const isInt = (v) => Number.isInteger(v);
const isQty = (v) => v !== null && typeof v === 'object' && isInt(v.mattress) && isInt(v.bedding);
const isBoolMap = (v, keys) => v !== null && typeof v === 'object' && keys.every((k) => typeof v[k] === 'boolean');
const isStrings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

function assertView(v, where) {
  const at = (msg) => `${where}: ${msg}`;
  assert.ok(v.fatal === null || (typeof v.fatal === 'object'), at('fatal'));
  assert.ok(isInt(v.month) && v.month >= 1, at('month'));
  assert.ok(PHASES.includes(v.phase), at('phase ' + v.phase));
  assert.ok(PENDINGS.includes(v.pending), at('pending ' + v.pending));
  assert.ok(isInt(v.budget.total) && isInt(v.budget.spent) && v.budget.spent >= 0, at('budget'));

  const p = v.project;
  assert.ok(p.status === undefined || typeof p.status === 'string', at('project.status'));
  assert.ok(isBoolMap(p.checks, ['residents', 'userSpec', 'inventoryCount', 'mattressCondition', 'hintShown']), at('project.checks'));
  assert.ok(isStrings(p.requiredSpecs), at('project.requiredSpecs'));
  assert.ok(p.quantities === null || isQty(p.quantities), at('project.quantities'));
  assert.ok(p.contract === null || (typeof p.contract.supplierName === 'string' && isQty(p.contract.quantities) &&
    isInt(p.contract.amount) && isInt(p.contract.deliveryWeeks)), at('project.contract'));
  assert.ok(isBoolMap(p.event, ['supplierNegotiated', 'requesterConfirmed']), at('project.event'));
  assert.ok(isQty(p.delivered), at('project.delivered'));
  assert.ok(p.inspection === null || (isBoolMap(p.inspection, ['passed', 'quantityPassed', 'specsPassed']) && isStrings(p.inspection.findings)), at('project.inspection'));
  assert.ok(p.supplement === null || (isQty(p.supplement) && isInt(p.supplement.amount) && p.supplement.temp === true), at('project.supplement'));

  const e = v.evaluation;
  assert.ok(e === null || (['quality', 'deadline', 'procedure', 'reason'].every((k) => typeof e[k] === 'string') &&
    ['S', 'A', 'B', 'C', 'D'].includes(e.grade) && typeof e.passed === 'boolean'), at('evaluation'));

  assert.ok(isInt(v.staff.headcount), at('staff.headcount'));
  assert.ok(v.staff.hired === null || typeof v.staff.hired.id === 'string', at('staff.hired'));
  assert.ok(isBoolMap(v.region, ['hallBedded', 'hallLit', 'secondSeat']), at('region'));
  assert.ok(v.meta.candidates === null || (Array.isArray(v.meta.candidates) && v.meta.candidates.every((c) => typeof c.id === 'string')), at('meta.candidates'));
  assert.ok(isStrings(v.meta.seenDialogs) && typeof v.meta.hintsOn === 'boolean', at('meta'));
  assert.ok(Array.isArray(v.reports) && v.reports.every((r) => isInt(r.month) && isStrings(r.lines)), at('reports'));
}

/** 명령마다 view()와 구독자 인자를 검사하며 진행한다. 반환: [명령, events] 목록과 관찰한 phase·pending. */
function play(f, commands) {
  const log = [], phases = new Set(), pendings = new Set();
  let last = null;
  f.subscribe((view, events) => { last = { view, events }; });
  const observe = (where) => { const v = f.view(); assertView(v, where); phases.add(v.phase); pendings.add(v.pending); };
  observe('start');
  for (const [type, payload] of commands) {
    last = null;
    const r = f.dispatch(type, typeof payload === 'function' ? payload(f) : payload);
    assert.equal(r.ok, true, type + ' ' + r.error);
    assert.deepEqual(Object.keys(r).sort(), ['events', 'ok'], type + ': 성공 반환 필드');
    assert.ok(last, type + ': 구독자 호출');
    assert.deepEqual(last.events, r.events, type + ': 구독자 events = 반환 events');
    assertView(last.view, type + ' subscriber view');
    log.push([type, r.events]);
    observe(type);
  }
  return { log, phases, pendings };
}
const firstCandidate = (f) => ({ candidateId: f.view().meta.candidates[0].id });

test('계약: 통과 경로의 명령별 화면 알림 순서와 view() 필드', () => {
  const f = start();
  const { log } = play(f, [
    ['CHECK_RESIDENTS'], ['CHECK_USER_SPEC'], ['CHECK_INVENTORY_COUNT'], ['CHECK_MATTRESS_CONDITION'], ['CONFIRM_QUANTITIES'],
    ['ADVANCE_MONTH'], ['SIGN_CONTRACT'], ['CLOSE_REPORT'], ['ADVANCE_MONTH'],
    ['EVENT_NEGOTIATE_SUPPLIER'], ['EVENT_CONFIRM_REQUESTER'], ['CONFIRM_INSPECTION'], ['CLOSE_REPORT'],
    ['HIRE', firstCandidate], ['SET_HINTS', { on: false }], ['MARK_DIALOG_SEEN', { id: 'contract-test' }]
  ]);
  assert.deepEqual(log, [
    ['CHECK_RESIDENTS', ['RESIDENTS_CHECKED']],
    ['CHECK_USER_SPEC', ['USER_SPEC_CHECKED']],
    ['CHECK_INVENTORY_COUNT', ['INVENTORY_COUNTED']],
    ['CHECK_MATTRESS_CONDITION', ['MATTRESS_CONDITION_CHECKED']],
    ['CONFIRM_QUANTITIES', ['QUANTITIES_CONFIRMED']],
    ['ADVANCE_MONTH', ['MONTH_STARTED', 'PROPOSAL_REVIEW']],
    ['SIGN_CONTRACT', ['CONTRACT_SIGNED', 'MONTH_ENDED']],
    ['CLOSE_REPORT', ['MONTH_PLAN']],
    ['ADVANCE_MONTH', ['MONTH_STARTED', 'PARTIAL_DELIVERY']],
    ['EVENT_NEGOTIATE_SUPPLIER', ['SUPPLIER_NEGOTIATED']],
    ['EVENT_CONFIRM_REQUESTER', ['REQUESTER_CONFIRMED', 'EVENT_RESOLVED', 'INSPECTION_READY']],
    ['CONFIRM_INSPECTION', ['INSPECTION_DONE', 'USE_STARTED', 'MONTH_ENDED', 'EVALUATED']],
    ['CLOSE_REPORT', ['HEADCOUNT_APPROVED', 'RECRUIT_OPENED']],
    ['HIRE', ['HIRED']],
    ['SET_HINTS', ['META_CHANGED']],
    ['MARK_DIALOG_SEEN', ['META_CHANGED']]
  ]);
  const v = f.view();
  assert.equal(v.meta.hintsOn, false);
  assert.ok(v.meta.seenDialogs.includes('contract-test'));
});

test('계약: 힌트·보완 경로와 대응 순서를 바꾼 경로의 화면 알림', () => {
  const f = start();
  const { log } = play(f, [
    ['CHECK_RESIDENTS'], ['CHECK_USER_SPEC'], ['CHECK_INVENTORY_COUNT'], ['CONFIRM_QUANTITIES'], ['CONFIRM_QUANTITIES'],
    ['ADVANCE_MONTH'], ['SIGN_CONTRACT'], ['CLOSE_REPORT'], ['ADVANCE_MONTH'],
    ['EVENT_CONFIRM_REQUESTER'], ['EVENT_NEGOTIATE_SUPPLIER'], ['CONFIRM_INSPECTION']
  ]);
  assert.deepEqual(log.slice(3, 5), [['CONFIRM_QUANTITIES', ['HINT_WET']], ['CONFIRM_QUANTITIES', ['QUANTITIES_CONFIRMED']]]);
  assert.deepEqual(log.slice(9), [
    ['EVENT_CONFIRM_REQUESTER', ['REQUESTER_CONFIRMED']],
    ['EVENT_NEGOTIATE_SUPPLIER', ['SUPPLIER_NEGOTIATED', 'EVENT_RESOLVED', 'INSPECTION_READY']],
    ['CONFIRM_INSPECTION', ['INSPECTION_DONE', 'USE_STARTED', 'MONTH_ENDED', 'EVALUATED']]
  ]);
  assert.notEqual(f.view().project.supplement, null);
});

test('계약: D 미통과 경로는 사용 개시 없이 TUTORIAL_ENDED로 끝나고 phase END', () => {
  const f = start({ balance: D_BALANCE });
  checks(f, true);
  const { log } = play(f, [...TO_INSPECTION.map((c) => [c]), ['CONFIRM_INSPECTION'], ['CLOSE_REPORT']]);
  assert.deepEqual(log.slice(-2), [
    ['CONFIRM_INSPECTION', ['INSPECTION_DONE', 'MONTH_ENDED', 'EVALUATED']],
    ['CLOSE_REPORT', ['TUTORIAL_ENDED']]
  ]);
  assert.equal(f.view().phase, 'END');
  assert.equal(f.view().evaluation.passed, false);
});

test('계약: 화면 알림 전체 목록과 phase·pending 값 범위 (명세 6-3, 6-4)', () => {
  const seen = new Set(), phases = new Set(), pendings = new Set();
  const collect = (r) => { r.log.forEach(([, e]) => e.forEach((x) => seen.add(x))); r.phases.forEach((x) => phases.add(x)); r.pendings.forEach((x) => pendings.add(x)); };

  const pass = new TutorialFlow({ rng: seeded(1) });
  pass.subscribe((_, e) => e.forEach((x) => seen.add(x)));
  pass.newGame();
  collect(play(pass, [
    ['CHECK_RESIDENTS'], ['CHECK_USER_SPEC'], ['CHECK_INVENTORY_COUNT'], ['CONFIRM_QUANTITIES'], ['CHECK_MATTRESS_CONDITION'], ['CONFIRM_QUANTITIES'],
    ...['ADVANCE_MONTH', 'SIGN_CONTRACT', 'CLOSE_REPORT', 'ADVANCE_MONTH', 'EVENT_NEGOTIATE_SUPPLIER', 'EVENT_CONFIRM_REQUESTER', 'CONFIRM_INSPECTION', 'CLOSE_REPORT'].map((c) => [c]),
    ['HIRE', firstCandidate], ['SET_HINTS', { on: true }]
  ]));
  const fail = start({ balance: D_BALANCE });
  checks(fail, true);
  collect(play(fail, [...TO_INSPECTION.map((c) => [c]), ['CONFIRM_INSPECTION'], ['CLOSE_REPORT']]));

  assert.deepEqual([...seen].sort(), [
    'GAME_STARTED', 'RESIDENTS_CHECKED', 'USER_SPEC_CHECKED', 'INVENTORY_COUNTED', 'MATTRESS_CONDITION_CHECKED', 'HINT_WET',
    'QUANTITIES_CONFIRMED', 'MONTH_STARTED', 'PROPOSAL_REVIEW', 'PARTIAL_DELIVERY', 'CONTRACT_SIGNED', 'MONTH_ENDED',
    'SUPPLIER_NEGOTIATED', 'REQUESTER_CONFIRMED', 'EVENT_RESOLVED', 'INSPECTION_READY', 'INSPECTION_DONE', 'USE_STARTED',
    'EVALUATED', 'MONTH_PLAN', 'HEADCOUNT_APPROVED', 'RECRUIT_OPENED', 'TUTORIAL_ENDED', 'HIRED', 'META_CHANGED'
  ].sort());
  assert.deepEqual([...phases].sort(), [...PHASES].sort());
  assert.deepEqual(new Set(pendings), new Set(PENDINGS));
});

test('계약: newGame()은 구독자에 GAME_STARTED와 첫 화면 view를 전달', () => {
  const f = new TutorialFlow({ rng: seeded(1) });
  const calls = [];
  f.subscribe((view, events) => calls.push({ view, events }));
  f.newGame();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].events, ['GAME_STARTED']);
  assertView(calls[0].view, 'newGame');
  assert.equal(calls[0].view.phase, 'PLAN');
  assert.equal(calls[0].view.month, 1);
  assert.equal(calls[0].view.pending, null);
  assert.equal(calls[0].view.project.status, 'REQUESTED');
});

// ---------- 6-3: dispatch 실패 반환 ----------

const ALL_REASONS = new Set([...Object.values(REASON), ...Object.values(FLOW_REASON)]);
/** 실패 반환의 공통 계약: error 문자열, 알려진 reason, 상태·meta 불변, 구독자 호출 없음 */
function expectFailure(f, type, payload, expected) {
  const before = f.state.toJSON(), meta = structuredClone(f.meta), calls = [];
  const off = f.subscribe((_, events) => calls.push(events));
  const r = f.dispatch(type, payload);
  off();
  assert.equal(r.ok, false, type);
  assert.equal(typeof r.error, 'string');
  assert.ok(r.error.length > 0);
  assert.ok(ALL_REASONS.has(r.reason), type + ': 알 수 없는 reason ' + r.reason);
  assert.equal(r.reason, expected.reason, type);
  if (expected.error instanceof RegExp) assert.match(r.error, expected.error);
  else assert.equal(r.error, expected.error, type);
  if (r.reason !== FLOW_REASON.ROLLBACK_FAILED) {
    assert.equal('code' in r, false, type + ': code는 롤백 실패에만');
    assert.deepEqual(f.state.toJSON(), before, type + ': 상태 불변');
    assert.deepEqual(f.meta, meta, type + ': meta 불변');
    assert.deepEqual(calls, [], type + ': 구독자 호출 없음');
  }
  return r;
}

test('계약: FLOW_REASON은 REASON·저장 reason과 이름이 겹치지 않음', () => {
  const flow = Object.values(FLOW_REASON);
  const saveReasons = ['EMPTY', 'CORRUPTED', 'VERSION_MISMATCH', 'STORAGE_UNAVAILABLE', 'READ_FAILED', 'WRITE_FAILED', 'CLEAR_FAILED', 'FATAL'];
  assert.deepEqual(flow.sort(), ['COMMAND_BUSY', 'COMMAND_FAILED', 'ROLLBACK_FAILED', 'UNKNOWN_COMMAND']);
  for (const name of flow) {
    assert.equal(Object.values(REASON).includes(name), false, name);
    assert.equal(saveReasons.includes(name), false, name);
  }
  assert.ok(Object.isFrozen(FLOW_REASON));
});

test('계약: System 실패는 REASON을 그대로 reason으로, 기존 error 문구는 유지', () => {
  const f = start();
  expectFailure(f, 'SIGN_CONTRACT', undefined, { reason: REASON.INVALID_STATE, error: '지금 단계에서 할 수 없습니다' });
  expectFailure(f, 'CONFIRM_QUANTITIES', undefined, { reason: REASON.INVALID_STATE, error: '지금 단계에서 할 수 없습니다' });
  assert.ok(f.dispatch('CHECK_USER_SPEC').ok);
  expectFailure(f, 'CHECK_USER_SPEC', undefined, { reason: REASON.ALREADY_DONE, error: '이미 처리했습니다' });

  const recruit = start(); toInspection(recruit, true);
  assert.ok(recruit.dispatch('CONFIRM_INSPECTION').ok); assert.ok(recruit.dispatch('CLOSE_REPORT').ok);
  expectFailure(recruit, 'HIRE', { candidateId: 'OUTSIDE_POOL' }, { reason: REASON.NOT_FOUND, error: '대상을 찾을 수 없습니다' });
  expectFailure(recruit, 'HIRE', {}, { reason: REASON.NOT_FOUND, error: '대상을 찾을 수 없습니다' });
});

test('계약: 예산 부족 — 계약은 1순위 업체가 없어 NOT_FOUND, 검사 보완은 INSUFFICIENT_BUDGET (현재 동작)', () => {
  // 예산을 넘는 제안은 비교 단계에서 부적격('예산 초과')이 되어 winnerId가 null이다.
  const contract = start(); checks(contract, true); assert.ok(contract.dispatch('ADVANCE_MONTH').ok);
  patchState(contract, (g) => { g.budget = 0; });
  assert.equal(contract.compareSuppliers().winnerId, null);
  expectFailure(contract, 'SIGN_CONTRACT', undefined, { reason: REASON.NOT_FOUND, error: '대상을 찾을 수 없습니다' });

  const inspection = start(); toInspection(inspection, false);
  patchState(inspection, (g) => { g.budget = 17; });
  expectFailure(inspection, 'CONFIRM_INSPECTION', undefined, { reason: REASON.INSUFFICIENT_BUDGET, error: '집행 가능액이 부족합니다' });
  assert.equal(inspection.view().pending, 'INSPECTION');
});

test('계약: 예산 부족으로 실패한 계약은 저장되지 않고, 예산 복구 후 재시도하면 한 번만 계약·차감', () => {
  const f = start(); checks(f, true); assert.ok(f.dispatch('ADVANCE_MONTH').ok);
  const { rows, winnerId } = f.compareSuppliers();
  const price = rows.find((r) => r.id === winnerId).price;
  // 자동 저장 연결: 실패한 명령은 기록을 바꾸지 않아야 한다.
  const data = new Map();
  const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); } };
  new TYCOON.core.BrowserSave({ storage }).attach(f);

  patchState(f, (g) => { g.budget = 0; });
  assert.ok(f.dispatch('SET_HINTS', { on: true }).ok, '주입 상태를 저장 기록에 반영');
  const saved = data.get(TYCOON.core.AUTOSAVE_KEY);
  const events = recordStateEvents(f);
  expectFailure(f, 'SIGN_CONTRACT', undefined, { reason: REASON.NOT_FOUND, error: '대상을 찾을 수 없습니다' });
  assert.deepEqual(events, [], '실패한 계약은 상태·결과 이벤트를 전달하지 않음');
  assert.equal(data.get(TYCOON.core.AUTOSAVE_KEY), saved, '실패한 계약은 자동 저장하지 않음');

  patchState(f, (g) => { g.budget = 300; });
  const calls = []; f.subscribe((_, e) => calls.push(e));
  const r = f.dispatch('SIGN_CONTRACT');
  assert.deepEqual(r, { ok: true, events: ['CONTRACT_SIGNED', 'MONTH_ENDED'] });
  assert.deepEqual(calls, [['CONTRACT_SIGNED', 'MONTH_ENDED']]);
  const contract = f.state.getContract();
  assert.equal(contract.supplierId, winnerId);
  assert.equal(contract.amount, price);
  assert.equal(f.state.getBudget(), 300 - price, '계약금은 한 번만 차감');
  assert.equal(f.state.getProjectStatus(), 'CONTRACTED');
  const v = f.view();
  assert.equal(v.month, 1); assert.equal(v.phase, 'REPORT'); assert.equal(v.pending, null, '계약 후 1월차 월말 보고로 진행');
  assert.equal(v.budget.spent, price);
  assert.equal(events.filter(([name]) => name === RESULT_EVENTS.CONTRACT_CREATED).length, 1);
  assert.equal(events.some(([name]) => name === RESULT_EVENTS.CONTRACT_REJECTED), false);
  assert.deepEqual(JSON.parse(data.get(TYCOON.core.AUTOSAVE_KEY)).gameState, f.state.toJSON(), '성공한 재시도는 저장됨');
});

test('계약: 화면 명령 SIGN_CONTRACT는 업체 ID를 받지 않고 항상 비교 1순위와 계약', () => {
  // 공개 화면 API로는 업체 ID를 전달할 수 없으므로 '존재하지 않는 업체 ID' 실패는 dispatch 경로에서 만들 수 없다.
  const f = start(); checks(f, true); assert.ok(f.dispatch('ADVANCE_MONTH').ok);
  const { winnerId } = f.compareSuppliers();
  assert.ok(f.dispatch('SIGN_CONTRACT', { supplierId: 'NO_SUCH_SUPPLIER' }).ok);
  assert.equal(f.state.getContract().supplierId, winnerId);
});

test('계약: 정식 검사 미통과는 INSPECTION_FAILED와 검사 소견 문구', () => {
  const f = start(); toInspection(f, true);
  patchState(f, (g) => { g.contract.specs = []; });
  expectFailure(f, 'CONFIRM_INSPECTION', undefined, { reason: REASON.INSPECTION_FAILED, error: /필수 규격/ });
  const v = f.view();
  assert.equal(v.pending, 'INSPECTION');
  assert.equal(v.project.status, 'INSPECTING');
  assert.equal(v.project.inspection, null);
  assert.equal(v.evaluation, null);
});

// ---------- F-11 검사 실패 사유 분류·재시도·저장 복원 ----------
// 규격 미충족(INSPECTION_FAILED)과 보완 비용 부족(INSUFFICIENT_BUDGET)의 사유 분류는 위 두 테스트가 검증한다.

function memoryStorage() {
  const data = new Map();
  return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); } };
}
/** 검사 실패를 만드는 주입. withCondition은 매트 점검 여부(false면 보완 18만원 경로). */
const INSPECTION_FAILURES = {
  specs: { withCondition: true, inject: (g) => { g.contract.specs = []; }, reason: REASON.INSPECTION_FAILED, error: /필수 규격/, grade: 'S', supplement: 0 },
  budget: { withCondition: false, inject: (g) => { g.budget = 17; }, reason: REASON.INSUFFICIENT_BUDGET, error: '집행 가능액이 부족합니다', grade: 'C', supplement: 18 }
};

test('F-11 검사 판정이 아닌 실패는 INSPECTION_FAILED가 아니라 원래 사유(INVALID_STATE)로 반환', () => {
  // 사업 단계 불일치: 진행 대기는 검사지만 사업이 INSPECTING이 아님
  const stage = start(); toInspection(stage, true);
  patchState(stage, (g) => { g.currentProject.status = 'DELIVERING'; });
  expectFailure(stage, 'CONFIRM_INSPECTION', undefined, { reason: REASON.INVALID_STATE, error: '지금 단계에서 할 수 없습니다' });
  assert.equal(stage.view().pending, 'INSPECTION');

  // 보완 단가 정보 없음: 점검 생략 경로라 보완이 필요하지만 업체 단가가 없음
  const price = start(); toInspection(price, false);
  patchState(price, (g) => { g.suppliers = g.suppliers.map((s) => ({ ...s, unitPrice: undefined })); });
  expectFailure(price, 'CONFIRM_INSPECTION', undefined, { reason: REASON.INVALID_STATE, error: '지금 단계에서 할 수 없습니다' });
  assert.equal(price.view().project.status, 'INSPECTING');
  assert.equal(price.view().project.inspection, null);
});

for (const [kind, c] of Object.entries(INSPECTION_FAILURES)) {
  test(`F-11 검사 실패(${kind}) 후 원인을 복구하면 같은 명령으로 재시도 성공, 차감·평가·시설 개선·저장은 한 번`, () => {
    const f = start(); toInspection(f, c.withCondition);
    const budget = f.state.getBudget(), contract = f.state.getContract();
    const storage = memoryStorage();
    new TYCOON.core.BrowserSave({ storage }).attach(f);
    patchState(f, c.inject);
    assert.ok(f.dispatch('SET_HINTS', { on: true }).ok, '주입 상태를 저장 기록에 반영');
    const saved = storage.data.get(TYCOON.core.AUTOSAVE_KEY);
    const events = recordStateEvents(f);

    expectFailure(f, 'CONFIRM_INSPECTION', undefined, c); // GameState·meta 보존, 구독자 알림 없음
    assert.deepEqual(events, [], '실패한 검사는 상태·결과 이벤트를 외부로 전달하지 않음');
    assert.equal(storage.data.get(TYCOON.core.AUTOSAVE_KEY), saved, '실패한 검사는 자동 저장하지 않음');

    patchState(f, (g) => { g.contract.specs = contract.specs; g.budget = budget; });
    const calls = []; f.subscribe((_, e) => calls.push(e));
    const r = f.dispatch('CONFIRM_INSPECTION');
    assert.deepEqual(r, { ok: true, events: ['INSPECTION_DONE', 'USE_STARTED', 'MONTH_ENDED', 'EVALUATED'] });
    assert.deepEqual(calls, [r.events]);
    assert.equal(f.state.getBudget(), budget - c.supplement, '보완 비용은 한 번만 차감');
    const d = f.state.getDelivery();
    assert.equal(d.supplement ? d.supplement.amount : 0, c.supplement);
    assert.equal(d.inspection.passed, true);
    assert.equal(f.state.getEvaluation().grade, c.grade);
    const count = (name) => events.filter(([n]) => n === name).length;
    assert.equal(count(RESULT_EVENTS.INSPECTION_COMPLETED), 1);
    assert.equal(events.find(([n]) => n === RESULT_EVENTS.INSPECTION_COMPLETED)[1].passed, true);
    assert.equal(count(RESULT_EVENTS.GRADE_CALCULATED), 1);
    assert.equal(count(RESULT_EVENTS.FACILITY_IMPROVED), 1);
    const record = JSON.parse(storage.data.get(TYCOON.core.AUTOSAVE_KEY));
    assert.deepEqual(record.gameState, f.state.toJSON(), '성공한 재시도는 저장됨');
    assert.deepEqual(record.meta, f.meta);
    expectFailure(f, 'CONFIRM_INSPECTION', undefined, { reason: REASON.INVALID_STATE, error: '지금 단계에서 할 수 없습니다' });
  });

  test(`F-11 검사 실패(${kind}) 후 새로고침하면 마지막 정상 저장(검사 대기)으로 복원되고 재시도 가능`, () => {
    const f = start(); toInspection(f, c.withCondition);
    const budget = f.state.getBudget();
    const storage = memoryStorage();
    new TYCOON.core.BrowserSave({ storage }).attach(f);
    assert.ok(f.dispatch('SET_HINTS', { on: true }).ok, '검사 대기 상태를 정상 저장');
    const saved = storage.data.get(TYCOON.core.AUTOSAVE_KEY);
    patchState(f, c.inject); // 저장하지 않은 주입: 저장 기록은 정상 검사 대기 상태
    expectFailure(f, 'CONFIRM_INSPECTION', undefined, c);
    assert.equal(storage.data.get(TYCOON.core.AUTOSAVE_KEY), saved);

    const resumed = new TutorialFlow({ rng: seeded(1) });
    const save = new TYCOON.core.BrowserSave({ storage });
    assert.deepEqual(save.restore(resumed), { ok: true });
    const record = JSON.parse(saved);
    assert.deepEqual(resumed.state.toJSON(), record.gameState);
    assert.deepEqual(resumed.meta, record.meta);
    const v = resumed.view();
    assert.equal(v.pending, 'INSPECTION');
    assert.equal(v.project.status, 'INSPECTING');
    assert.equal(v.project.inspection, null);
    assert.equal(v.evaluation, null);
    assert.equal(storage.data.get(TYCOON.core.AUTOSAVE_KEY), saved, '복원은 저장 기록을 바꾸지 않음');

    save.attach(resumed);
    assert.ok(resumed.dispatch('CONFIRM_INSPECTION').ok);
    assert.equal(resumed.state.getBudget(), budget - c.supplement);
    assert.equal(resumed.state.getEvaluation().grade, c.grade);
    assert.deepEqual(JSON.parse(storage.data.get(TYCOON.core.AUTOSAVE_KEY)).gameState, resumed.state.toJSON());
  });
}

test('계약: System 밖 실패는 FLOW_REASON (알 수 없는 명령, 처리 중 재호출, 예외, reason 없는 실패)', () => {
  const f = start();
  expectFailure(f, 'NO_SUCH_COMMAND', undefined, { reason: FLOW_REASON.UNKNOWN_COMMAND, error: '알 수 없는 명령: NO_SUCH_COMMAND' });

  const original = f.procurement.checkResidents.bind(f.procurement);
  let inner = null;
  f.procurement.checkResidents = () => { inner = f.dispatch('CHECK_USER_SPEC'); return original(); };
  assert.equal(f.dispatch('CHECK_RESIDENTS').ok, true);
  assert.deepEqual(inner, { ok: false, error: '이전 명령을 처리하는 중입니다', reason: FLOW_REASON.COMMAND_BUSY });
  assert.equal(f.view().project.checks.userSpec, false);

  const thrower = start();
  thrower.procurement.checkResidents = () => { thrower.state.spendBudget(1); throw new Error('계약 테스트 예외'); };
  expectFailure(thrower, 'CHECK_RESIDENTS', undefined, { reason: FLOW_REASON.COMMAND_FAILED, error: '계약 테스트 예외' });

  const silent = start();
  silent.procurement.checkResidents = () => ({ ok: false });
  expectFailure(silent, 'CHECK_RESIDENTS', undefined, { reason: FLOW_REASON.COMMAND_FAILED, error: '명령 실패' });
});

test('계약: 롤백 실패와 fatal 중 명령은 code·reason 모두 ROLLBACK_FAILED, 구독자에 [] 1회', () => {
  const f = start();
  const calls = [];
  f.subscribe((view, events) => calls.push({ fatal: view.fatal, events }));
  const original = console.error; console.error = () => {};
  try {
    f.procurement.checkResidents = () => { f.state.spendBudget(1); return TYCOON.core.fail(REASON.INVALID_STATE); };
    f.state.load = () => { throw new Error('restore failed'); };
    const expected = { ok: false, error: '복구 불가능 오류: 새 게임을 시작해 주세요', code: 'ROLLBACK_FAILED', reason: FLOW_REASON.ROLLBACK_FAILED };
    assert.deepEqual(f.dispatch('CHECK_RESIDENTS'), expected);
    assert.deepEqual(f.dispatch('CHECK_USER_SPEC'), expected);
    assert.deepEqual(f.dispatch('NO_SUCH_COMMAND'), expected);
  } finally { console.error = original; }
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].events, []);
  assert.notEqual(calls[0].fatal, null);
  assertView(f.view(), 'fatal');
});

// ---------- 5-2: 실패 이벤트 정책 (System 직접 호출과 dispatch 경로 비교) ----------

test('정책: CONTRACT_REJECTED는 System 직접 호출에서만 발생하고 dispatch 경로에서는 발생·전달되지 않음', () => {
  const direct = start(); checks(direct, true); assert.ok(direct.dispatch('ADVANCE_MONTH').ok);
  patchState(direct, (g) => { g.budget = 0; });
  const directEvents = recordStateEvents(direct);
  assert.equal(direct.procurement.createContract('S1').reason, REASON.INSUFFICIENT_BUDGET);
  assert.deepEqual(directEvents, [[RESULT_EVENTS.CONTRACT_REJECTED, { supplierId: 'S1', reason: REASON.INSUFFICIENT_BUDGET }]]);

  const viaFlow = start(); checks(viaFlow, true); assert.ok(viaFlow.dispatch('ADVANCE_MONTH').ok);
  patchState(viaFlow, (g) => { g.budget = 0; });
  const flowEvents = recordStateEvents(viaFlow);
  const calls = []; viaFlow.subscribe((_, e) => calls.push(e));
  // SIGN_CONTRACT는 비교 1순위(winnerId)로만 계약하므로 예산 초과 업체로 createContract에 도달하지 않는다.
  let rejectedBeforeRollback = 0;
  const createContract = viaFlow.procurement.createContract.bind(viaFlow.procurement);
  viaFlow.procurement.createContract = (id) => { const r = createContract(id); if (r.reason === REASON.INSUFFICIENT_BUDGET) rejectedBeforeRollback++; return r; };
  const r = viaFlow.dispatch('SIGN_CONTRACT');
  assert.equal(r.reason, REASON.NOT_FOUND);
  assert.equal(rejectedBeforeRollback, 0);
  assert.deepEqual(flowEvents, [], '실패한 명령은 상태·결과 이벤트 모두 전달 안 됨');
  assert.deepEqual(calls, []);
});

test('정책: 검사 미통과 INSPECTION_COMPLETED는 System 직접 호출에서만 발생하고 dispatch 경로에서는 전달되지 않음', () => {
  const direct = start(); toInspection(direct, true);
  patchState(direct, (g) => { g.contract.specs = []; });
  const directEvents = recordStateEvents(direct);
  const result = direct.delivery.inspect();
  assert.equal(result.ok, false); assert.equal(result.reason, REASON.NOT_ELIGIBLE);
  const inspected = directEvents.filter(([name]) => name === RESULT_EVENTS.INSPECTION_COMPLETED);
  assert.equal(inspected.length, 1);
  assert.equal(inspected[0][1].passed, false);

  const viaFlow = start(); toInspection(viaFlow, true);
  patchState(viaFlow, (g) => { g.contract.specs = []; });
  const flowEvents = recordStateEvents(viaFlow);
  assert.equal(viaFlow.dispatch('CONFIRM_INSPECTION').reason, REASON.INSPECTION_FAILED);
  assert.deepEqual(flowEvents, []);
});

test('정책: 성공한 명령의 결과 이벤트는 커밋 후 payload와 함께 전달됨', () => {
  const f = start(); checks(f, true);
  const events = recordStateEvents(f);
  const results = () => events.filter(([name]) => Object.values(RESULT_EVENTS).includes(name));
  const keysOf = (name) => results().filter(([n]) => n === name).map(([, p]) => Object.keys(p).sort());

  assert.ok(f.dispatch('ADVANCE_MONTH').ok);
  assert.deepEqual(keysOf(RESULT_EVENTS.TIME_ADVANCED), [['date']]);
  assert.ok(f.dispatch('SIGN_CONTRACT').ok);
  assert.deepEqual(keysOf(RESULT_EVENTS.CONTRACT_CREATED), [['amount', 'contractId', 'supplierId']]);
  for (const c of ['CLOSE_REPORT', 'ADVANCE_MONTH', 'EVENT_NEGOTIATE_SUPPLIER', 'EVENT_CONFIRM_REQUESTER']) assert.ok(f.dispatch(c).ok, c);
  assert.deepEqual(keysOf(RESULT_EVENTS.DELIVERY_ARRIVED), [['contractId']]);
  assert.ok(keysOf(RESULT_EVENTS.DELIVERY_ISSUE_FOUND).every((k) => k.join() === 'issue'));
  assert.ok(keysOf(RESULT_EVENTS.DELIVERY_ISSUE_RESOLVED).length >= 1);
  assert.ok(f.dispatch('CONFIRM_INSPECTION').ok);
  const inspected = results().filter(([n]) => n === RESULT_EVENTS.INSPECTION_COMPLETED).map(([, p]) => p);
  assert.equal(inspected.length, 1); assert.equal(inspected[0].passed, true); assert.ok(Array.isArray(inspected[0].findings));
  assert.deepEqual(keysOf(RESULT_EVENTS.GRADE_CALCULATED), [['grade', 'reason']]);
  assert.deepEqual(keysOf(RESULT_EVENTS.FACILITY_IMPROVED), [['facilityId', 'stage']]);
  assert.ok(f.dispatch('CLOSE_REPORT').ok);
  assert.deepEqual(keysOf(RESULT_EVENTS.HEADCOUNT_APPROVED), [['headcount']]);
  assert.ok(f.dispatch('HIRE', firstCandidate(f)).ok);
  assert.deepEqual(keysOf(RESULT_EVENTS.CANDIDATE_HIRED), [['candidateId']]);
  assert.equal(results().some(([n]) => n === RESULT_EVENTS.CONTRACT_REJECTED || n === RESULT_EVENTS.TUTORIAL_STEP), false);
});
