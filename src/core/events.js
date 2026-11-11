/**
 * 이벤트 이름. (담당: 팀원 1)
 * 문자열을 직접 쓰지 말고 이 상수를 쓴다. 이름을 바꿀 때는 팀원 1과 협의한다.
 *
 * 두 종류가 있다.
 * - EVENTS: 상태 변경. GameState가 값이 바뀔 때 자동으로 보낸다. 화면 갱신용.
 * - RESULT_EVENTS: 업무 결과. 각 System이 gameState.notify()로 보낸다.
 *   안내 대사, 효과음, 튜토리얼 진행처럼 '무슨 일이 일어났는지'가 필요할 때 쓴다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const CORE_NS = (TYCOON.core = TYCOON.core || {});

  const EVENTS = Object.freeze({
    /** 어떤 값이든 바뀌면 함께 보낸다. payload: { key } */
    STATE_CHANGED: 'state:changed',
    /** payload: { budget, delta } */
    BUDGET_CHANGED: 'budget:changed',
    DATE_CHANGED: 'date:changed',
    PROJECT_CHANGED: 'project:changed',
    /** payload: { from, to } */
    PROJECT_STATUS_CHANGED: 'project:status',
    SUPPLIERS_CHANGED: 'suppliers:changed',
    CONTRACT_CHANGED: 'contract:changed',
    DELIVERY_CHANGED: 'delivery:changed',
    /** payload: { facilityId, state } */
    FACILITY_CHANGED: 'facility:changed',
    STAFF_CHANGED: 'staff:changed',
    CANDIDATES_CHANGED: 'candidates:changed',
    EVALUATION_CHANGED: 'evaluation:changed',
    /** 새 게임 또는 불러오기로 전체가 바뀌었을 때 */
    STATE_RESET: 'state:reset'
  });

  /** System이 보내는 업무 결과. payload 형식은 오른쪽 주석을 따른다. */
  const RESULT_EVENTS = Object.freeze({
    // 팀원 2: 조달·계약
    CONTRACT_CREATED: 'result:contract-created',     // { contractId, supplierId, amount }
    CONTRACT_REJECTED: 'result:contract-rejected',   // { supplierId, reason }  reason = REASON.*
    // 팀원 3: 납품·검수·평가·시설
    TIME_ADVANCED: 'result:time-advanced',           // { date }
    DELIVERY_ARRIVED: 'result:delivery-arrived',     // { contractId }
    DELIVERY_ISSUE_FOUND: 'result:delivery-issue',   // { issue }  튜토리얼 일부 누락
    DELIVERY_ISSUE_RESOLVED: 'result:issue-resolved',// { issue }
    INSPECTION_COMPLETED: 'result:inspected',        // { passed, findings: string[] }
    GRADE_CALCULATED: 'result:graded',               // { grade, reason }
    FACILITY_IMPROVED: 'result:facility-improved',   // { facilityId, stage }
    // 팀원 3: 성과평가 후 첫 동료 선발 (기능정의서 F-14)
    HEADCOUNT_APPROVED: 'result:headcount-approved', // { headcount }
    CANDIDATE_HIRED: 'result:candidate-hired',       // { candidateId }
    // 팀원 4: 튜토리얼
    TUTORIAL_STEP: 'result:tutorial-step'            // { stepId }
  });

  Object.assign(CORE_NS, { EVENTS, RESULT_EVENTS });
})();
