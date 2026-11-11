/**
 * 게임 설정과 공통 상수. (담당: 팀원 1)
 * Phaser에 의존하지 않는 값만 둔다. Phaser 설정 객체는 createPhaserConfig에서 만든다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const CONFIG_NS = (TYCOON.config = TYCOON.config || {});

  const GAME_WIDTH = 1280;
  const GAME_HEIGHT = 720;

  /**
   * 표시 배율. 캔버스 내부 크기는 항상 1280×720이고, 화면에는 창에 들어가는
   * 가장 큰 배율로만 표시한다. 1920×1080(1.5배)에서 픽셀이 고르게 보이려면
   * 그래픽을 2px 단위로 그려야 한다(CLAUDE.md 6장 Phaser, Full HD 비정수 배율 문제).
   */
  const DISPLAY_ZOOMS = [1.5, 1, 0.5];

  function pickZoom(windowWidth, windowHeight) {
    for (const zoom of DISPLAY_ZOOMS) {
      if (GAME_WIDTH * zoom <= windowWidth && GAME_HEIGHT * zoom <= windowHeight) return zoom;
    }
    return DISPLAY_ZOOMS[DISPLAY_ZOOMS.length - 1];
  }

  /** game.registry에 GameState를 넣을 때 쓰는 키 */
  const GAME_STATE_KEY = 'gameState';

  const SCENE_KEYS = Object.freeze({
    BOOT: 'BootScene',
    PRELOAD: 'PreloadScene',
    TITLE: 'TitleScene',
    OFFICE: 'OfficeScene',
    VILLAGE: 'VillageScene',
    HALL: 'HallScene',
    UI: 'UIScene',
    ENDING: 'EndingScene'
  });

  /**
   * 새 게임의 초기값.
   * - budget: TEMP 사업예산(만원). 기획서에 수치가 없다. 확정되면 이 값만 고친다.
   * - currentDate: 1월차 월초 계획에서 시작 (기획서 v0.8 3장)
   * - staff: 플레이어 혼자, 업무석 1개 (기획서 v0.8 4장)
   */
  const INITIAL_STATE = Object.freeze({
    budget: 300,
    currentDate: { month: 1, phase: 'PLAN', pending: null },
    staff: { headcount: 1, seats: 1, hired: [] }
  });

  /**
   * 더블클릭(file://)으로 실행하기 위한 설정.
   * - CANVAS 렌더러: WebGL은 file://의 이미지를 보안상 거부한다(확인함).
   * - imageLoadType HTMLImageElement: 기본(XHR) 로딩은 file://에서 막힌다.
   * - disableWebAudio: Web Audio는 소리 파일을 XHR로 읽어서 file://에서 막힌다. HTML5 오디오를 쓴다.
   */
  function createPhaserConfig(Phaser, scenes, windowSize) {
    return {
      type: Phaser.CANVAS,
      loader: { imageLoadType: 'HTMLImageElement' },
      audio: { disableWebAudio: true },
      parent: 'game',
      backgroundColor: '#1b2232',
      pixelArt: true,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.NONE,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        zoom: pickZoom(windowSize.width, windowSize.height)
      },
      scene: scenes
    };
  }

  /** 주소 뒤에 ?debug 를 붙이면 통합 확인용 버튼과 디버그 접근을 켠다. */
  const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

  Object.assign(CONFIG_NS, { GAME_WIDTH, GAME_HEIGHT, DISPLAY_ZOOMS, pickZoom, GAME_STATE_KEY, SCENE_KEYS, INITIAL_STATE, createPhaserConfig, DEBUG });
})();
