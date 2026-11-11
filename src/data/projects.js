/**
 * 튜토리얼 사업, 요청 확인 데이터 (담당: 팀원 2)
 * 값과 문구는 TEMP다. 기획에서 정하면 고친다(기능정의서 9장).
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const DATA = (TYCOON.data = TYCOON.data || {});

  /** 규격 id → 화면 이름 */
  const SPECS = Object.freeze({
    standardSize: '표준 규격(1인용)',
    antiSlip: '미끄럼 방지 바닥면',
    washableCover: '세탁 가능한 커버'
  });

  /** 튜토리얼 사업 (F-04). items의 quantity는 필요 인원 기준, 실제 계약 수량은 부족 수량(shortage) */
  const TUTORIAL_PROJECT = Object.freeze({
    id: 'P01', title: '주민들의 잠자리 마련', requester: '학당 운영위원회', facilityId: 'hall',
    budgetLimit: 300,
    items: [{ itemId: 'mattress', name: '매트', quantity: 20 }, { itemId: 'bedding', name: '침구', quantity: 20 }],
    requiredSpecs: ['standardSize'],
    optionalSpecs: ['washableCover'],
    dueDate: { month: 2, phase: 'REPORT' },
    place: '학당 강당', inspector: '학당 운영위원회',
    contractMethod: '공고한 조건에 대한 제안 비교 (게임용 단순화)'
  });

  /** 주민 수·연령 구성 (기획서 4장 약 20명, 연령은 v0.7 제안값) */
  const RESIDENTS = Object.freeze({ total: 20, adults: 12, elderly: 4, children: 4 });

  /** 남은 재고 (기획서 4장: 매트 8개, 침구 12세트). 젖은 매트 수는 TEMP (F-05) */
  const INVENTORY = Object.freeze({ mattress: { count: 8, wet: 2 }, bedding: { count: 12, wet: 0 } });

  /** 사용자 규격 확인 결과. TEMP (F-04) */
  const USER_SPEC_CHECK = Object.freeze({
    addsRequiredSpec: 'antiSlip',
    resultText: '고령자 4명이 쓰는 매트는 미끄럼 방지 바닥면이 필요합니다. 아동은 표준 규격으로 충분합니다.'
  });

  Object.assign(DATA, { SPECS, TUTORIAL_PROJECT, RESIDENTS, INVENTORY, USER_SPEC_CHECK });
})();
