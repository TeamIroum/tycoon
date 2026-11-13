/**
 * 에셋 로딩. (담당: 팀원 1)
 * 목록은 src/config/assets.js.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SCENES_NS = (TYCOON.scenes = TYCOON.scenes || {});
  const { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } = TYCOON.config;
  const { ASSETS } = TYCOON.config;
  const { goTo } = TYCOON.core;

  class PreloadScene extends Phaser.Scene {
    constructor() {
      super(SCENE_KEYS.PRELOAD);
    }

    preload() {
      const barWidth = 480;
      const x = (GAME_WIDTH - barWidth) / 2;
      const y = GAME_HEIGHT / 2;
      this.add.rectangle(x, y, barWidth, 16, 0x2a3550).setOrigin(0);
      const bar = this.add.rectangle(x, y, 0, 16, 0x2f7a6b).setOrigin(0);
      this.add.text(GAME_WIDTH / 2, y - 36, '불러오는 중', { fontFamily: 'sans-serif', fontSize: '16px', color: '#efe7d2' }).setOrigin(0.5);
      this.load.on('progress', (p) => { bar.width = Math.round(barWidth * p / 2) * 2; });
      this.load.on('loaderror', (file) => console.error('[Preload] 에셋을 불러오지 못했습니다:', file.key, file.url));

      for (const asset of ASSETS) {
        if (asset.type === 'image') this.load.image(asset.key, asset.url);
        else if (asset.type === 'audio') this.load.audio(asset.key, asset.url);
        else console.warn('[Preload] 지원하지 않는 에셋 형식:', asset.type, asset.key);
      }
    }

    create() {
      // 실제 이미지 로딩이 끝난 뒤 인물·트럭 임시 텍스처를 만든다. Phaser 3.80.1의 generateTexture는 같은 키의
      // 이미지 텍스처를 덮어쓰지 않으므로, 실제 이미지가 있는 키는 그대로 두고 없거나 로드에 실패한 키만 채운다.
      // Phaser 버전을 바꾸면 tests/browser/texture-fallback-cdp.mjs로 다시 확인한다.
      TYCOON.ui.art.makeTextures(this);
      if (TYCOON.app.resumeOnLoad) {
        TYCOON.app.resumeOnLoad = false;
        // 진행 중 저장은 관청 화면으로 바로 이어 연다. 튜토리얼 완료(END) 저장은 타이틀을 보여 주고,
        // 저장은 지우지 않는다('새로 시작'이 GAME_STARTED로 새 게임 상태로 교체한다).
        if (TYCOON.app.store.getState().phase !== 'END') {
          TYCOON.app.pendingEvents = [];
          this.scene.start(SCENE_KEYS.OFFICE);
          this.scene.launch(SCENE_KEYS.UI);
          return;
        }
      }
      goTo(this, SCENE_KEYS.TITLE);
    }
  }

  Object.assign(SCENES_NS, { PreloadScene });
})();
