/** F-18 browser autosave envelope and flow integration tests. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYCOON } from './load.mjs';

const { BrowserSave, AUTOSAVE_KEY } = TYCOON.core;
const { TutorialFlow } = TYCOON.systems;

function memoryStorage(seed) {
  const data = new Map(seed ? [[AUTOSAVE_KEY, seed]] : []);
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    peek(key = AUTOSAVE_KEY) { return data.get(key) ?? null; }
  };
}

test('F-18 autosave: successful flow commands persist GameState and meta; restore round trips', () => {
  const storage = memoryStorage();
  const flow = new TutorialFlow();
  const save = new BrowserSave({ storage });
  save.attach(flow);
  flow.newGame();
  assert.equal(save.lastResult.ok, true);
  assert.equal(flow.dispatch('CHECK_RESIDENTS').ok, true);
  flow.meta.seenDialogs.push('intro');
  flow.meta.hintsOn = false;
  assert.equal(save.save(flow).ok, true);
  const record = JSON.parse(storage.peek());
  assert.equal(record.version, 1);
  assert.deepEqual(record.gameState, flow.state.toJSON());
  assert.deepEqual(record.meta, flow.meta);

  const resumed = new TutorialFlow();
  const resumeSave = new BrowserSave({ storage });
  assert.deepEqual(resumeSave.restore(resumed), { ok: true });
  assert.deepEqual(resumed.state.toJSON(), flow.state.toJSON());
  assert.deepEqual(resumed.meta, flow.meta);
});

test('F-18 auto-save restores the same F-14 candidates and hired colleague', () => {
  const storage = memoryStorage();
  const flow = new TutorialFlow();
  const save = new BrowserSave({ storage });
  save.attach(flow);
  flow.newGame();
  const dispatch = (command, payload) => {
    const result = flow.dispatch(command, payload);
    assert.equal(result.ok, true, command);
    return result;
  };
  for (const command of ['CHECK_RESIDENTS', 'CHECK_USER_SPEC', 'CHECK_INVENTORY_COUNT', 'CHECK_MATTRESS_CONDITION', 'CONFIRM_QUANTITIES', 'ADVANCE_MONTH', 'SIGN_CONTRACT', 'CLOSE_REPORT', 'ADVANCE_MONTH', 'EVENT_NEGOTIATE_SUPPLIER', 'EVENT_CONFIRM_REQUESTER', 'CONFIRM_INSPECTION', 'CLOSE_REPORT']) dispatch(command);

  const candidates = flow.state.getCandidates();
  assert.equal(candidates.length, 3);
  const resumedCandidates = new TutorialFlow();
  assert.deepEqual(new BrowserSave({ storage }).restore(resumedCandidates), { ok: true });
  assert.deepEqual(resumedCandidates.state.getCandidates(), candidates);
  assert.deepEqual(resumedCandidates.state.getStaff(), flow.state.getStaff());

  dispatch('HIRE', { candidateId: candidates[0].id });
  const hired = flow.state.getStaff();
  const resumedHire = new TutorialFlow();
  assert.deepEqual(new BrowserSave({ storage }).restore(resumedHire), { ok: true });
  assert.deepEqual(resumedHire.state.getCandidates(), candidates);
  assert.deepEqual(resumedHire.state.getStaff(), hired);
  assert.deepEqual(resumedHire.state.getStaff().hired, [candidates[0]]);
});

test('F-18 월중·월말 명령은 현재 진행 상태와 계약 예산을 중복 없이 저장한다', () => {
  const storage = memoryStorage();
  const flow = new TutorialFlow();
  const save = new BrowserSave({ storage });
  save.attach(flow);
  flow.newGame();
  const dispatch = (command) => {
    const result = flow.dispatch(command);
    assert.equal(result.ok, true, command);
    const record = JSON.parse(storage.peek());
    assert.deepEqual(record.gameState, flow.state.toJSON(), command + ' saved GameState');
    assert.deepEqual(record.meta, flow.meta, command + ' saved TutorialFlow meta');
    return result;
  };

  for (const command of ['CHECK_RESIDENTS', 'CHECK_USER_SPEC', 'CHECK_INVENTORY_COUNT', 'CHECK_MATTRESS_CONDITION', 'CONFIRM_QUANTITIES', 'ADVANCE_MONTH', 'SIGN_CONTRACT']) dispatch(command);
  assert.deepEqual(flow.state.getCurrentDate(), { month: 1, phase: 'REPORT', pending: null });
  const contract = flow.state.getContract();
  const remaining = flow.state.getBudget();
  assert.ok(contract);

  dispatch('CLOSE_REPORT');
  assert.deepEqual(flow.state.getCurrentDate(), { month: 2, phase: 'PLAN', pending: null });
  dispatch('ADVANCE_MONTH');
  assert.deepEqual(flow.state.getCurrentDate(), { month: 2, phase: 'RUN', pending: 'PARTIAL_DELIVERY' });

  const resumed = new TutorialFlow();
  const restoredSave = new BrowserSave({ storage });
  assert.deepEqual(restoredSave.restore(resumed), { ok: true });
  const once = resumed.state.toJSON();
  assert.deepEqual(resumed.state.getCurrentDate(), flow.state.getCurrentDate());
  assert.deepEqual(resumed.state.getContract(), contract);
  assert.equal(resumed.state.getBudget(), remaining);
  assert.equal(restoredSave.restore(resumed).ok, true);
  assert.deepEqual(resumed.state.toJSON(), once);
});

test('F-18 누락된 필수 저장 필드는 손상으로 폐기하고 현재 진행을 보존한다', () => {
  const valid = {
    version: 1,
    gameState: new TutorialFlow().state.toJSON(),
    meta: { hintsOn: true, seenDialogs: [] }
  };
  const cases = [
    { ...valid, gameState: { ...valid.gameState, gameState: { ...valid.gameState.gameState, suppliers: undefined } } },
    { ...valid, gameState: { ...valid.gameState, gameState: { ...valid.gameState.gameState, currentDate: undefined } } },
    { ...valid, meta: { hintsOn: true } },
    { ...valid, meta: { hintsOn: true, seenDialogs: ['intro', 'intro'] } }
  ];
  for (const record of cases) {
    const storage = memoryStorage(JSON.stringify(record));
    const flow = new TutorialFlow();
    flow.newGame(); flow.dispatch('CHECK_RESIDENTS');
    const before = flow.state.toJSON(), beforeMeta = structuredClone(flow.meta);
    const result = new BrowserSave({ storage }).restore(flow);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'CORRUPTED');
    assert.deepEqual(flow.state.toJSON(), before);
    assert.deepEqual(flow.meta, beforeMeta);
    assert.equal(storage.peek(), null);
  }
});

test('F-18 restore without a record leaves a fresh flow unchanged', () => {
  const storage = memoryStorage();
  const flow = new TutorialFlow();
  const before = flow.state.toJSON();
  const result = new BrowserSave({ storage }).restore(flow);
  assert.deepEqual(result, { ok: false, reason: 'EMPTY' });
  assert.deepEqual(flow.state.toJSON(), before);
  assert.equal(storage.peek(), null);
});

test('F-18 failed commands and fatal state do not overwrite the last valid save', () => {
  const storage = memoryStorage();
  const flow = new TutorialFlow();
  const save = new BrowserSave({ storage });
  save.attach(flow);
  flow.newGame();
  assert.equal(flow.dispatch('CHECK_RESIDENTS').ok, true);
  const lastGood = storage.peek();
  assert.equal(flow.dispatch('SIGN_CONTRACT').ok, false);
  assert.equal(storage.peek(), lastGood);
  flow.fatal = { originalError: 'forced', recoveryError: 'forced' };
  assert.deepEqual(save.save(flow), { ok: false, reason: 'FATAL' });
  assert.equal(storage.peek(), lastGood);

  let listener;
  const fatalFlow = { fatal: null, subscribe(fn) { listener = fn; return () => {}; } };
  const attached = new BrowserSave({ storage });
  attached.attach(fatalFlow);
  fatalFlow.fatal = { originalError: 'forced' };
  listener({}, []);
  assert.equal(storage.peek(), lastGood);
});

test('F-18 malformed data and invalid meta are discarded without changing live state', () => {
  for (const raw of [
    '{broken',
    JSON.stringify({ version: 1, gameState: { version: 1, gameState: { budget: -1 } }, meta: { hintsOn: true, seenDialogs: [] } }),
    JSON.stringify({ version: 1, gameState: { version: 1, gameState: {} }, meta: { hintsOn: 'yes', seenDialogs: [] } })
  ]) {
    const storage = memoryStorage(raw);
    const flow = new TutorialFlow();
    flow.newGame();
    flow.dispatch('CHECK_RESIDENTS');
    flow.meta.hintsOn = false;
    const beforeState = flow.state.toJSON(), beforeMeta = structuredClone(flow.meta);
    const result = new BrowserSave({ storage }).restore(flow);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'CORRUPTED');
    assert.deepEqual(flow.state.toJSON(), beforeState);
    assert.deepEqual(flow.meta, beforeMeta);
    assert.equal(storage.peek(), null);
  }
});

test('F-18 incompatible storage version is cleared without migration', () => {
  const storage = memoryStorage(JSON.stringify({ version: 999, gameState: {}, meta: {} }));
  const flow = new TutorialFlow();
  flow.newGame();
  const before = flow.state.toJSON();
  assert.equal(new BrowserSave({ storage }).restore(flow).reason, 'VERSION_MISMATCH');
  assert.deepEqual(flow.state.toJSON(), before);
  assert.equal(storage.peek(), null);
});

test('F-18 storage exceptions do not interrupt game progress', () => {
  const blockedStorage = {
    getItem() { throw new Error('read denied'); },
    setItem() { throw new Error('write denied'); },
    removeItem() { throw new Error('clear denied'); }
  };
  const flow = new TutorialFlow();
  const save = new BrowserSave({ storage: blockedStorage });
  assert.equal(save.restore(flow).reason, 'READ_FAILED');
  save.attach(flow);
  assert.doesNotThrow(() => flow.newGame());
  assert.equal(save.lastResult.ok, false);
  assert.equal(save.lastResult.reason, 'WRITE_FAILED');
  assert.equal(flow.dispatch('CHECK_RESIDENTS').ok, true);
  assert.equal(save.lastResult.reason, 'WRITE_FAILED');
});

test('F-18 저장 실패는 UI 상태로 알리고 다음 명령에서 저장을 회복한다', () => {
  let writable = false;
  const data = new Map();
  const storage = {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { if (!writable) throw new Error('temporary write failure'); data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
  const flow = new TutorialFlow();
  const save = new BrowserSave({ storage });
  const statuses = [];
  save.attach(flow, (status) => statuses.push(status));
  flow.newGame();
  assert.equal(flow.dispatch('CHECK_RESIDENTS').ok, true);
  assert.equal(save.lastResult.ok, false);
  assert.equal(save.lastResult.reason, 'WRITE_FAILED');
  assert.equal(flow.view().project.checks.residents, true);
  writable = true;
  assert.equal(flow.dispatch('CHECK_USER_SPEC').ok, true);
  assert.equal(save.lastResult.ok, true);
  assert.equal(JSON.parse(data.get(AUTOSAVE_KEY)).gameState.gameState.currentProject.review.userSpec, true);
  assert.ok(statuses.some((status) => status.reason === 'WRITE_FAILED'));
  assert.equal(statuses.at(-1).ok, true);
});

test('F-18 new game replaces old single-slot progress with fresh state', () => {
  const storage = memoryStorage();
  const flow = new TutorialFlow();
  const save = new BrowserSave({ storage });
  save.attach(flow);
  flow.newGame();
  flow.dispatch('CHECK_RESIDENTS');
  const oldRecord = storage.peek();
  flow.newGame();
  assert.notEqual(storage.peek(), oldRecord);
  const record = JSON.parse(storage.peek());
  assert.deepEqual(record.gameState, flow.state.toJSON());
  assert.equal(record.meta.seenDialogs.length, 0);
});

// ---------- F-18 최종 안정화: 안내 ID 검증, 저장 횟수, 실패 명령, 저장 데이터 예외, 중간 복원 후 완주 ----------

const { REASON, FLOW_REASON, EVENTS, RESULT_EVENTS } = TYCOON.core;
/** 쓰기·삭제 횟수를 세는 메모리 저장소 */
function countingStorage(seed) {
  const base = memoryStorage();
  if (seed !== undefined) base.setItem(AUTOSAVE_KEY, seed); // 빈 문자열 기록도 그대로 둔다
  const s = {
    writes: 0, removes: 0, peek: base.peek,
    getItem: (k) => base.getItem(k),
    setItem(k, v) { s.writes++; base.setItem(k, v); },
    removeItem(k) { s.removes++; base.removeItem(k); }
  };
  return s;
}
const FULL_PATH = (withCondition) => [
  'CHECK_RESIDENTS', 'CHECK_USER_SPEC', 'CHECK_INVENTORY_COUNT', ...(withCondition ? ['CHECK_MATTRESS_CONDITION'] : []),
  'CONFIRM_QUANTITIES', ...(withCondition ? [] : ['CONFIRM_QUANTITIES']), // 점검 생략·힌트 켜짐이면 HINT_WET 뒤 한 번 더
  'ADVANCE_MONTH', 'SIGN_CONTRACT', 'CLOSE_REPORT', 'ADVANCE_MONTH', 'EVENT_NEGOTIATE_SUPPLIER', 'EVENT_CONFIRM_REQUESTER',
  'CONFIRM_INSPECTION', 'CLOSE_REPORT', 'HIRE'
];
const payloadOf = (flow, command) => (command === 'HIRE' ? { candidateId: flow.state.getCandidates()[0].id } : undefined);
function play(flow, commands) {
  for (const command of commands) assert.equal(flow.dispatch(command, payloadOf(flow, command)).ok, true, command);
}
function savedFlow(storage) {
  const flow = new TutorialFlow({ rng: () => 0.5 });
  const save = new BrowserSave({ storage });
  save.attach(flow);
  flow.newGame();
  return { flow, save };
}
/** 실패 명령 뒤 상태·meta·GameState 이벤트·구독자·저장 기록이 그대로인지 확인한다. */
function assertFailureKeepsEverything(flow, storage, act, label) {
  const before = flow.state.toJSON(), meta = structuredClone(flow.meta), record = storage.peek(), writes = storage.writes;
  const events = [], calls = [];
  const offs = [...Object.values(EVENTS), ...Object.values(RESULT_EVENTS)].map((name) => flow.state.on(name, () => events.push(name)));
  const off = flow.subscribe((_, e) => calls.push(e));
  const result = act();
  offs.forEach((o) => o()); off();
  assert.equal(result.ok, false, label);
  assert.deepEqual(flow.state.toJSON(), before, label + ': GameState 불변');
  assert.deepEqual(flow.meta, meta, label + ': meta 불변');
  assert.deepEqual(events, [], label + ': 상태·결과 이벤트 없음');
  assert.deepEqual(calls, [], label + ': 구독자 호출 없음');
  assert.equal(storage.writes - writes, 0, label + ': 저장 0회');
  assert.equal(storage.peek(), record, label + ': 저장 기록 불변');
  return result;
}

