/**
 * 강당 장면: 맨바닥 → 매트·침구 (기능정의서 F-13) (담당: 팀원 2)
 * 상태는 TutorialFlow.view()로 읽고, 바꾸는 일은 UIScene의 버튼이 flow.dispatch로 한다.
 * 개선 후(배경 그림이 있을 때)는 매트 위 주민 머리 위로 하트가 하나씩 떠오른다(표현만, 상태 변경 없음).
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SCENES = (TYCOON.scenes = TYCOON.scenes || {});
  const K = TYCOON.config.SCENE_KEYS;

  class HallScene extends Phaser.Scene {
    constructor() { super({ key: K.HALL }); }
    create() {
      let self = this;
      this.cameras.main.setBackgroundColor('#1b2232');
      this.objs = [];
      this.hearts = [];
      this.heartTimer = null;
      this.events.once('shutdown', function () { self.stopHearts(); });
      TYCOON.ui.watchView(this, function (s) { return [s.region.hallBedded, s.region.hallLit, s.project.checks.mattressCondition]; }, function (s) {
        self.stopHearts();
        TYCOON.ui.clearObjs(self.objs);
        let list = TYCOON.ui.art.drawHall(self, s, { ox: 470, oy: 290, bedded: s.region.hallBedded, lit: s.region.hallLit, conditionKnown: s.project.checks.mattressCondition, hearts: false });
        self.objs.push.apply(self.objs, list);
        let art = TYCOON.ui.art;
        if (s.region.hallLit && art.hasBg(self, art.BG_KEYS.hallAfter)) self.startHearts();
      });
    }

    // 머리 위 하트: 0.5초마다 한 명을 골라 위로 떠오르며 사라진다.
    startHearts() {
      let self = this;
      let heads = TYCOON.ui.art.IMAGE_LAYOUT.hallHeads;
      let n = 0;
      this.heartTimer = this.time.addEvent({
        delay: 420, loop: true, callback: function () {
          let hd = heads[(n * 3 + Math.floor(Math.random() * 2)) % heads.length]; n++;
          let x = TYCOON.ui.snap2(hd.x + (Math.random() * 12 - 6)), y = hd.y - 16;
          let h = self.add.image(x, y, 'fx_heart').setOrigin(0.5, 1).setDepth(4900).setScale(1.5);
          self.hearts.push(h);
          self.tweens.add({
            targets: h, y: y - 40, duration: 1700, ease: 'Sine.easeOut',
            alpha: { from: 1, to: 0, ease: 'Quart.easeIn' },
            onComplete: function () {
              let i = self.hearts.indexOf(h);
              if (i >= 0) self.hearts.splice(i, 1);
              h.destroy();
            }
          });
        }
      });
    }

    stopHearts() {
      if (this.heartTimer) { this.heartTimer.remove(false); this.heartTimer = null; }
      let tweens = this.tweens;
      (this.hearts || []).forEach(function (h) { if (tweens) tweens.killTweensOf(h); h.destroy(); });
      this.hearts = [];
    }
  }

  Object.assign(SCENES, { HallScene });
})();
