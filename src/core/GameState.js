/**
 * 게임 전체가 공유하는 진행 상태. (담당: 팀원 1)
 *
 * 원칙 (CLAUDE.md 5장, 파트분배 4장)
 * - 진행 중에 바뀌는 값은 모두 여기에만 둔다. Scene마다 복사해 두지 않는다.
 * - 값은 이 클래스의 메서드로만 바꾼다. 바뀌면 이벤트를 보낸다.
 * - getter는 복사본을 돌려준다. 받은 객체를 고쳐도 상태는 바뀌지 않는다.
 * - 게임 규칙(자격 검증, 점수, 등급 등)은 여기 두지 않고 각 System이 맡는다.
 *   GameState는 결과를 저장하고 알리기만 한다.
 * - Phaser에 의존하지 않는다. Node 테스트에서 그대로 실행된다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const CORE_NS = (TYCOON.core = TYCOON.core || {});
  const { EventBus } = TYCOON.core;
  const { EVENTS, RESULT_EVENTS } = TYCOON.core;
  const { REASON } = TYCOON.core;
  const { PROJECT_STATUS, PROJECT_TRANSITIONS, validateProject, validateSupplier, validateContract, validateDelivery, validateEvaluation, validateFacilityState, validateDate, validateStaff, validateCandidate } = TYCOON.core;

  const RESULT_EVENT_NAMES = new Set(Object.values(RESULT_EVENTS));

  /** 모양이 틀린 데이터는 코드 실수이므로 바로 알 수 있게 예외를 던진다. */
  function assertValid(errors) {
    if (errors.length) throw new TypeError(errors.join('\n'));
  }

  const SAVE_VERSION = 1;

  const clone = (value) => (value === undefined ? undefined : structuredClone(value));

  class GameState {
    #data;
    #bus = new EventBus();
    #initial;
    #eventBuffer = null;

    /**
     * @param {{ budget: number, currentDate: object, staff: object }} initial 새 게임 초기값
     */
    constructor(initial) {
      if (!initial || !Number.isInteger(initial.budget) || initial.budget < 0) {
        throw new TypeError('초기 예산은 0 이상의 정수여야 합니다');
      }
      assertValid(validateDate(initial.currentDate));
      assertValid(validateStaff(initial.staff));
      this.#initial = clone(initial);
      this.#data = GameState.#createData(this.#initial);
    }

    static #createData(initial) {
      return {
        currentDate: clone(initial.currentDate),
        budget: initial.budget,
        currentProject: null,
        suppliers: [],
        contract: null,
        delivery: null,
        facilities: {},
        evaluation: null,
        staff: clone(initial.staff),
        candidates: null
      };
    }

    // ---------- 구독 ----------

    /** 이벤트를 구독하고, 구독을 끊는 함수를 돌려준다. Scene에서는 listenTo를 쓴다. */
    on(event, handler) {
      return this.#bus.on(event, handler);
    }

    listenerCount(event) {
      return this.#bus.listenerCount(event);
    }

    #publish(event, payload) {
      if (this.#eventBuffer) this.#eventBuffer.push([event, clone(payload)]);
      else this.#bus.emit(event, payload);
    }

    beginTransaction() {
      if (this.#eventBuffer) throw new Error('GameState transaction already active');
      this.#eventBuffer = [];
    }

    finishTransaction(commit) {
      if (!this.#eventBuffer) return;
      const pending = this.#eventBuffer;
      this.#eventBuffer = null;
      if (commit) pending.forEach(([event, payload]) => this.#bus.emit(event, payload));
    }

    #changed(key, event, payload) {
      this.#publish(event, payload);
      this.#publish(EVENTS.STATE_CHANGED, { key });
    }

    /**
     * System이 업무 결과를 알린다. RESULT_EVENTS에 있는 이름만 받는다.
     * 상태 변경 이벤트(EVENTS)는 GameState만 보낸다.
     */
    notify(event, payload) {
      if (!RESULT_EVENT_NAMES.has(event)) throw new Error(`notify로 보낼 수 없는 이벤트: ${event}`);
      this.#publish(event, clone(payload));
    }

    // ---------- 예산 ----------

    getBudget() {
      return this.#data.budget;
    }

    /**
     * 예산을 차감한다. 실패하면 값을 바꾸지 않고 이유를 돌려준다.
     * 중복 계약 방지 같은 업무 규칙은 호출하는 System(팀원 2)이 책임진다.
     * @returns {{ ok: true, budget: number } | { ok: false, reason: 'INVALID_AMOUNT' | 'INSUFFICIENT_BUDGET', budget: number }}
     */
    spendBudget(amount) {
      if (!Number.isInteger(amount) || amount <= 0) {
        return { ok: false, reason: REASON.INVALID_AMOUNT, budget: this.#data.budget };
      }
      if (amount > this.#data.budget) {
        return { ok: false, reason: REASON.INSUFFICIENT_BUDGET, budget: this.#data.budget };
      }
      this.#data.budget -= amount;
      this.#changed('budget', EVENTS.BUDGET_CHANGED, { budget: this.#data.budget, delta: -amount });
      return { ok: true, budget: this.#data.budget };
    }

    // ---------- 날짜 ----------

    getCurrentDate() {
      return clone(this.#data.currentDate);
    }

    setCurrentDate(date) {
      assertValid(validateDate(date));
      this.#data.currentDate = clone(date);
      this.#changed('currentDate', EVENTS.DATE_CHANGED, clone(date));
    }

    // ---------- 사업 · 업체 · 계약 · 납품 · 평가 ----------

    getCurrentProject() { return clone(this.#data.currentProject); }

    /** 새 사업을 시작한다. status가 없으면 REQUESTED로 시작한다. null이면 사업 없음. */
    setCurrentProject(project) {
      if (project !== null) {
        assertValid(validateProject(project));
        project = { ...clone(project), status: project.status ?? PROJECT_STATUS.REQUESTED };
      }
      this.#setObject('currentProject', project, EVENTS.PROJECT_CHANGED);
    }

    getProjectStatus() {
      return this.#data.currentProject ? this.#data.currentProject.status : null;
    }

    /**
     * 사업 단계를 다음 단계로만 넘긴다. 건너뛰거나 되돌릴 수 없다.
     * 같은 단계를 두 번 처리하는 실수(중복 계약 등)를 여기서 한 번 더 막는다.
     * @returns {{ ok: true, status: string } | { ok: false, reason: string }}
     */
    setProjectStatus(next) {
      const project = this.#data.currentProject;
      if (!project) return { ok: false, reason: REASON.INVALID_STATE };
      if (!(PROJECT_TRANSITIONS[project.status] || []).includes(next)) return { ok: false, reason: REASON.INVALID_STATE };
      const from = project.status;
      project.status = next;
      this.#publish(EVENTS.PROJECT_STATUS_CHANGED, { from, to: next });
      this.#publish(EVENTS.STATE_CHANGED, { key: 'currentProject' });
      return { ok: true, status: next };
    }

    getSuppliers() { return clone(this.#data.suppliers); }
    setSuppliers(suppliers) {
      if (!Array.isArray(suppliers)) throw new TypeError('업체 목록은 배열이어야 합니다');
      suppliers.forEach((s, i) => assertValid(validateSupplier(s).map((m) => `[${i}] ${m}`)));
      this.#data.suppliers = clone(suppliers);
      this.#changed('suppliers', EVENTS.SUPPLIERS_CHANGED, clone(suppliers));
    }

    getContract() { return clone(this.#data.contract); }
    setContract(contract) {
      if (contract !== null) assertValid(validateContract(contract));
      this.#setObject('contract', contract, EVENTS.CONTRACT_CHANGED);
    }

    getDelivery() { return clone(this.#data.delivery); }
    setDelivery(delivery) {
      if (delivery !== null) assertValid(validateDelivery(delivery));
      this.#setObject('delivery', delivery, EVENTS.DELIVERY_CHANGED);
    }

    getEvaluation() { return clone(this.#data.evaluation); }
    setEvaluation(evaluation) {
      if (evaluation !== null) assertValid(validateEvaluation(evaluation));
      this.#setObject('evaluation', evaluation, EVENTS.EVALUATION_CHANGED);
    }

    #setObject(key, value, event) {
      this.#data[key] = clone(value);
      this.#changed(key, event, clone(value));
    }

    // ---------- 시설 ----------

    getFacilities() {
      return clone(this.#data.facilities);
    }

    getFacilityState(facilityId) {
      return clone(this.#data.facilities[facilityId]);
    }

    /** 시설 상태: { stage: FACILITY_STAGE, ... } */
    setFacilityState(facilityId, state) {
      if (typeof facilityId !== 'string' || facilityId === '') throw new TypeError('facilityId는 문자열이어야 합니다');
      assertValid(validateFacilityState(state));
      this.#data.facilities[facilityId] = clone(state);
      this.#changed('facilities', EVENTS.FACILITY_CHANGED, { facilityId, state: clone(state) });
    }

    // ---------- 관청 인원 · 후보 ----------

    getStaff() { return clone(this.#data.staff); }

    /** 정원 승인, 업무석 추가, 동료 선발 결과를 저장한다. */
    setStaff(staff) {
      assertValid(validateStaff(staff));
      this.#data.staff = clone(staff);
      this.#changed('staff', EVENTS.STAFF_CHANGED, clone(staff));
    }

    /** 공개된 후보 목록. 아직 없으면 null. 한 번 생성한 후보는 저장해 같은 후보를 유지한다. */
    getCandidates() { return clone(this.#data.candidates); }

    setCandidates(candidates) {
      if (candidates !== null) {
        if (!Array.isArray(candidates)) throw new TypeError('후보 목록은 배열 또는 null이어야 합니다');
        candidates.forEach((c, i) => assertValid(validateCandidate(c).map((m) => `[${i}] ${m}`)));
        if (new Set(candidates.map((c) => c.id)).size !== candidates.length) throw new TypeError('후보 ID가 중복되었습니다');
      }
      this.#data.candidates = clone(candidates);
      this.#changed('candidates', EVENTS.CANDIDATES_CHANGED, clone(candidates));
    }

    // ---------- 전체 ----------

    /** 디버그·저장용 전체 복사본 */
    getSnapshot() {
      return clone(this.#data);
    }

    /** 새 게임. 구독은 유지한다. */
    reset() {
      this.#data = GameState.#createData(this.#initial);
      this.#publish(EVENTS.STATE_RESET, this.getSnapshot());
      this.#publish(EVENTS.STATE_CHANGED, { key: '*' });
    }

    /** 저장 데이터 (기능정의서 F-18) */
    toJSON() {
      return { version: SAVE_VERSION, gameState: this.getSnapshot() };
    }

    /**
     * 저장 데이터를 불러온다. 형식이 맞지 않으면 상태를 바꾸지 않는다.
     * @returns {{ ok: true } | { ok: false, reason: 'EMPTY' | 'CORRUPTED' | 'VERSION_MISMATCH' }}
     */
    load(saved) {
      let data = saved;
      if (data === null || data === undefined || data === '') return { ok: false, reason: 'EMPTY' };
      try {
      if (typeof data === 'string') data = JSON.parse(data);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'CORRUPTED' };
      if (data.version !== SAVE_VERSION) return { ok: false, reason: 'VERSION_MISMATCH' };
      const g = data.gameState;
      const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
      if (!isPlainObject(g) || !Number.isInteger(g.budget) || g.budget < 0 || validateDate(g.currentDate).length ||
          !Array.isArray(g.suppliers) || g.suppliers.some((v) => validateSupplier(v).length) ||
          !isPlainObject(g.facilities) || !g.staff || validateStaff(g.staff).length ||
          !(g.currentProject === null || validateProject(g.currentProject).length === 0) ||
          !(g.contract === null || validateContract(g.contract).length === 0) ||
          !(g.delivery === null || validateDelivery(g.delivery).length === 0) ||
          !(g.evaluation === null || validateEvaluation(g.evaluation).length === 0) ||
          !(g.candidates === null || (Array.isArray(g.candidates) && g.candidates.every((v) => validateCandidate(v).length === 0) && new Set(g.candidates.map((v) => v.id)).size === g.candidates.length)) ||
          Object.values(g.facilities).some((v) => validateFacilityState(v).length)) return { ok: false, reason: 'CORRUPTED' };
      // 후보 목록이 실제 후보 집합을 보존할 때만 채용 참조를 검증한다.
      if (g.candidates && g.candidates.length) {
        const candidateIds = new Set(g.candidates.map((c) => c.id));
        if (g.staff.hired.some((c) => !candidateIds.has(c.id))) return { ok: false, reason: 'CORRUPTED' };
      }
      const next = { ...GameState.#createData(this.#initial), ...clone(g) };
      this.#data = next;
      this.#publish(EVENTS.STATE_RESET, this.getSnapshot());
      this.#publish(EVENTS.STATE_CHANGED, { key: '*' });
      return { ok: true };
      } catch { return { ok: false, reason: 'CORRUPTED' }; }
    }
  }

  Object.assign(CORE_NS, { SAVE_VERSION, GameState });
})();
