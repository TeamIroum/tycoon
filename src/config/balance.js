/**
 * 밸런스 값. (관리: 팀원 1, 값 결정: 기획)
 *
 * 모두 TEMP다. 기획서에 수치가 없어 동작 확인용으로 넣었다(기능정의서 9장).
 * 기획이 정하면 이 파일만 고친다. 시스템 코드에 숫자를 직접 쓰지 않는다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const CONFIG_NS = (TYCOON.config = TYCOON.config || {});

  const BALANCE = Object.freeze({
    currencyUnit: '만원',
    deadlineDays: 56,                                          // 2개월
    weights: { price: 40, quality: 40, delivery: 20 },        // TEMP: CLAUDE.md 초기 검토안 (F-07)
    qualityMax: 5,                                             // TEMP: 품질 척도 1~5 (F-07)
    judgementScore: { '충족': 2, '보완': 1, '미흡': 0 },        // TEMP: 등급 공식 (F-12)
    gradeTable: [
      { min: 6, grade: 'S' }, { min: 5, grade: 'A' }, { min: 4, grade: 'B' }, { min: 3, grade: 'C' }, { min: 0, grade: 'D' }
    ],
    gradeLabels: { S: '탁월', A: '우수', B: '보통', C: '미흡', D: '매우 미흡' },
    passingGrades: ['S', 'A', 'B', 'C'],
    candidateCount: 3
  });

  Object.assign(CONFIG_NS, { BALANCE });
})();
