/**
 * 조달·계약 시스템 (담당: 팀원 2, 기능정의서 F-04 ~ F-08)
 *
 * 요청 확인, 재고 확인과 부족 수량, 자격 검증, 제안 비교, 계약.
 * 프로토타입에서 출발했다. 기획 미정 사항(기능정의서 9장)은 TEMP로 동작한다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SYSTEMS = (TYCOON.systems = TYCOON.systems || {});
  const { ok, fail, REASON, PROJECT_STATUS, RESULT_EVENTS, DATE_PHASE } = TYCOON.core;

  const EMPTY_REVIEW = { residents: false, userSpec: false, inventoryCount: false, mattressCondition: false, hintShown: false };

  class ProcurementSystem {
    constructor(gameState, tutorial, balance) {
      this.state = gameState;
      this.tutorial = tutorial;
      this.balance = balance;
    }

    // ---------- F-04, F-05: 요청서 확인과 부족 수량 ----------

    getReview() {
      const project = this.state.getCurrentProject();
      return { ...EMPTY_REVIEW, ...(project && project.review) };
    }

    /** 요청 확인은 1월차 월초, 부족 수량을 확정하기 전에만 할 수 있다. */
    #canReview() {
      const project = this.state.getCurrentProject();
      const date = this.state.getCurrentDate();
      return project && !project.shortage && date.month === 1 && date.phase === DATE_PHASE.PLAN;
    }

    #saveReview(change) {
      const project = this.state.getCurrentProject();
      project.review = { ...EMPTY_REVIEW, ...project.review, ...change };
      this.state.setCurrentProject(project);
      if (project.status === PROJECT_STATUS.REQUESTED) this.state.setProjectStatus(PROJECT_STATUS.REVIEWING);
    }

    checkResidents() {
      if (!this.#canReview()) return fail(REASON.INVALID_STATE);
      this.#saveReview({ residents: true });
      return ok();
    }

    checkUserSpec() {
      if (!this.#canReview()) return fail(REASON.INVALID_STATE);
      if (this.getReview().userSpec) return fail(REASON.ALREADY_DONE);
      const project = this.state.getCurrentProject();
      const add = this.tutorial.userSpecCheck.addsRequiredSpec;
      if (!project.requiredSpecs.includes(add)) project.requiredSpecs = [...project.requiredSpecs, add];
      project.review = { ...EMPTY_REVIEW, ...project.review, userSpec: true };
      this.state.setCurrentProject(project);
      if (project.status === PROJECT_STATUS.REQUESTED) this.state.setProjectStatus(PROJECT_STATUS.REVIEWING);
      return ok();
    }

    countInventory() {
      if (!this.#canReview()) return fail(REASON.INVALID_STATE);
      this.#saveReview({ inventoryCount: true });
      return ok();
    }

    inspectMattress() {
      if (!this.#canReview()) return fail(REASON.INVALID_STATE);
      if (!this.getReview().inventoryCount) return fail(REASON.INVALID_STATE, { need: 'inventoryCount' });
      this.#saveReview({ mattressCondition: true });
      return ok();
    }

    requestComplete() {
      const r = this.getReview();
      return r.residents && r.userSpec && r.inventoryCount;
    }

    /** 플레이어가 확인한 정보로 계산한 부족 수량 */
    knownShortage() {
      const { residents, inventory } = this.tutorial;
      const checked = this.getReview().mattressCondition;
      return {
        mattress: Math.max(0, residents.total - (inventory.mattress.count - (checked ? inventory.mattress.wet : 0))),
        bedding: Math.max(0, residents.total - (inventory.bedding.count - (checked ? inventory.bedding.wet : 0)))
      };
    }

    /** 실제로 필요한 수량 (모든 재고 상태 반영) */
    trueShortage() {
      const { residents, inventory } = this.tutorial;
      return {
        mattress: Math.max(0, residents.total - (inventory.mattress.count - inventory.mattress.wet)),
        bedding: Math.max(0, residents.total - (inventory.bedding.count - inventory.bedding.wet))
      };
    }

    /**
     * 부족 수량 확정. 매트 상태를 점검하지 않았으면 힌트가 켜져 있을 때 한 번만 멈추고 알린다(F-05).
     * @returns {{ ok: true, hint?: 'WET', shortage?: object } | { ok: false, reason }}
     */
    confirmShortage({ hintsOn }) {
      if (!this.#canReview()) return fail(REASON.INVALID_STATE);
      if (!this.requestComplete()) return fail(REASON.INVALID_STATE, { need: 'request' });
      const review = this.getReview();
      if (!review.mattressCondition && hintsOn && !review.hintShown) {
        this.#saveReview({ hintShown: true });
        return ok({ hint: 'WET' });
      }
      const project = this.state.getCurrentProject();
      project.shortage = this.knownShortage();
      this.state.setCurrentProject(project);
      return ok({ shortage: project.shortage });
    }

    // ---------- F-06, F-07: 자격 검증과 비교 ----------

    /** 1월차 진행이 시작되면 확정 수량 기준으로 제안이 들어온다. */
    openProposals() {
      const { shortage } = this.state.getCurrentProject();
      const suppliers = this.tutorial.proposals.map((p) => ({
        id: p.id, name: p.name, kind: p.kind, specs: p.specs.slice(), quality: p.quality,
        deliveryDays: p.deliveryDays, capacity: { ...p.capacity }, unitPrice: { ...p.unitPrice },
        price: p.unitPrice.mattress * shortage.mattress + p.unitPrice.bedding * shortage.bedding
      }));
      this.state.setSuppliers(suppliers);
      return ok();
    }

    /** 필수 조건 (하나라도 못 맞추면 부적격). 사유 목록을 돌려준다. */
    checkEligibility(supplier, project) {
      const reasons = [];
      if (supplier.price > Math.min(this.state.getBudget(), project.budgetLimit)) reasons.push('예산 초과');
      for (const spec of project.requiredSpecs) {
        if (!supplier.specs.includes(spec)) reasons.push(`필수 규격 미충족: ${spec}`);
      }
      const s = project.shortage;
      if (supplier.capacity.mattress < s.mattress || supplier.capacity.bedding < s.bedding) reasons.push('요청 수량 공급 불가');
      if (supplier.deliveryDays > this.balance.deadlineDays) reasons.push('납품 기한 초과');
      return { eligible: reasons.length === 0, reasons };
    }

    /** 적격 업체만 가격·품질·납기로 비교한다. 가중치는 TEMP(초기 검토안). */
    compareSuppliers() {
      const project = this.state.getCurrentProject();
      const w = this.balance.weights;
      const rows = this.state.getSuppliers().map((s) => ({ ...s, ...this.checkEligibility(s, project), score: null, scoreParts: null }));
      const eligible = rows.filter((r) => r.eligible);
      if (eligible.length) {
        const minPrice = Math.min(...eligible.map((r) => r.price));
        const minDays = Math.min(...eligible.map((r) => r.deliveryDays));
        for (const r of eligible) {
          const parts = {
            price: round1(w.price * (minPrice / r.price)),
            quality: round1(w.quality * (r.quality / this.balance.qualityMax)),
            delivery: round1(w.delivery * (minDays / r.deliveryDays))
          };
          r.scoreParts = parts;
          r.score = round1(parts.price + parts.quality + parts.delivery);
        }
      }
      const winner = eligible.slice().sort((a, b) => b.score - a.score)[0] || null;
      return { rows, winnerId: winner ? winner.id : null };
    }

    // ---------- F-08: 계약 ----------

    /** 1순위 업체와만 계약한다. 예산 차감, 계약 저장, 단계 전환을 한 함수에서 처리한다. */
    createContract(supplierId) {
      const project = this.state.getCurrentProject();
      if (!project || project.status !== PROJECT_STATUS.REVIEWING) return fail(REASON.INVALID_STATE);
      if (this.state.getContract()) return fail(REASON.ALREADY_DONE);
      const { rows, winnerId } = this.compareSuppliers();
      const row = rows.find((r) => r.id === supplierId);
      if (!row) return fail(REASON.NOT_FOUND);
      if (!row.eligible || row.id !== winnerId) return fail(REASON.NOT_ELIGIBLE, { winnerId });

      const spent = this.state.spendBudget(row.price);
      if (!spent.ok) {
        this.state.notify(RESULT_EVENTS.CONTRACT_REJECTED, { supplierId, reason: spent.reason });
        return fail(spent.reason);
      }
      const date = this.state.getCurrentDate();
      const contract = {
        id: 'C01', projectId: project.id, supplierId, supplierName: row.name,
        items: [{ itemId: 'mattress', quantity: project.shortage.mattress }, { itemId: 'bedding', quantity: project.shortage.bedding }],
        specs: row.specs.slice(),
        amount: row.price, deliveryDays: row.deliveryDays,
        signedDate: { month: date.month, phase: date.phase }, dueDate: project.dueDate
      };
      this.state.setContract(contract);
      this.state.setProjectStatus(PROJECT_STATUS.CONTRACTED);
      this.state.notify(RESULT_EVENTS.CONTRACT_CREATED, { contractId: contract.id, supplierId, amount: row.price });
      return ok({ contractId: contract.id });
    }
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  Object.assign(SYSTEMS, { ProcurementSystem });
})();