test('F-18 MARK_DIALOG_SEEN은 비어 있지 않은 문자열 ID만 기록하고, 잘못된 ID는 실패·저장 없음', () => {
  const storage = countingStorage();
  const { flow } = savedFlow(storage);
  assert.equal(flow.dispatch('CHECK_RESIDENTS').ok, true);
  for (const [label, payload] of [['누락', {}], ['null', { id: null }], ['숫자', { id: 5 }], ['객체', { id: { id: 'intro' } }], ['배열', { id: ['intro'] }], ['빈 문자열', { id: '' }]]) {
    const r = assertFailureKeepsEverything(flow, storage, () => flow.dispatch('MARK_DIALOG_SEEN', payload), 'MARK_DIALOG_SEEN ' + label);
    assert.equal(r.reason, REASON.NOT_FOUND, label);
    assert.equal(r.error, '대상을 찾을 수 없습니다', label);
  }
  assert.deepEqual(flow.meta.seenDialogs, []);

  const writes = storage.writes;
  assert.deepEqual(flow.dispatch('MARK_DIALOG_SEEN', { id: 'intro' }), { ok: true, events: ['META_CHANGED'] });
  assert.deepEqual(flow.dispatch('MARK_DIALOG_SEEN', { id: 'intro' }), { ok: true, events: ['META_CHANGED'] }, '이미 본 안내는 변경 없이 성공');
  assert.deepEqual(flow.meta.seenDialogs, ['intro']);
  assert.equal(storage.writes - writes, 2);
  const resumed = new TutorialFlow();
  assert.deepEqual(new BrowserSave({ storage }).restore(resumed), { ok: true }, '정상 ID 저장은 다시 복원됨');
  assert.deepEqual(resumed.meta.seenDialogs, ['intro']);
});

