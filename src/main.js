/**
 * 진입점. (담당: 팀원 1)
 * index.html이 마지막으로 불러오는 파일이다. 이 시점에는 모든 데이터, 시스템, 화면이
 * TYCOON 아래에 등록되어 있다.
 *
 * - GameState 하나와 TutorialFlow 하나를 만들어 모든 Scene이 같이 쓴다.
 * - TYCOON.app: 실행 중에만 쓰는 객체(흐름, 화면 어댑터, 안내 대기 이벤트, 테스트용 버튼 위치).
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const { createPhaserConfig, DEBUG, GAME_STATE_KEY, INITIAL_STATE, pickZoom } = TYCOON.config;
  const { GameState } = TYCOON.core;
  const S = TYCOON.scenes;

  const gameState = new GameState(INITIAL_STATE);
  const flow = new TYCOON.systems.TutorialFlow({ gameState });
  const autoSave = new TYCOON.core.BrowserSave();
  const restored = autoSave.restore(flow);

  TYCOON.app = {
    flow,
    autoSave,
    saveStatus: autoSave.lastResult,
    resumeOnLoad: restored.ok,
    // 화면 코드가 쓰는 얇은 어댑터: 읽기는 view(), 바꾸기는 dispatch(), 알림은 subscribe()
    store: {
      getState: () => flow.view(),
      dispatch: (type, payload) => flow.dispatch(type, payload),
      subscribe: (fn) => flow.subscribe(fn)
    },
    pendingEvents: [],
    debugTargets: {}
  };
  autoSave.attach(flow, (status) => { TYCOON.app.saveStatus = status; });

  const scenes = [S.BootScene, S.PreloadScene, S.TitleScene, S.OfficeScene, S.VillageScene, S.HallScene, S.UIScene, S.EndingScene];
  scenes.forEach((scene, i) => {
    if (!scene) throw new Error(`Scene 목록 ${i}번이 비어 있습니다. index.html의 <script> 순서와 이름을 확인하세요`);
  });
  const game = new Phaser.Game(createPhaserConfig(Phaser, scenes, { width: window.innerWidth, height: window.innerHeight }));
  game.registry.set(GAME_STATE_KEY, gameState);
  TYCOON.app.game = game;

  window.addEventListener('resize', () => {
    const zoom = pickZoom(window.innerWidth, window.innerHeight);
    if (game.scale.zoom !== zoom) game.scale.setZoom(zoom);
  });

  // ?debug 일 때만 콘솔과 자동 테스트에서 게임에 접근할 수 있게 한다.
  if (DEBUG) {
    window.__TYCOON_DEBUG__ = { game, flow, getState: () => gameState };
  }
})();
