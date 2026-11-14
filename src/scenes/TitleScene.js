/**
 * 시작 화면 (담당: 팀원 1)
 * 새로 시작을 누르면 TutorialFlow로 새 게임을 만들고 관청 화면과 업무 UI를 연다.
 * 진입 시 남아 있는 관청·지역·강당·UI·엔딩 Scene을 멈춘다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SCENES = (TYCOON.scenes = TYCOON.scenes || {});
  const K = TYCOON.config.SCENE_KEYS;
  const { GAME_WIDTH } = TYCOON.config;

  const FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  const START = { x: GAME_WIDTH / 2 - 110, y: 380, w: 220, h: 52 };

  class TitleScene extends Phaser.Scene {
    constructor() { super({ key: K.TITLE }); }

    create() {
      // 타이틀로 오는 경로 중 일부(fatal '새 게임 시작', D 등급 '처음 화면으로')는 UIScene만 멈추고 월드 Scene을 남긴다.
      // 남은 Scene이 타이틀을 가리고 새 게임에서 월드 Scene이 겹치지 않도록, 실행 중인 화면 Scene을 모두 멈춘다.
      // 시작되지 않았거나 이미 멈춘 Scene은 건드리지 않는다(Phaser stop은 다음 단계에서 처리되며 shutdown에서 구독이 풀린다).
      [K.OFFICE, K.VILLAGE, K.HALL, K.UI, K.ENDING].forEach((key) => {
        if (this.scene.isActive(key) || this.scene.isPaused(key) || this.scene.isSleeping(key)) this.scene.stop(key);
      });
      this.add.text(GAME_WIDTH / 2, 240, '조달청 타이쿤', { fontFamily: FONT, fontSize: '48px', color: '#efe7d2' }).setOrigin(0.5);
      this.add.text(GAME_WIDTH / 2, 304, '조달 업무로 마을의 시설을 되살리는 경영 시뮬레이션', { fontFamily: FONT, fontSize: '18px', color: '#c9c0aa' }).setOrigin(0.5);
      this.startButton(() => {
        TYCOON.app.flow.newGame();
        TYCOON.app.pendingEvents = ['GAME_STARTED'];
        this.scene.start(K.OFFICE);
        this.scene.launch(K.UI);
      });
      TYCOON.app.debugTargets.titleStart = { ...START };
    }

    /** 눌렀다 같은 버튼에서 뗄 때만 실행한다(겹친 입력의 중복 실행 방지). */
    startButton(onClick) {
      const bg = this.add.rectangle(START.x, START.y, START.w, START.h, 0x2f7a6b).setOrigin(0).setStrokeStyle(2, 0x9fe0cf);
      this.add.text(START.x + START.w / 2, START.y + START.h / 2, '새로 시작', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      let pressed = false;
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => { pressed = true; bg.setFillStyle(0x24564f); });
      bg.on('pointerout', () => { pressed = false; bg.setFillStyle(0x2f7a6b); });
      bg.on('pointerup', () => {
        const wasPressed = pressed;
        pressed = false;
        bg.setFillStyle(0x2f7a6b);
        if (wasPressed) onClick();
      });
    }
  }

  Object.assign(SCENES, { TitleScene });
})();
