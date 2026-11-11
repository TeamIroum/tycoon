/**
 * 납품·일부 납품 사건·현장 검사 (담당: 팀원 3, 기능정의서 F-09 ~ F-11)
 * 프로토타입에서 출발했다. 기획 미정 사항(기능정의서 9장)은 TEMP로 동작한다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SYSTEMS = (TYCOON.systems = TYCOON.systems || {});
  const { ok, fail, REASON, PROJECT_STATUS, RESULT_EVENTS, DATE_PHASE, ISSUE_TYPE, DELIVERY_STATUS, ABILITY_KEYS } = TYCOON.core;

  // ---------- F-09 ~ F-11 납품, 일부 납품 사건, 현장 검사 ----------
  class DeliverySystem {
    constructor(gameState, tutorial, procurement) {
      this.state = gameState;
      this.tutorial = tutorial;
      this.procurement = procurement; // 실제 필요 수량 계산에 쓴다
    }

    /** 계약된 사업만 납품을 시작한다. 튜토리얼 사건: 침구 일부만 먼저 도착 */
    start() {
      const contract = this.state.getContract();
      const project = this.state.getCurrentProject();
      if (!contract || project.status !== PROJECT_STATUS.CONTRACTED) return fail(REASON.INVALID_STATE);
      const pd = this.tutorial.partialDelivery;
      const qty = Object.fromEntries(contract.items.map((i) => [i.itemId, i.quantity]));
      const first = Math.min(pd.firstBatch, qty[pd.itemId]);
      this.state.setProjectStatus(PROJECT_STATUS.DELIVERING);
      const issue = { type: ISSUE_TYPE.MISSING_QUANTITY, itemId: pd.itemId, expected: qty[pd.itemId], actual: first, resolved: false };
      this.state.setDelivery({
        contractId: contract.id,
        status: DELIVERY_STATUS.DELIVERED,
        delivered: contract.items.map((i) => ({ itemId: i.itemId, quantity: i.itemId === pd.itemId ? first : i.quantity })),
        issues: [issue],
        negotiation: { supplier: false, requester: false }
      });
      this.state.notify(RESULT_EVENTS.DELIVERY_ARRIVED, { contractId: contract.id });
      this.state.notify(RESULT_EVENTS.DELIVERY_ISSUE_FOUND, { issue });
      return ok();
    }

    /** 공방과 일정 협의 / 요청기관에 지급 순서 확인. 둘 다 끝나면 나머지가 들어온다. */
    respond(kind) {
      const d = this.state.getDelivery();
      if (!d || !d.issues.some((i) => !i.resolved)) return fail(REASON.INVALID_STATE);
      if (d.negotiation[kind]) return fail(REASON.ALREADY_DONE);
      d.negotiation[kind] = true;
      let resolved = false;
      if (d.negotiation.supplier && d.negotiation.requester) {
        for (const issue of d.issues) {
          if (issue.resolved) continue;
          issue.resolved = true;
          d.delivered = d.delivered.map((x) => (x.itemId === issue.itemId ? { ...x, quantity: issue.expected } : x));
          this.state.notify(RESULT_EVENTS.DELIVERY_ISSUE_RESOLVED, { issue });
        }
        resolved = true;
      }
      this.state.setDelivery(d);
      if (resolved) this.state.setProjectStatus(PROJECT_STATUS.INSPECTING);
      return ok({ resolved });
    }

    /**
     * 현장 검사: 계약과 납품을 비교한다. 검사 주체는 요청기관이고 플레이어는 결과를 확인한다.
     * TEMP: 부족 수량을 틀리게 확정했다면 여기서 드러나 같은 공방에 보완 납품을 요청한다
     * (기능정의서 F-11 미정 항목. 기획 확정 전 임시 처리).
     */
    inspect() {
      const project = this.state.getCurrentProject();
      const contract = this.state.getContract();
      const d = this.state.getDelivery();
      if (!project || project.status !== PROJECT_STATUS.INSPECTING || !contract || !d || d.status === DELIVERY_STATUS.INSPECTED) return fail(REASON.INVALID_STATE);
      const findings = [];
      const actual = Object.fromEntries(d.delivered.map((x) => [x.itemId, x.quantity]));
      const contractQty = Object.fromEntries(contract.items.map((x) => [x.itemId, x.quantity]));
      const need = this.procurement.trueShortage();
      const expected = {};
      // TEMP 수량 보정은 최종 필요량을 높일 수 있다. 보완분을 여기 다시 더하지 않는다.
      for (const itemId of Object.keys(contractQty)) expected[itemId] = Math.max(contractQty[itemId], need[itemId] || 0);
      const short = {};
      for (const [itemId, quantity] of Object.entries(expected)) short[itemId] = Math.max(0, quantity - (actual[itemId] || 0));
      let supplement = null;
      if (short.mattress || short.bedding) {
        const supplier = this.state.getSuppliers().find((s) => s.id === contract.supplierId);
        if (!supplier || !supplier.unitPrice) return fail(REASON.INVALID_STATE);
        const amount = short.mattress * supplier.unitPrice.mattress + short.bedding * supplier.unitPrice.bedding;
        const spent = this.state.spendBudget(amount);
        if (!spent.ok) return fail(spent.reason);
        d.delivered = d.delivered.map((x) => ({ ...x, quantity: x.quantity + (short[x.itemId] || 0) }));
        supplement = { ...short, amount };
        const parts = [short.mattress ? '매트 ' + short.mattress + '개' : '', short.bedding ? '침구 ' + short.bedding + '세트' : ''].filter(Boolean).join(', ');
        findings.push('계약 수량 중 ' + parts + '가 부족했습니다.');
        findings.push('같은 공방에 보완 납품을 요청해 ' + amount + '만원을 추가 집행했습니다.');
      }
      const finalQty = Object.fromEntries(d.delivered.map((x) => [x.itemId, x.quantity]));
      const expectedIds = Object.keys(expected);
      const quantityPassed = Object.keys(finalQty).length === expectedIds.length && expectedIds.every((itemId) => finalQty[itemId] >= expected[itemId]);
      const specsPassed = Array.isArray(contract.specs) && project.requiredSpecs.every((spec) => contract.specs.includes(spec));
      const passed = quantityPassed && specsPassed;
      if (!quantityPassed) findings.push('최종 납품 수량이 계약 수량 또는 실제 필요 수량에 미달합니다.');
      if (!specsPassed) findings.push('계약 규격에 필수 규격이 모두 포함되지 않았습니다.');
      if (passed && !findings.length) findings.push('계약한 수량과 필수 규격대로 납품됐습니다.');
      d.status = DELIVERY_STATUS.INSPECTED;
      d.supplement = supplement ? { ...supplement, temp: true } : null;
      d.inspection = { passed, quantityPassed, specsPassed };
      d.findings = findings;
      this.state.setDelivery(d);
      this.state.notify(RESULT_EVENTS.INSPECTION_COMPLETED, { passed, findings });
      return passed ? ok({ passed, findings, supplement: d.supplement }) : fail(REASON.NOT_ELIGIBLE, { findings, supplement: d.supplement });
    }
  }

  Object.assign(SYSTEMS, { DeliverySystem });
})();