test('F-18 저장 횟수: 새 게임은 기록 교체, 성공한 공개 명령마다 1회(여러 시스템이 실행돼도 1회), 실패 명령은 0회', () => {
  for (const withCondition of [true, false]) {
    const storage = countingStorage(JSON.stringify({ version: 1, gameState: {}, meta: {} }));
    const flow = new TutorialFlow({ rng: () => 0.5 });
    new BrowserSave({ storage }).attach(flow);
    flow.newGame();
    assert.equal(storage.removes, 1, '새 게임은 기존 기록 삭제');
    assert.equal(storage.writes, 1, '새 게임 상태 1회 기록');
    assert.deepEqual(JSON.parse(storage.peek()).gameState, flow.state.toJSON());

    const results = [];
    for (const name of Object.values(RESULT_EVENTS)) flow.state.on(name, () => results.push(name));
    for (const command of FULL_PATH(withCondition)) {
      const writes = storage.writes; results.length = 0;
      assert.equal(flow.dispatch(command, payloadOf(flow, command)).ok, true, command);
      assert.equal(storage.writes - writes, 1, command + ': 저장 1회');
      const record = JSON.parse(storage.peek());
      assert.deepEqual(record.gameState, flow.state.toJSON(), command + ': 저장 내용 = 현재 상태');
      assert.deepEqual(record.meta, flow.meta, command + ': 저장 meta = 현재 meta');
      if (command === 'CONFIRM_INSPECTION') {
        assert.deepEqual(results, [RESULT_EVENTS.INSPECTION_COMPLETED, RESULT_EVENTS.GRADE_CALCULATED, RESULT_EVENTS.FACILITY_IMPROVED], '검사·평가·시설 개선이 한 명령 안에서 실행');
      }
    }
    assert.equal(flow.view().phase, 'END');
    const writes = storage.writes;
    assert.equal(flow.dispatch('CONFIRM_INSPECTION').ok, false);
    assert.equal(storage.writes - writes, 0, '실패 명령 저장 0회');
  }
});

