/**
 * 시설 개선 (담당: 팀원 3, 기능정의서 F-13)
 * 프로토타입에서 출발했다. 기획 미정 사항(기능정의서 9장)은 TEMP로 동작한다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SYSTEMS = (TYCOON.systems = TYCOON.systems || {});
  const { ok, fail, REASON, PROJECT_STATUS, RESULT_EVENTS, DATE_PHASE, ISSUE_TYPE, DELIVERY_STATUS, ABILITY_KEYS } = TYCOON.core;

  // ---------- F-13 시설 개선 ----------
  class FacilitySystem {
    constructor(gameState) { this.state = gameState; }

    improveFacility(facilityId) {
      const project = this.state.getCurrentProject();
      if (!project || project.status !== PROJECT_STATUS.EVALUATED) return fail(REASON.INVALID_STATE);
      const evaluation = this.state.getEvaluation();
      if (!evaluation || !evaluation.passed) return fail(REASON.INVALID_STATE);
      const current = this.state.getFacilityState(facilityId);
      if (current && current.stage === 'IMPROVED') return fail(REASON.ALREADY_DONE);
      this.state.setFacilityState(facilityId, { stage: 'IMPROVED' });
      this.state.setProjectStatus(PROJECT_STATUS.COMPLETED);
      this.state.notify(RESULT_EVENTS.FACILITY_IMPROVED, { facilityId, stage: 'IMPROVED' });
      return ok();
    }
  }

  Object.assign(SYSTEMS, { FacilitySystem });
})();
