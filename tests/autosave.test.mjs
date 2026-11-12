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
