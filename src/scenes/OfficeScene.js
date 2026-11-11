/**
 * 관청 화면 (기능정의서 F-17) (담당: 팀원 4)
 * 상태는 TutorialFlow.view()로 읽고, 바꾸는 일은 UIScene의 버튼이 flow.dispatch로 한다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SCENES = (TYCOON.scenes = TYCOON.scenes || {});
  const K = TYCOON.config.SCENE_KEYS;

  class OfficeScene extends Phaser.Scene {
    constructor() { super({ key: K.OFFICE }); }
    create() {
      let self = this;
      this.cameras.main.setBackgroundColor('#1b2232');
      this.objs = [];
      this.walker = null;
      TYCOON.ui.watchView(this, function (s) { return [s.region.secondSeat, s.staff.hired && s.staff.hired.id]; }, function (s) {
        TYCOON.ui.clearObjs(self.objs);
        if (self.walker) { self.walker.sprite.destroy(); self.walker = null; }
        let r = TYCOON.ui.art.drawOffice(self, s, { ox: 470, oy: 300 });
        self.objs.push.apply(self.objs, r.objs);
        if (s.staff.hired) {
          // 첫 동료가 문에서 걸어 들어와 두 번째 업무석에 앉는다(처음 한 번).
          if (!self.registry.get('colleagueArrived')) {
            let mid = TYCOON.ui.art.iso(3.5, 4.6, 470, 300);
            let stop = { x: r.seat2.x, y: r.seat2.y + 12 };
            self.walker = new TYCOON.ui.art.Walker(self, 'colleague', [r.door, mid, TYCOON.ui.art.iso(5.9, 3.0, 470, 300), stop], {
              loop: false, speed: 60,
              onArrive: function (w) { w.sprite.setTexture('colleague_sit'); w.sprite.setPosition(r.seat2.x, r.seat2.y); w.sprite.setDepth(r.seat2.y + 1); self.registry.set('colleagueArrived', true); }
            });
          } else {
            let c = self.add.image(r.seat2.x, r.seat2.y, 'colleague_sit').setOrigin(0.5, 1).setDepth(r.seat2.y + 1);
            self.objs.push(c);
          }
        } else {
          let tag = TYCOON.ui.text(self, r.seat2.x, r.seat2.y - 60, '정비 전 업무석', { size: 12, origin: [0.5, 1], color: '#c9c0aa' });
          tag.setBackgroundColor('#1e2b47cc').setPadding(6, 3, 6, 3).setDepth(4000);
          self.objs.push(tag);
        }
      });
    }
    update(time, dt) { if (this.walker) this.walker.update(dt); }
  }

  Object.assign(SCENES, { OfficeScene });
})();
