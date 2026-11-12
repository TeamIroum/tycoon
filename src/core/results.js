/**
 * System 함수의 공통 결과 형식. (담당: 팀원 1)
 *
 * 모든 System 함수는 예외를 던지지 않고 결과를 돌려준다.
 *   성공: { ok: true, ...값 }
 *   실패: { ok: false, reason: REASON.*, detail? }
 * UI(팀원 4)는 reason으로 안내 문구를 고른다. 문구는 UI가 정한다.
 * 예외(throw)는 코드 실수(잘못된 데이터 모양 등)에만 쓴다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const CORE_NS = (TYCOON.core = TYCOON.core || {});

  const REASON = Object.freeze({
    INVALID_AMOUNT: 'INVALID_AMOUNT',           // 금액이 양의 정수가 아님
    INSUFFICIENT_BUDGET: 'INSUFFICIENT_BUDGET', // 예산 부족
    NOT_FOUND: 'NOT_FOUND',                     // 없는 id
    NOT_ELIGIBLE: 'NOT_ELIGIBLE',               // 필수 요구조건 미충족 업체
    ALREADY_DONE: 'ALREADY_DONE',               // 이미 처리됨(중복 계약 등)
    INVALID_STATE: 'INVALID_STATE',             // 지금 단계에서 할 수 없는 일
    INSPECTION_FAILED: 'INSPECTION_FAILED'      // 정식 검사 실패
  });

  /**
   * TutorialFlow.dispatch()에서만 생기는 실패 이유. System 결과(REASON)와 이름이 겹치지 않는다.
   * dispatch 실패 반환의 reason은 REASON.* 또는 FLOW_REASON.* 중 하나다.
   */
  const FLOW_REASON = Object.freeze({
    ROLLBACK_FAILED: 'ROLLBACK_FAILED',         // 롤백 실패 또는 fatal 중 명령 (code와 같은 값)
    COMMAND_BUSY: 'COMMAND_BUSY',               // 이전 명령 처리 중 재호출
    UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',         // 등록되지 않은 명령
    COMMAND_FAILED: 'COMMAND_FAILED'            // 처리 중 예외 또는 reason 없는 실패
  });

  const ok = (values = {}) => ({ ok: true, ...values });
  const fail = (reason, detail) => (detail === undefined ? { ok: false, reason } : { ok: false, reason, detail });

  Object.assign(CORE_NS, { REASON, FLOW_REASON, ok, fail });
})();
