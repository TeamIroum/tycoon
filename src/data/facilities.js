/**
 * 시설 상태, 일부 납품 사건, 후보 데이터 (담당: 팀원 3)
 * 값과 문구는 TEMP다. 기획에서 정하면 고친다(기능정의서 9장).
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const DATA = (TYCOON.data = TYCOON.data || {});

  /** 시설 단계 (F-13). 초안: BEFORE → IMPROVED */
  const FACILITIES = Object.freeze({
    hall: { name: '학당 강당', stages: ['BEFORE', 'IMPROVED'] }
  });

  /** 튜토리얼 일부 납품 사건 (F-10). 먼저 들어오는 수량은 TEMP */
  const PARTIAL_DELIVERY = Object.freeze({
    itemId: 'bedding', firstBatch: 5,
    supplierAnswer: '원단 재고를 모아 남은 침구 3세트를 이번 달 안에 보내겠다고 합니다.',
    requesterAnswer: '고령자와 아동에게 먼저 지급하라고 답했습니다.'
  });

  /** 직원 능력 4종 (기획서 4장) */
  const ABILITIES = Object.freeze([
    { key: 'review', label: '검토' }, { key: 'tech', label: '기술' },
    { key: 'coordinate', label: '조정' }, { key: 'manage', label: '관리' }
  ]);

  /** 후보 풀 (F-14). 앞 3명은 기획서 4장 예시, 뒤 3명은 TEMP */
  const CANDIDATE_POOL = Object.freeze([
      { id: 'C01', name: '김도윤', level: '입문', abilities: { review: 4, tech: 2, coordinate: 5, manage: 3 }, specialty: '생활물자', trait: '현장 소통' },
      { id: 'C02', name: '서하린', level: '숙련', abilities: { review: 3, tech: 5, coordinate: 2, manage: 3 }, specialty: '의료장비', trait: '시험 결과 분석' },
      { id: 'C03', name: '윤가람', level: '실무', abilities: { review: 4, tech: 3, coordinate: 3, manage: 5 }, specialty: '시설·토목', trait: '협업 일정 정리' },
      { id: 'C04', name: '박서진', level: '실무', abilities: { review: 5, tech: 3, coordinate: 3, manage: 3 }, specialty: '정보·통신', trait: '꼼꼼한 기록' },
      { id: 'C05', name: '이하은', level: '입문', abilities: { review: 2, tech: 3, coordinate: 4, manage: 5 }, specialty: '물류·공급망', trait: '운송 경로 파악' },
      { id: 'C06', name: '정우람', level: '숙련', abilities: { review: 3, tech: 5, coordinate: 3, manage: 2 }, specialty: '시설·토목', trait: '현장 안전 점검' }
  ]);

  Object.assign(DATA, { FACILITIES, PARTIAL_DELIVERY, ABILITIES, CANDIDATE_POOL });
})();
