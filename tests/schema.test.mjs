/** 공통 데이터 구조 테스트: 예시 데이터는 통과, 흔한 실수는 걸러낸다 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYCOON } from './load.mjs';
import { sampleProject, sampleSuppliers, sampleContract, sampleDelivery, sampleEvaluation, sampleCandidates } from './fixtures/sampleData.mjs';

const schema = TYCOON.core;
const { ok, fail, REASON } = TYCOON.core;

test('예시 데이터는 모두 통과', () => {
  assert.deepEqual(schema.validateProject(sampleProject), []);
  sampleSuppliers.forEach((s) => assert.deepEqual(schema.validateSupplier(s), []));
  assert.deepEqual(schema.validateContract(sampleContract), []);
  assert.deepEqual(schema.validateDelivery(sampleDelivery), []);
  assert.deepEqual(schema.validateEvaluation(sampleEvaluation), []);
  assert.deepEqual(schema.validateFacilityState({ stage: 'BEFORE' }), []);
  sampleCandidates.forEach((c) => assert.deepEqual(schema.validateCandidate(c), []));
  assert.deepEqual(schema.validateDate({ month: 1, phase: 'PLAN' }), []);
  assert.deepEqual(schema.validateStaff({ headcount: 2, seats: 2, hired: [sampleCandidates[0]] }), []);
});

test('흔한 실수를 걸러낸다', () => {
  assert.ok(schema.validateProject({ ...sampleProject, budgetLimit: '300' }).length);
  assert.ok(schema.validateProject({ ...sampleProject, items: [{ itemId: 'mattress', quantity: 0 }] }).length);
  assert.ok(schema.validateSupplier({ ...sampleSuppliers[0], quality: undefined }).length);
  assert.ok(schema.validateSupplier({ ...sampleSuppliers[0], deliveryDays: 0 }).length);
  assert.ok(schema.validateContract({ ...sampleContract, supplierId: '' }).length);
  assert.ok(schema.validateDelivery({ ...sampleDelivery, delivered: [{ itemId: 'bedding', quantity: -1 }] }).length);
  assert.ok(schema.validateDelivery({ ...sampleDelivery, issues: [{ type: 'MISSING_QUANTITY', resolved: 'no' }] }).length);
  assert.ok(schema.validateEvaluation({ ...sampleEvaluation, grade: 'a' }).length);
  assert.ok(schema.validateProject(null).length);
});

test('누락 0개 납품도 허용 (실제 수량 0)', () => {
  assert.deepEqual(schema.validateDelivery({ ...sampleDelivery, delivered: [{ itemId: 'bedding', quantity: 0 }] }), []);
});

test('단계 전환표: 모든 단계가 정의되고 마지막은 끝', () => {
  const keys = Object.keys(schema.PROJECT_STATUS);
  assert.deepEqual(Object.keys(schema.PROJECT_TRANSITIONS), keys);
  assert.deepEqual(schema.PROJECT_TRANSITIONS.COMPLETED, []);
});

test('결과 형식 도우미', () => {
  assert.deepEqual(ok({ contractId: 'C1' }), { ok: true, contractId: 'C1' });
  assert.deepEqual(fail(REASON.NOT_ELIGIBLE), { ok: false, reason: 'NOT_ELIGIBLE' });
  assert.deepEqual(fail(REASON.NOT_FOUND, { id: 'X' }), { ok: false, reason: 'NOT_FOUND', detail: { id: 'X' } });
});


test('S-3/S-4: evaluation passed true와 false는 등급 정책에 맞으면 유효', () => {
  assert.deepEqual(schema.validateEvaluation({ ...sampleEvaluation, passed: true }), []);
  assert.deepEqual(schema.validateEvaluation({ ...sampleEvaluation, grade: 'D', passed: false }), []);
});
test('S-5/S-6: passed 누락 및 비 boolean 거부', () => {
  const { passed, ...missing } = sampleEvaluation;
  assert.ok(schema.validateEvaluation(missing).some((x) => x.includes('passed')));
  for (const bad of ['false', 0, null]) assert.ok(schema.validateEvaluation({ ...sampleEvaluation, passed: bad }).length);
});
test('enum 검증은 프로토타입 속성 이름을 허용하지 않는다', () => {
  assert.ok(schema.validateProject({ ...sampleProject, status: 'toString' }).length);
  assert.ok(schema.validateDelivery({ ...sampleDelivery, status: 'constructor' }).length);
  assert.ok(schema.validateDate({ month: 1, phase: 'toString' }).length);
  assert.ok(schema.validateFacilityState({ stage: 'constructor' }).length);
});
test('계약 규격은 필수이며 형식 검증한다', () => {
  const { specs, ...missing } = sampleContract;
  assert.ok(schema.validateContract(missing).some((x) => x.includes('specs')));
  assert.ok(schema.validateContract({ ...sampleContract, specs: [''] }).length);
});
test('staff.hired 중복 ID 거부', () => {
  assert.ok(schema.validateStaff({ headcount: 3, seats: 3, hired: [sampleCandidates[0], sampleCandidates[0]] }).length);
});
