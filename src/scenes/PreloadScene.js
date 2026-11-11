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
      if (TYCOON.app.resumeOnLoad) {
        TYCOON.app.resumeOnLoad = false;
        TYCOON.app.pendingEvents = [];
        this.scene.start(SCENE_KEYS.OFFICE);
        this.scene.launch(SCENE_KEYS.UI);
        return;
      }
      goTo(this, SCENE_KEYS.TITLE);
    }
  }

  Object.assign(SCENES_NS, { PreloadScene });
})();
