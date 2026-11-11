/**
 * 게임 초기 설정. (담당: 팀원 1)
 * main.js가 만든 GameState가 registry에 있는지 확인하고, 임시 그래픽 텍스처를 만든 뒤
 * PreloadScene으로 넘긴다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SCENES_NS = (TYCOON.scenes = TYCOON.scenes || {});
  const { GAME_STATE_KEY, SCENE_KEYS } = TYCOON.config;
  const { goTo } = TYCOON.core;

  class BootScene extends Phaser.Scene {
    constructor() {
      super(SCENE_KEYS.BOOT);
    }

    create() {
      if (!this.game.registry.has(GAME_STATE_KEY)) throw new Error('GameState가 없습니다. main.js를 확인하세요');
      TYCOON.ui.art.makeTextures(this); // 인물·트럭 임시 텍스처 (에셋이 들어오면 PreloadScene으로 대체)
      goTo(this, SCENE_KEYS.PRELOAD);
    }
  }

  Object.assign(SCENES_NS, { BootScene });
})();
