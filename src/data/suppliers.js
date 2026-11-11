/**
 * 공급업체와 제안 (담당: 팀원 2)
 * 값과 문구는 TEMP다. 기획에서 정하면 고친다(기능정의서 9장).
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const DATA = (TYCOON.data = TYCOON.data || {});

  /**
   * 공급업체 제안 3건 (F-06, F-07). 튜토리얼은 고정 업체 3곳.
   * 단가 × 계약 수량으로 제안 총액(price)을 계산한다. quality는 규격 충족 정도(TEMP 척도 1~5).
   */
  const PROPOSALS = Object.freeze([
    { id: 'S1', name: '한결침구공방', kind: '지역 공방', unitPrice: { mattress: 9, bedding: 7 }, specs: ['standardSize', 'antiSlip', 'washableCover'], quality: 5, deliveryDays: 42, capacity: { mattress: 20, bedding: 20 } },
    { id: 'S2', name: '강변생활물산', kind: '생활물자 기업', unitPrice: { mattress: 7, bedding: 6 }, specs: ['standardSize', 'washableCover'], quality: 3, deliveryDays: 35, capacity: { mattress: 30, bedding: 30 } },
    { id: 'S3', name: '북부물자상사', kind: '물자 유통 기업', unitPrice: { mattress: 11, bedding: 9 }, specs: ['standardSize', 'antiSlip'], quality: 4, deliveryDays: 35, capacity: { mattress: 25, bedding: 25 } }
  ]);

  Object.assign(DATA, { PROPOSALS });
})();