test('F-18 중복 계약·중복 검사·중복 채용·잘못된 단계·처리 중 예외는 상태·이벤트·저장 기록을 유지', () => {
  const at = (commands) => { const storage = countingStorage(); const { flow } = savedFlow(storage); play(flow, commands); return { flow, storage }; };
  const path = FULL_PATH(true), upTo = (command) => path.slice(0, path.indexOf(command) + 1);

  let { flow, storage } = at(upTo('SIGN_CONTRACT'));
  assert.equal(assertFailureKeepsEverything(flow, storage, () => flow.dispatch('SIGN_CONTRACT'), '중복 계약').reason, REASON.INVALID_STATE);
  ({ flow, storage } = at(upTo('CONFIRM_INSPECTION')));
  assert.equal(assertFailureKeepsEverything(flow, storage, () => flow.dispatch('CONFIRM_INSPECTION'), '중복 검사').reason, REASON.INVALID_STATE);
  ({ flow, storage } = at(path));
  const other = flow.state.getCandidates()[1].id;
  assert.equal(assertFailureKeepsEverything(flow, storage, () => flow.dispatch('HIRE', { candidateId: other }), '중복 채용').reason, REASON.INVALID_STATE);
  assert.equal(flow.state.getStaff().hired.length, 1);
  ({ flow, storage } = at([]));
  assert.equal(assertFailureKeepsEverything(flow, storage, () => flow.dispatch('CONFIRM_INSPECTION'), '잘못된 단계').reason, REASON.INVALID_STATE);
  ({ flow, storage } = at(['CHECK_RESIDENTS']));
  flow.procurement.checkUserSpec = () => { flow.state.spendBudget(1); throw new Error('forced'); };
  assert.equal(assertFailureKeepsEverything(flow, storage, () => flow.dispatch('CHECK_USER_SPEC'), '처리 중 예외').reason, FLOW_REASON.COMMAND_FAILED);
  assert.equal(flow.fatal, null);
});

