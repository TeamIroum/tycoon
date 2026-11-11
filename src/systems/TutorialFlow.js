/**
 * 튜토리얼 흐름 연결 (담당: 팀원 1 — 파트분배 '공통 시스템 연결')
 *
 * 화면(팀원 4)과 시스템(팀원 2·3) 사이를 잇는다.
 * - 화면은 dispatch('명령')만 부른다. 이 파일이 알맞은 시스템 함수를 부르고,
 *   화면이 안내 대화·화면 전환에 쓸 '일어난 일' 목록을 돌려준다.
 * - 상태는 모두 GameState에 있다. view()는 화면이 그리기 쉬운 모양으로 읽어서 묶을 뿐이다.
 * - 안내 표시 이력과 힌트 설정은 화면 상태라 여기(meta)에 둔다(저장은 F-18, P1).
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SYSTEMS = (TYCOON.systems = TYCOON.systems || {});
  const { GameState, REASON, DATE_PHASE } = TYCOON.core;
  const { INITIAL_STATE, BALANCE } = TYCOON.config;

  const REASON_TEXT = {
    [REASON.INVALID_AMOUNT]: '금액이 올바르지 않습니다',
    [REASON.INSUFFICIENT_BUDGET]: '집행 가능액이 부족합니다',
    [REASON.NOT_FOUND]: '대상을 찾을 수 없습니다',
    [REASON.NOT_ELIGIBLE]: '계약할 수 없는 업체입니다',
    [REASON.ALREADY_DONE]: '이미 처리했습니다',
    [REASON.INVALID_STATE]: '지금 단계에서 할 수 없습니다',
    [REASON.INSPECTION_FAILED]: '정식 검사 실패: 필수 수량 또는 규격을 충족하지 못했습니다'
  };

  class TutorialFlow {
    constructor(options = {}) {
      const D = TYCOON.data;
      const TUTORIAL = {
        project: D.TUTORIAL_PROJECT, residents: D.RESIDENTS, inventory: D.INVENTORY, userSpecCheck: D.USER_SPEC_CHECK,
        proposals: D.PROPOSALS, partialDelivery: D.PARTIAL_DELIVERY, candidatePool: D.CANDIDATE_POOL
      };
      this.data = TUTORIAL;
      this.balance = options.balance || BALANCE;
      this.initialBudget = INITIAL_STATE.budget;
      this.state = options.gameState || new GameState(INITIAL_STATE);
      this.meta = { hintsOn: true, seenDialogs: [] };
      this.listeners = [];
      this.busy = false;
      this.fatal = null;
      this.procurement = new SYSTEMS.ProcurementSystem(this.state, TUTORIAL, this.balance);
      this.progress = new SYSTEMS.ProgressSystem(this.state);
      this.delivery = new SYSTEMS.DeliverySystem(this.state, TUTORIAL, this.procurement);
      this.evaluation = new SYSTEMS.EvaluationSystem(this.state, this.balance);
      this.facility = new SYSTEMS.FacilitySystem(this.state);
      this.recruit = new SYSTEMS.RecruitSystem(this.state, TUTORIAL.candidatePool, this.balance, options.rng);
    }

    /** 새 게임: 사업 요청이 들어오고, 강당은 개선 전 상태 */
    newGame() {
      this.fatal = null;
      this.state.reset();
      this.state.setCurrentDate({ month: 1, phase: DATE_PHASE.PLAN, pending: null });
      this.state.setCurrentProject({ ...structuredClone(this.data.project), review: {} });
      this.state.setFacilityState('hall', { stage: 'BEFORE' });
      this.meta = { hintsOn: this.meta.hintsOn, seenDialogs: [] };
      this.#emit(['GAME_STARTED']);
    }

    subscribe(fn) {
      this.listeners.push(fn);
      return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
    }

    #emit(events) { for (const fn of this.listeners.slice()) fn(this.view(), events); }

    /** 화면에서 오는 명령. 실패하면 상태를 바꾸지 않고 이유를 돌려준다. */
    dispatch(type, payload = {}) {
      if (this.fatal) return { ok: false, error: '복구 불가능 오류: 새 게임을 시작해 주세요', code: 'ROLLBACK_FAILED' };
      if (this.busy) return { ok: false, error: '이전 명령을 처리하는 중입니다' };
      const handler = this.#handlers[type];
      if (!handler) return { ok: false, error: '알 수 없는 명령: ' + type };
      const snapshot = this.state.toJSON();
      const metaSnapshot = structuredClone(this.meta);
      this.busy = true;
      this.state.beginTransaction();
      let result, originalError = null;
      try { result = handler.call(this, payload); } catch (error) { originalError = error; result = { ok: false, reason: REASON.INVALID_STATE }; }
      if (!result || result.ok !== true) {
        const originalFailure = originalError || result;
        try {
          const restored = this.state.load(snapshot);
          if (!restored.ok) throw new Error('GameState.load returned ' + restored.reason);
          this.meta = metaSnapshot;
          this.state.finishTransaction(false);
          this.busy = false;
          return { ok: false, error: (result && result.message) || (originalError ? originalError.message : REASON_TEXT[result && result.reason] || (result && result.reason) || '명령 실패') };
        } catch (recoveryError) {
          this.state.finishTransaction(true);
          this.fatal = { originalError: String(originalFailure && (originalFailure.stack || originalFailure.message || originalFailure.reason || originalFailure)), recoveryError: String(recoveryError && (recoveryError.stack || recoveryError.message || recoveryError)) };
          console.error('TutorialFlow command failed before rollback:', originalFailure);
          console.error('TutorialFlow rollback failed:', recoveryError);
          this.busy = false;
          this.#emit([]);
          return { ok: false, error: '복구 불가능 오류: 새 게임을 시작해 주세요', code: 'ROLLBACK_FAILED' };
        }
      }
      this.state.finishTransaction(true);
      this.busy = false;
      this.#emit(result.events || []);
      return { ok: true, events: result.events || [] };
    }

    #handlers = {
      CHECK_RESIDENTS() { return this.#wrap(this.procurement.checkResidents(), ['RESIDENTS_CHECKED']); },
      CHECK_USER_SPEC() { return this.#wrap(this.procurement.checkUserSpec(), ['USER_SPEC_CHECKED']); },
      CHECK_INVENTORY_COUNT() { return this.#wrap(this.procurement.countInventory(), ['INVENTORY_COUNTED']); },
      CHECK_MATTRESS_CONDITION() { return this.#wrap(this.procurement.inspectMattress(), ['MATTRESS_CONDITION_CHECKED']); },
      CONFIRM_QUANTITIES() {
        const r = this.procurement.confirmShortage({ hintsOn: this.meta.hintsOn });
        if (!r.ok) return r;
        return { ok: true, events: r.hint ? ['HINT_WET'] : ['QUANTITIES_CONFIRMED'] };
      },
      ADVANCE_MONTH() {
        const month = this.progress.date().month;
        if (month === 1) {
          const r = this.progress.start('PROPOSAL_REVIEW');
          if (!r.ok) return r;
          const proposals = this.procurement.openProposals();
          if (!proposals.ok) return proposals;
          return { ok: true, events: ['MONTH_STARTED', 'PROPOSAL_REVIEW'] };
        }
        const r = this.progress.start('PARTIAL_DELIVERY');
        if (!r.ok) return r;
        const delivery = this.delivery.start();
        if (!delivery.ok) return delivery;
        return { ok: true, events: ['MONTH_STARTED', 'PARTIAL_DELIVERY'] };
      },
      SIGN_CONTRACT() {
        if (this.progress.date().pending !== 'PROPOSAL_REVIEW') return { ok: false, reason: REASON.INVALID_STATE };
        const { winnerId } = this.procurement.compareSuppliers();
        const r = this.procurement.createContract(winnerId);
        if (!r.ok) return r;
        this.progress.endMonth();
        return { ok: true, events: ['CONTRACT_SIGNED', 'MONTH_ENDED'] };
      },
      EVENT_NEGOTIATE_SUPPLIER() { return this.#respond('supplier', 'SUPPLIER_NEGOTIATED'); },
      EVENT_CONFIRM_REQUESTER() { return this.#respond('requester', 'REQUESTER_CONFIRMED'); },
      CONFIRM_INSPECTION() {
        if (this.progress.date().pending !== 'INSPECTION') return { ok: false, reason: REASON.INVALID_STATE };
        const r = this.delivery.inspect();
        if (!r.ok) {
          if (r.reason === REASON.INSUFFICIENT_BUDGET) return { ...r, message: REASON_TEXT[REASON.INSUFFICIENT_BUDGET] };
          return { ...r, message: (r.detail && r.detail.findings || []).join(' ') || REASON_TEXT[REASON.INSPECTION_FAILED], reason: REASON.INSPECTION_FAILED };
        }
        const evaluation = this.evaluation.calculateGrade();
        if (!evaluation.ok) return evaluation;
        if (evaluation.passed) {
          const facility = this.facility.improveFacility('hall');
          if (!facility.ok) return facility;
        }
        this.progress.endMonth();
        return { ok: true, events: evaluation.passed ? ['INSPECTION_DONE', 'USE_STARTED', 'MONTH_ENDED', 'EVALUATED'] : ['INSPECTION_DONE', 'MONTH_ENDED', 'EVALUATED'] };
      },
      CLOSE_REPORT() {
        const d = this.progress.date();
        if (d.phase !== DATE_PHASE.REPORT) return { ok: false, reason: REASON.INVALID_STATE };
        if (d.month === 1) {
          const r = this.progress.nextMonth();
          return r.ok ? { ok: true, events: ['MONTH_PLAN'] } : r;
        }
        if (d.pending) return { ok: false, reason: REASON.INVALID_STATE };
        const ev = this.state.getEvaluation();
        if (ev && !ev.passed) { this.progress.setPending('END'); return { ok: true, events: ['TUTORIAL_ENDED'] }; }
        const a = this.recruit.approveHeadcount();
        if (!a.ok) return a;
        const candidates = this.recruit.ensureCandidates();
        if (!candidates.ok) return candidates;
        this.progress.setPending('RECRUIT');
        return { ok: true, events: ['HEADCOUNT_APPROVED', 'RECRUIT_OPENED'] };
      },
      HIRE({ candidateId }) {
        if (this.progress.date().pending !== 'RECRUIT') return { ok: false, reason: REASON.INVALID_STATE };
        const r = this.recruit.hire(candidateId);
        if (!r.ok) return r;
        this.progress.setPending('END');
        return { ok: true, events: ['HIRED'] };
      },
      MARK_DIALOG_SEEN({ id }) {
        if (!this.meta.seenDialogs.includes(id)) this.meta.seenDialogs.push(id);
        return { ok: true, events: ['META_CHANGED'] };
      },
      SET_HINTS({ on }) {
        this.meta.hintsOn = !!on;
        return { ok: true, events: ['META_CHANGED'] };
      }
    };

    #wrap(result, events) { return result.ok ? { ok: true, events } : result; }

    #respond(kind, event) {
      if (this.progress.date().pending !== 'PARTIAL_DELIVERY') return { ok: false, reason: REASON.INVALID_STATE };
      const r = this.delivery.respond(kind);
      if (!r.ok) return r;
      if (!r.resolved) return { ok: true, events: [event] };
      this.progress.setPending('INSPECTION');
      return { ok: true, events: [event, 'EVENT_RESOLVED', 'INSPECTION_READY'] };
    }

    planReady() { return this.progress.canAdvance(); }
    requestComplete() { return this.procurement.requestComplete(); }
    compareSuppliers() { return this.procurement.compareSuppliers(); }

    /** 화면이 그리기 쉬운 모양. GameState를 읽어서 묶기만 한다(복사본). */
    view() {
      const st = this.state;
      const date = st.getCurrentDate();
      const project = st.getCurrentProject() || { review: {} };
      const contract = st.getContract();
      const delivery = st.getDelivery();
      const evaluation = st.getEvaluation();
      const staff = st.getStaff();
      const review = this.procurement.getReview();
      const qty = (items) => Object.fromEntries((items || []).map((i) => [i.itemId, i.quantity]));
      let phase = { PLAN: 'PLAN', RUN: 'PAUSED', REPORT: 'REPORT' }[date.phase];
      if (date.pending === 'RECRUIT') phase = 'RECRUIT';
      if (date.pending === 'END') phase = 'END';
      const unit = this.balance.currencyUnit;
      const reports = [];
      if (contract) {
        reports.push({ month: 1, lines: [
          `계약: ${contract.supplierName}, 매트 ${qty(contract.items).mattress}개, 침구 ${qty(contract.items).bedding}세트`,
          `계약 금액 ${contract.amount}${unit} (사업예산에서 차감)`,
          `납품 예정: 2월차, 계약 후 ${Math.round(contract.deliveryDays / 7)}주 이내`,
          '다음 달 할 일: 납품 대응과 검사·검수 결과 확인'
        ] });
      }
      if (evaluation) {
        reports.push({ month: 2, lines: [
          evaluation.passed ? `사용 개시: 강당 주민 ${this.data.residents.total}명 모두 잠자리 마련` : '평가 미통과(D): 시설 개선과 추가 정원 승인은 보류되며 보완 안내를 확인합니다.',
          '일부 납품은 같은 달 안에 해결됨',
          `집행액 합계 ${this.initialBudget - st.getBudget()}${unit} / 사업예산 ${this.initialBudget}${unit}`
        ] });
      }
      const hallImproved = (st.getFacilityState('hall') || {}).stage === 'IMPROVED';
      return {
        fatal: this.fatal,
        month: date.month,
        phase,
        pending: ['PROPOSAL_REVIEW', 'PARTIAL_DELIVERY', 'INSPECTION'].includes(date.pending) ? date.pending : null,
        budget: { total: this.initialBudget, spent: this.initialBudget - st.getBudget() },
        project: {
          status: project.status,
          checks: review,
          requiredSpecs: project.requiredSpecs || [],
          quantities: project.shortage || null,
          contract: contract && {
            supplierName: contract.supplierName, quantities: qty(contract.items),
            amount: contract.amount, deliveryWeeks: Math.round(contract.deliveryDays / 7)
          },
          event: {
            supplierNegotiated: !!(delivery && delivery.negotiation && delivery.negotiation.supplier),
            requesterConfirmed: !!(delivery && delivery.negotiation && delivery.negotiation.requester)
          },
          delivered: delivery ? qty(delivery.delivered) : { mattress: 0, bedding: 0 },
          inspection: delivery && delivery.findings ? { ...delivery.inspection, findings: delivery.findings } : null,
          supplement: delivery ? delivery.supplement || null : null
        },
        evaluation: evaluation && { ...evaluation.criteria, grade: evaluation.grade, reason: evaluation.reason, passed: evaluation.passed },
        staff: { headcount: staff.headcount, hired: staff.hired[0] || null },
        region: { hallBedded: hallImproved, hallLit: hallImproved, secondSeat: staff.hired.length > 0 },
        meta: { candidates: st.getCandidates(), seenDialogs: this.meta.seenDialogs.slice(), hintsOn: this.meta.hintsOn },
        reports
      };
    }
  }

  Object.assign(SYSTEMS, { TutorialFlow });
})();
