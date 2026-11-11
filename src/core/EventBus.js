/**
 * 게임 상태 변경을 알리는 작은 이벤트 버스. (담당: 팀원 1)
 *
 * Phaser의 EventEmitter를 쓰지 않는 이유: GameState를 Phaser 없이
 * Node 테스트에서도 실행하기 위해서다(CLAUDE.md 6장 스크립트 규칙).
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const CORE_NS = (TYCOON.core = TYCOON.core || {});

  class EventBus {
    #handlers = new Map();

    /** 구독하고, 구독을 끊는 함수를 돌려준다. */
    on(event, handler) {
      if (typeof handler !== 'function') throw new TypeError('handler는 함수여야 합니다');
      if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
      this.#handlers.get(event).add(handler);
      return () => this.off(event, handler);
    }

    off(event, handler) {
      const set = this.#handlers.get(event);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) this.#handlers.delete(event);
    }

    /** 한 구독자의 오류가 다른 구독자 실행을 막지 않게 한다. */
    emit(event, payload) {
      const set = this.#handlers.get(event);
      if (!set) return;
      for (const handler of [...set]) {
        try {
          handler(payload);
        } catch (error) {
          console.error(`[EventBus] '${event}' 처리 중 오류`, error);
        }
      }
    }

    listenerCount(event) {
      return this.#handlers.get(event)?.size ?? 0;
    }

    clear() {
      this.#handlers.clear();
    }
  }

  Object.assign(CORE_NS, { EventBus });
})();
