/**
 * 마무리 장면 (기능정의서 F-16) (담당: 팀원 4)
 * 상태는 TutorialFlow.view()로 읽고, 바꾸는 일은 UIScene의 버튼이 flow.dispatch로 한다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SCENES = (TYCOON.scenes = TYCOON.scenes || {});
  const K = TYCOON.config.SCENE_KEYS;
  const CSS = () => TYCOON.ui.THEME.css;

  class EndingScene extends Phaser.Scene {
    constructor() { super({ key: K.ENDING }); }
    create() {
      this.step = 0;
      this.objs = [];
      this.dialog = new TYCOON.ui.MascotDialog(this, TYCOON.app.store);
      this.draw();
    }
    clear() { this.objs.forEach(function (o) { o.destroy(); }); this.objs = []; }
    draw() {
      let self = this;
      let s = TYCOON.app.store.getState();
      this.clear();
      this.cameras.main.setBackgroundColor('#1b2232');
      let add = function (o) { self.objs.push(o); return o; };
      let caption = function (title, body) {
        add(TYCOON.ui.paper(self, 200, 6, 880, 84, { header: 36 }));
        add(TYCOON.ui.text(self, 220, 16, title, { size: 18, bold: true, color: TYCOON.ui.THEME.css.paper }));
        add(TYCOON.ui.text(self, 220, 54, body, { size: 15, width: 840 }));
      };
      if (this.step === 0) {
        caption('강당의 밤', '맨바닥에서 자던 주민들이 매트와 침구 위에서 쉽니다.');
        TYCOON.ui.art.drawHall(this, s, { ox: 330, oy: 300, bedded: false, lit: false, conditionKnown: true, clip: { x: 0, y: 92, w: 640, h: 500 } }).forEach(add);
        TYCOON.ui.art.drawHall(this, s, { ox: 950, oy: 300, bedded: true, lit: true }).forEach(add);
        add(TYCOON.ui.text(this, 330, 560, '전', { size: 16, bold: true, color: TYCOON.ui.THEME.css.lightMuted, origin: [0.5, 0] }));
        add(TYCOON.ui.text(this, 950, 560, '후', { size: 16, bold: true, color: '#ffe066', origin: [0.5, 0] }));
        TYCOON.ui.SCENARIO.residentReviews.forEach(function (rv, k) {
          add(TYCOON.ui.text(self, 640, 590 + k * 30, '주민 후기  ' + rv, { size: 14, origin: [0.5, 0] }).setBackgroundColor('#f1e6cc').setPadding(8, 3, 8, 3));
        });
      } else if (this.step === 1) {
        let h = s.staff.hired;
        if (h) {
          caption('두 번째 업무석', h.name + '(' + h.specialty + ', ' + h.trait + ')이 관청의 두 번째 업무석에 앉았습니다.');
          let r = TYCOON.ui.art.drawOffice(this, s, { ox: 560, oy: 330 });
          r.objs.forEach(add);
          add(this.add.image(r.seat2.x, r.seat2.y, 'colleague_sit').setOrigin(0.5, 1).setDepth(r.seat2.y + 1));
        } else caption('평가 결과', 'D 등급 미통과로 동료 모집과 시설 개선은 보류되었습니다.');
      } else {
        caption('다음 과제', '강 건너 원단 공급처로 가는 다리가 끊겨 침구 공방의 생산이 멈춰 있습니다.');
        TYCOON.ui.art.drawRegion(this, s, { ox: 480, oy: 150 }).objs.forEach(add);
        this.dialog.trigger('ending');
      }
      let last = this.step >= 2;
      let bx = 1060, by = 640;
      add(TYCOON.ui.button(this, bx, by, 204, 56, last ? '처음으로' : '다음', function () {
        if (self.dialog.isOpen()) return;
        if (last) { self.scene.start(K.TITLE); return; }
        self.step++; self.draw();
      }, { variant: last ? 'paper' : 'gold', size: 18 }));
      TYCOON.app.debugTargets = TYCOON.app.debugTargets || {};
      TYCOON.app.debugTargets.endingNext = { x: bx, y: by, w: 204, h: 56 };
    }
  }

  Object.assign(SCENES, { EndingScene });
})();