test('F-18 저장 데이터 예외: 빈 문자열은 EMPTY(기록 유지), 버전 누락·이전 버전·내부 버전 불일치는 폐기, 안내 이력의 비문자열은 손상', () => {
  const valid = (() => { const storage = countingStorage(); const { flow } = savedFlow(storage); play(flow, ['CHECK_RESIDENTS']); return JSON.parse(storage.peek()); })();
  const variant = (change) => { const r = structuredClone(valid); change(r); return JSON.stringify(r); };
  const cases = [
    ['빈 문자열', '', { ok: false, reason: 'EMPTY' }, true],
    ['바깥 version 누락', variant((r) => { delete r.version; }), { ok: false, reason: 'VERSION_MISMATCH', cleared: true }, false],
    ['바깥 version 0(이전 버전)', variant((r) => { r.version = 0; }), { ok: false, reason: 'VERSION_MISMATCH', cleared: true }, false],
    ['바깥 version 문자열', variant((r) => { r.version = '1'; }), { ok: false, reason: 'VERSION_MISMATCH', cleared: true }, false],
    ['내부 GameState version 불일치', variant((r) => { r.gameState.version = 0; }), { ok: false, reason: 'VERSION_MISMATCH', cleared: true }, false],
    ['seenDialogs 숫자', variant((r) => { r.meta.seenDialogs = [5]; }), { ok: false, reason: 'CORRUPTED', cleared: true }, false],
    ['seenDialogs null', variant((r) => { r.meta.seenDialogs = [null]; }), { ok: false, reason: 'CORRUPTED', cleared: true }, false]
  ];
  for (const [label, raw, expected, kept] of cases) {
    const storage = countingStorage(raw);
    const flow = new TutorialFlow();
    const before = flow.state.toJSON(), meta = structuredClone(flow.meta);
    assert.deepEqual(new BrowserSave({ storage }).restore(flow), expected, label);
    assert.deepEqual(flow.state.toJSON(), before, label + ': 상태 불변');
    assert.deepEqual(flow.meta, meta, label + ': meta 불변');
    assert.equal(storage.peek() !== null, kept, label + (kept ? ': 기록 유지' : ': 기록 폐기'));
    assert.equal(storage.writes, 0, label + ': 복원 실패는 저장하지 않음');
  }
});

