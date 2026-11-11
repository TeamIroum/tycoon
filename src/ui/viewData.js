/**
 * 화면용 데이터 묶음과 도우미 (담당: 팀원 4)
 * 화면 코드가 읽기 쉬운 모양으로 데이터를 묶고, 상태가 바뀔 때 다시 그리게 한다. 규칙은 없다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const UI = (TYCOON.ui = TYCOON.ui || {});
  const D = TYCOON.data;
  const { listenTo, EVENTS } = TYCOON.core;

  UI.SCENARIO = {
    project: { ...D.TUTORIAL_PROJECT, residents: D.RESIDENTS, inventory: D.INVENTORY, userSpecCheck: D.USER_SPEC_CHECK, partialDelivery: D.PARTIAL_DELIVERY },
    residentReviews: D.RESIDENT_REVIEWS,
    dialogs: D.DIALOGS,
    dialogTriggers: D.DIALOG_TRIGGERS
  };

  /** 비교 결과를 카드 표시용으로 바꾼다 (사유의 규격 id → 이름, 일수 → 주) */
  UI.proposalRows = function () {
    const { rows, winnerId } = TYCOON.app.flow.compareSuppliers();
    return {
      winnerId,
      rows: rows.map((r) => ({
        id: r.id, name: r.name, kind: r.kind, cost: r.price, deliveryWeeks: Math.round(r.deliveryDays / 7),
        specs: r.specs, eligible: r.eligible, score: r.score, scoreParts: r.scoreParts,
        reasons: r.reasons.map((x) => x.replace(/필수 규격 미충족: (\w+)/, (_, id) => '필수 규격 미충족: ' + (D.SPECS[id] || id)))
      }))
    };
  };

  /**
   * 그림에 영향을 주는 값(pick)이 바뀔 때만 다시 그린다.
   * GameState 변경을 listenTo로 구독하므로 Scene 종료 시 자동으로 풀린다(CLAUDE.md 6장 Phaser).
   */
  UI.watchView = function (scene, pick, redraw) {
    let last = null;
    const check = () => {
      const view = TYCOON.app.flow.view();
      const key = JSON.stringify(pick(view));
      if (key !== last) { last = key; redraw(view); }
    };
    listenTo(scene, EVENTS.STATE_CHANGED, check);
    check();
  };

  UI.clearObjs = function (list) { list.forEach((o) => o.destroy()); list.length = 0; };
})();
