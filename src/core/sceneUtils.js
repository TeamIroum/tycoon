/**
 * Scene에서 GameState를 쓰는 공통 방법. (담당: 팀원 1)
 *
 * - GameState는 BootScene에서 한 번 만들어 game.registry에 넣는다.
 *   모든 Scene은 getGameState(this)로 같은 객체를 받는다.
 * - 구독은 listenTo로 한다. Scene이 종료(shutdown)되면 구독이 자동으로
 *   풀려서, 화면을 오갈 때 리스너가 쌓이지 않는다(CLAUDE.md 6장 Phaser).
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const CORE_NS = (TYCOON.core = TYCOON.core || {});
  const { GAME_STATE_KEY } = TYCOON.config;

  function getGameState(scene) {
    const state = scene.game.registry.get(GAME_STATE_KEY);
    if (!state) throw new Error('GameState가 없습니다. BootScene부터 시작했는지 확인하세요');
    return state;
  }

  function listenTo(scene, event, handler) {
    const off = getGameState(scene).on(event, handler);
    scene.events.once('shutdown', off);
    return off;
  }

  /**
   * 화면 전환. 현재 Scene은 종료(shutdown)되고 key Scene이 새로 시작된다.
   * 진행 데이터는 GameState에 있으므로 전환해도 유지된다.
   */
  function goTo(scene, key, data) {
    scene.scene.start(key, data);
  }

  Object.assign(CORE_NS, { getGameState, listenTo, goTo });
})();
