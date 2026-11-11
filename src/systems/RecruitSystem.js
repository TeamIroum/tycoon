/**
 * 첫 동료 선발 처리 (담당: 팀원 3, 기능정의서 F-14). 화면은 팀원 4
 * 프로토타입에서 출발했다. 기획 미정 사항(기능정의서 9장)은 TEMP로 동작한다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SYSTEMS = (TYCOON.systems = TYCOON.systems || {});
  const { ok, fail, REASON, PROJECT_STATUS, RESULT_EVENTS, DATE_PHASE, ISSUE_TYPE, DELIVERY_STATUS, ABILITY_KEYS } = TYCOON.core;

  // ---------- F-14 첫 동료 선발 ----------
  class RecruitSystem {
    constructor(gameState, pool, balance, rng) {
      this.state = gameState;
      this.pool = pool;
      this.balance = balance;
      this.rng = rng || Math.random;
    }

    approveHeadcount() {
      const ev = this.state.getEvaluation();
      const project = this.state.getCurrentProject();
      if (!ev || !ev.passed || !project || project.status !== PROJECT_STATUS.COMPLETED) return fail(REASON.INVALID_STATE);
      const staff = this.state.getStaff();
      if (staff.headcount >= 2) return fail(REASON.ALREADY_DONE);
      this.state.setStaff({ ...staff, headcount: 2, seats: 2 });
      this.state.notify(RESULT_EVENTS.HEADCOUNT_APPROVED, { headcount: 2 });
      return ok();
    }

    /** 한 번 만든 후보는 다시 만들지 않는다(저장해 유지). 가장 높은 능력과 전문 분야가 겹치지 않게 뽑는다. */
    ensureCandidates() {
      const ev = this.state.getEvaluation();
      if (!ev || !ev.passed || !this.state.getCurrentProject() || this.state.getProjectStatus() !== PROJECT_STATUS.COMPLETED) return fail(REASON.INVALID_STATE);
      if (this.state.getCandidates()) return ok({ created: false });
      const pool = this.pool.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const picked = [];
      const usedTop = new Set();
      const usedSpec = new Set();
      for (const c of pool) {
        if (picked.length >= this.balance.candidateCount) break;
        const top = topAbility(c);
        if (usedTop.has(top) || usedSpec.has(c.specialty)) continue;
        usedTop.add(top); usedSpec.add(c.specialty); picked.push(c);
      }
      for (const c of pool) {
        if (picked.length >= this.balance.candidateCount) break;
        if (!picked.includes(c)) picked.push(c);
      }
      this.state.setCandidates(picked);
      return ok({ created: true });
    }

    hire(candidateId) {
      const candidates = this.state.getCandidates() || [];
      const pick = candidates.find((c) => c.id === candidateId);
      if (!pick) return fail(REASON.NOT_FOUND);
      const ev = this.state.getEvaluation();
      const project = this.state.getCurrentProject();
      if (!ev || !ev.passed || !project || project.status !== PROJECT_STATUS.COMPLETED) return fail(REASON.INVALID_STATE);
      const staff = this.state.getStaff();
      if (staff.hired.some((c) => c.id === candidateId)) return fail(REASON.ALREADY_DONE);
      if (1 + staff.hired.length >= staff.headcount) return fail(REASON.ALREADY_DONE);
      this.state.setStaff({ ...staff, hired: [...staff.hired, pick] });
      this.state.notify(RESULT_EVENTS.CANDIDATE_HIRED, { candidateId });
      return ok();
    }
  }

  function topAbility(c) {
    return ABILITY_KEYS.reduce((best, k) => (best === null || c.abilities[k] > c.abilities[best] ? k : best), null);
  }

  Object.assign(SYSTEMS, { RecruitSystem, topAbility });
})();