test('F-18 매트 점검·점검 생략 경로의 모든 진행 지점에서 저장·복원 후 완주하면 최종 상태가 같고 중복 처리가 없다', () => {
  for (const withCondition of [true, false]) {
    const path = FULL_PATH(withCondition);
    const baseline = savedFlow(countingStorage()).flow;
    play(baseline, path);
    const finalState = baseline.state.toJSON(), finalMeta = baseline.meta;
    const index = (command) => path.indexOf(command);
    for (let k = 0; k <= path.length; k++) {
      const label = `${withCondition ? '점검' : '생략'} ${k}(${path[k - 1] || 'newGame'} 후)`;
      const storage = countingStorage();
      const { flow } = savedFlow(storage);
      play(flow, path.slice(0, k));
      const saved = storage.peek(), writes = storage.writes;

      const resumed = new TutorialFlow({ rng: () => 0.5 });
      const save = new BrowserSave({ storage });
      assert.deepEqual(save.restore(resumed), { ok: true }, label);
      assert.deepEqual(resumed.state.toJSON(), flow.state.toJSON(), label + ': 저장 시점 상태로 복원');
      assert.deepEqual(resumed.meta, flow.meta, label + ': meta 복원');
      assert.equal(storage.writes, writes, label + ': 복원 자체는 저장하지 않음');
      assert.equal(storage.peek(), saved, label + ': 복원은 기록을 바꾸지 않음');

      save.attach(resumed);
      const results = [];
      for (const name of Object.values(RESULT_EVENTS)) resumed.state.on(name, () => results.push(name));
      play(resumed, path.slice(k));
      const count = (name) => results.filter((x) => x === name).length;
      assert.deepEqual(resumed.state.toJSON(), finalState, label + ': 완주 최종 상태 일치');
      assert.deepEqual(resumed.meta, finalMeta, label + ': 완주 meta 일치');
      assert.equal(count(RESULT_EVENTS.CONTRACT_CREATED), k <= index('SIGN_CONTRACT') ? 1 : 0, label + ': 계약 1회');
      assert.equal(count(RESULT_EVENTS.GRADE_CALCULATED), k <= index('CONFIRM_INSPECTION') ? 1 : 0, label + ': 평가 1회');
      assert.equal(count(RESULT_EVENTS.CANDIDATE_HIRED), k <= index('HIRE') ? 1 : 0, label + ': 채용 1회');
      assert.equal(resumed.state.getStaff().hired.length, 1, label);
      assert.deepEqual(JSON.parse(storage.peek()).gameState, finalState, label + ': 완주 후 저장 기록 일치');
    }
    const supplement = withCondition ? 0 : 18;
    assert.equal(baseline.state.getBudget(), 300 - baseline.state.getContract().amount - supplement, '계약금·보완 비용 1회 차감');
  }
});
