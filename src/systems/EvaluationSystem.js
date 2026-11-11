/**
 * 성과평가 (담당: 팀원 3, 기능정의서 F-12). 등급 공식은 TEMP(config/balance.js)
 * 프로토타입에서 출발했다. 기획 미정 사항(기능정의서 9장)은 TEMP로 동작한다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SYSTEMS = (TYCOON.systems = TYCOON.systems || {});
  const { ok, fail, REASON, PROJECT_STATUS, RESULT_EVENTS, DATE_PHASE, ISSUE_TYPE, DELIVERY_STATUS, ABILITY_KEYS } = TYCOON.core;

  // ---------- F-12 성과평가 ----------
  class EvaluationSystem {
    constructor(gameState, balance) { this.state = gameState; this.balance = balance; }

    /** TEMP: 3항목 판정을 점수로 더해 S~D를 정한다(기능정의서 F-12 미정 공식) */
    calculateGrade() {
      const project = this.state.getCurrentProject();
      const d = this.state.getDelivery();
      if (project.status !== PROJECT_STATUS.INSPECTING || !d || d.status !== DELIVERY_STATUS.INSPECTED) return fail(REASON.INVALID_STATE);
      const quality = d.supplement ? '보완' : '충족';
      const deadline = '충족'; // 일부 납품은 같은 달 안에 해결
      const procedure = project.review && project.review.mattressCondition ? '충족' : '미흡';
      const total = [quality, deadline, procedure].reduce((n, j) => n + this.balance.judgementScore[j], 0);
      const grade = this.balance.gradeTable.find((r) => total >= r.min).grade;
      let reason = '필요한 수량을 기한 안에 규격대로 공급했고, 확인 기록을 모두 남겼습니다.';
      if (procedure === '미흡') reason = '매트 상태를 점검하지 않아 부족 수량이 틀렸고, 보완 납품으로 바로잡았습니다.';
      else if (quality === '보완') reason = '보완 납품으로 필요한 수량을 채웠습니다.';
      const passed = this.balance.passingGrades.includes(grade);
      this.state.setEvaluation({ projectId: project.id, grade, reason, passed, criteria: { quality, deadline, procedure } });
      this.state.setProjectStatus(PROJECT_STATUS.EVALUATED);
      this.state.notify(RESULT_EVENTS.GRADE_CALCULATED, { grade, reason });
      return ok({ grade, passed });
    }
  }

  Object.assign(SYSTEMS, { EvaluationSystem });
})();
