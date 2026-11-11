/**
 * 월 진행 시스템 (담당: 팀원 3, 기능정의서 F-03)
 *
 * 날짜는 { month, phase, pending }. phase는 PLAN(월초 계획) → RUN(진행) → REPORT(월말 보고).
 * pending은 진행 중 멈춘 이유(PROPOSAL_REVIEW, PARTIAL_DELIVERY, INSPECTION, RECRUIT, END).
 * 프로토타입에서 출발했다. 기획 미정 사항(기능정의서 9장)은 TEMP로 동작한다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SYSTEMS = (TYCOON.systems = TYCOON.systems || {});
  const { ok, fail, REASON, PROJECT_STATUS, RESULT_EVENTS, DATE_PHASE, ISSUE_TYPE, DELIVERY_STATUS, ABILITY_KEYS } = TYCOON.core;

  // ---------- F-03 월 진행 ----------
  // 날짜: { month, phase, pending }. pending은 진행 중 멈춘 이유(사건, 결정 대기).
  class ProgressSystem {
    constructor(gameState) { this.state = gameState; }

    date() { return this.state.getCurrentDate(); }

    /** 월 진행 버튼을 누를 수 있는지와 이유 */
    canAdvance() {
      const d = this.date();
      if (d.phase !== DATE_PHASE.PLAN) return { ready: false, reason: '' };
      const project = this.state.getCurrentProject();
      if (d.month === 1 && !(project && project.shortage)) return { ready: false, reason: '요청서와 재고를 확인하고 부족 수량을 확정하세요' };
      if (d.month === 2 && !this.state.getContract()) return { ready: false, reason: '계약이 없습니다' };
      if (d.month > 2) return { ready: false, reason: '' };
      return { ready: true, reason: '' };
    }

    /** 한 번에 한 달만. 진행을 시작하고 멈출 이유(pending)를 정한다. */
    start(pending) {
      if (!this.canAdvance().ready) return fail(REASON.INVALID_STATE);
      const d = this.date();
      this.state.setCurrentDate({ month: d.month, phase: DATE_PHASE.RUN, pending });
      this.state.notify(RESULT_EVENTS.TIME_ADVANCED, { date: this.date() });
      return ok();
    }

    setPending(pending) {
      const d = this.date();
      this.state.setCurrentDate({ ...d, pending });
    }

    /** 진행을 마치고 월말 보고로 */
    endMonth() {
      const d = this.date();
      this.state.setCurrentDate({ month: d.month, phase: DATE_PHASE.REPORT, pending: null });
    }

    /** 1월차 보고를 닫으면 2월차 월초 */
    nextMonth() {
      const d = this.date();
      if (d.phase !== DATE_PHASE.REPORT || d.month !== 1) return fail(REASON.INVALID_STATE);
      this.state.setCurrentDate({ month: 2, phase: DATE_PHASE.PLAN, pending: null });
      return ok();
    }
  }

  Object.assign(SYSTEMS, { ProgressSystem });
})();
