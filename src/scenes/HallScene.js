/**
 * 강당 장면: 맨바닥 → 매트·침구 (기능정의서 F-13) (담당: 팀원 3)
 * 상태는 TutorialFlow.view()로 읽고, 바꾸는 일은 UIScene의 버튼이 flow.dispatch로 한다.
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
      TYCOON.ui.watchView(this, function (s) { return [s.region.hallBedded, s.region.hallLit, s.project.checks.mattressCondition]; }, function (s) {
        TYCOON.ui.clearObjs(self.objs);
        let list = TYCOON.ui.art.drawHall(self, s, { ox: 470, oy: 290, bedded: s.region.hallBedded, lit: s.region.hallLit, conditionKnown: s.project.checks.mattressCondition });
        self.objs.push.apply(self.objs, list);
      });
    }
  }

  Object.assign(SCENES, { HallScene });
})();
