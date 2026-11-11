/**
 * 지역 화면: 납품 운송, 검사 표식, 사용 개시 말풍선 (기능정의서 F-09, F-11, F-13) (담당: 팀원 3)
 * 상태는 TutorialFlow.view()로 읽고, 바꾸는 일은 UIScene의 버튼이 flow.dispatch로 한다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SCENES = (TYCOON.scenes = TYCOON.scenes || {});
  const K = TYCOON.config.SCENE_KEYS;

  class VillageScene extends Phaser.Scene {
    constructor() { super({ key: K.VILLAGE }); }
    create() {
      let self = this;
      this.cameras.main.setBackgroundColor('#22304a');
      this.objs = [];
      this.walkers = [];
      this.truck = null;
      this.events.once('shutdown', function () { self.registry.set('markerPos', null); self.game.events.emit('pt:marker'); });
      TYCOON.ui.watchView(this, function (s) { return [s.region.hallLit, s.pending, s.phase]; }, function (s) {
        TYCOON.ui.clearObjs(self.objs);
        self.walkers.forEach(function (w) { w.sprite.destroy(); });
        self.walkers = [];
        if (self.truck) { self.truck.sprite.destroy(); self.truck = null; }
        self.registry.set('markerPos', null);
        let ox = 420, oy = 150;
        let r = TYCOON.ui.art.drawRegion(self, s, { ox: ox, oy: oy });
        self.objs.push.apply(self.objs, r.objs);
        let hall = null;
        r.hit.forEach(function (h) {
          if (h.def.id === 'hall') hall = h;
          let z = self.add.zone(h.x - 56, h.y - 40, 112, 88).setOrigin(0, 0).setInteractive({ useHandCursor: true });
          z.on('pointerup', function () { self.game.events.emit('pt:info', { title: h.def.name, lines: [h.def.role] }); });
          self.objs.push(z);
        });
        let paths = TYCOON.ui.art.regionPaths(ox, oy);
        let count = s.region.hallLit ? 6 : 2;
        let keys = ['resident_a', 'resident_b', 'resident_c', 'resident_d'];
        for (let n = 0; n < count; n++) self.walkers.push(new TYCOON.ui.art.Walker(self, keys[n % 4], paths[n], { speed: 24 + n * 4 }));

        if (s.pending === 'INSPECTION') {
          let from = TYCOON.ui.art.iso(7.4, 9.4, ox, oy), to = TYCOON.ui.art.iso(3.8, 9.4, ox, oy);
          let route = self.add.graphics();
          route.fillStyle(0x6fb6e8, 1);
          for (let d = 0; d <= 1; d += 0.08) route.fillRect(TYCOON.ui.snap2(from.x + (to.x - from.x) * d) - 2, TYCOON.ui.snap2(from.y + (to.y - from.y) * d) - 2, 4, 4);
          route.setDepth(1); self.objs.push(route);
          self.truck = new TYCOON.ui.art.Walker(self, 'truck', [from, to], { loop: false, speed: 70, texture: 'truck', onArrive: function () { showMarker(); } });
        }

        function showMarker() {
          let mx = hall.x, my = hall.y - 92;
          let mg = self.add.graphics().setDepth(4500);
          mg.fillStyle(0xf2c230, 1); mg.fillCircle(mx, my, 18);
          mg.fillTriangle(mx - 10, my + 12, mx + 10, my + 12, mx, my + 28);
          mg.lineStyle(2, 0x8a2a14, 1); mg.strokeCircle(mx, my, 18);
          mg.fillStyle(0x2f6f8f, 1); mg.fillRect(mx - 8, my - 9, 16, 18);
          mg.fillStyle(0xf1e6cc, 1); mg.fillRect(mx - 6, my - 7, 12, 14);
          self.objs.push(mg);
          let z = self.add.zone(mx - 24, my - 24, 48, 56).setOrigin(0, 0).setInteractive({ useHandCursor: true }).setDepth(4600);
          z.on('pointerup', function () { self.game.events.emit('pt:inspect'); });
          self.objs.push(z);
          self.registry.set('markerPos', { x: mx - 20, y: my - 20, w: 40, h: 48 });
          self.game.events.emit('pt:marker');
        }

        // 사용 개시 뒤 말풍선 (스토리보드 장면 7)
        if (s.region.hallLit && s.phase !== 'END') {
          let b1 = TYCOON.ui.text(self, hall.x, hall.y - 74, '검사·검수 완료! 사용 개시', { size: 14, bold: true, origin: [0.5, 1] });
          let b2 = TYCOON.ui.text(self, hall.x - 120, hall.y + 150, '주민 후기\n' + TYCOON.ui.SCENARIO.residentReviews[0], { size: 13, origin: [0.5, 0], width: 220 });
          [b1, b2].forEach(function (b) { b.setBackgroundColor('#f1e6cc').setPadding(10, 6, 10, 6).setDepth(4800); self.objs.push(b); });
        }
        self.game.events.emit('pt:marker');
      });
    }
    update(time, dt) {
      this.walkers.forEach(function (w) { w.update(dt); });
      if (this.truck) this.truck.update(dt);
    }
  }

  Object.assign(SCENES, { VillageScene });
})();
