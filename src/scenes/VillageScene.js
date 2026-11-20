/**
 * 지역 화면: 납품 운송, 검사 표식, 사용 개시 말풍선 (기능정의서 F-09, F-11, F-13) (담당: 팀원 2)
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
      this.markerWorld = null;
      this.events.once('shutdown', function () { self.markerWorld = null; self.registry.set('markerPos', null); self.game.events.emit('pt:marker'); });
      TYCOON.ui.watchView(this, function (s) { return [s.region.hallLit, s.pending, s.phase]; }, function (s) {
        TYCOON.ui.clearObjs(self.objs);
        self.walkers.forEach(function (w) { w.sprite.destroy(); });
        self.walkers = [];
        if (self.truck) { self.truck.sprite.destroy(); self.truck = null; }
        self.markerWorld = null;
        self.registry.set('markerPos', null);
        let ox = 420, oy = 150;
        let art = TYCOON.ui.art;
        let big = art.hasBg(self, art.BG_KEYS.region);   // 배경 그림(1.5배 크기)이면 클릭 영역도 1.5배
        let r = art.drawRegion(self, s, { ox: ox, oy: oy });
        self.objs.push.apply(self.objs, r.objs);
        let hall = null;
        r.hit.forEach(function (h) {
          if (h.def.id === 'hall') hall = h;
          let z = big ? self.add.zone(h.x - 84, h.y - 60, 168, 132) : self.add.zone(h.x - 56, h.y - 40, 112, 88);
          z.setOrigin(0, 0).setInteractive({ useHandCursor: true });
          // 학당 → 강당 안, 지방조달청 → 관청 안으로 들어간다. 나머지는 들어갈 수 없다는 알림창(pt:info)을 띄운다.
          z.on('pointerup', function () {
            let enter = { hall: K.HALL, office: K.OFFICE }[h.def.id];
            let ui = self.scene.get(K.UI);
            if (enter && ui && ui.sys.isActive() && ui.switchView) { ui.switchView(enter); return; }
            self.game.events.emit('pt:info', { title: h.def.name, lines: [h.def.role, '지금은 들어갈 수 없어요.'] });
          });
          self.objs.push(z);
        });
        // 트럭 경로: 배경 그림이 있으면 그림 기준, 없으면 도형 지도 기준 (art.regionLayout)
        // 걸어 다니는 주민은 두지 않는다(팀원 2 결정).
        let layout = TYCOON.ui.art.regionLayout(self, ox, oy);

        if (s.pending === 'INSPECTION') {
          let from = layout.truck.from, to = layout.truck.to;
          let route = self.add.graphics();
          route.fillStyle(0x6fb6e8, 1);
          for (let d = 0; d <= 1; d += 0.08) route.fillRect(TYCOON.ui.snap2(from.x + (to.x - from.x) * d) - 2, TYCOON.ui.snap2(from.y + (to.y - from.y) * d) - 2, 4, 4);
          route.setDepth(1); self.objs.push(route);
          // 트럭과 학당이 화면에 보이도록 화면을 옮긴다(가장자리 이동이 켜진 경우)
          if (big) self.focus((from.x + to.x) / 2, (from.y + to.y) / 2 - 60);
          // 배경 그림은 1.5배 크기라 같은 시간에 도착하도록 속도도 1.5배
          self.truck = new TYCOON.ui.art.Walker(self, 'truck', [from, to], { loop: false, speed: big ? 105 : 70, texture: 'truck', onArrive: function () { showMarker(); } });
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
          // markerPos는 화면 좌표(UI 안내 화살표·자동 테스트가 사용). 화면이 움직이면 update에서 다시 맞춘다.
          if (big) self.focus(mx, my + 60);
          self.markerWorld = { x: mx - 20, y: my - 20, w: 40, h: 48 };
          self.syncMarker(true);
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
      this.syncMarker(false);
    }

    // 화면(카메라)을 (x, y) 중심으로 옮긴다. 그림 범위 밖으로는 나가지 않는다.
    focus(x, y) {
      let cam = this.cameras.main;
      cam.centerOn(x, y);
      if (cam.useBounds) { cam.scrollX = cam.clampX(cam.scrollX); cam.scrollY = cam.clampY(cam.scrollY); }
    }

    // 검사 표식의 화면 좌표를 registry.markerPos에 맞춘다(화면 이동·확대 반영). 움직이는 동안에는 0.12초에 한 번만 알린다(UI 다시 그리기 줄이기).
    syncMarker(force) {
      let m = this.markerWorld;
      if (!m) return;
      let cam = this.cameras.main, s = TYCOON.ui.art.worldToScreen(cam, m.x, m.y);
      let pos = { x: Math.round(s.x), y: Math.round(s.y), w: Math.round(m.w * cam.zoom), h: Math.round(m.h * cam.zoom) };
      let last = this.registry.get('markerPos');
      if (!force && last && last.x === pos.x && last.y === pos.y) return;
      let now = this.time.now;
      if (!force && this.markerSentAt && now - this.markerSentAt < 120) return;
      this.markerSentAt = now;
      this.registry.set('markerPos', pos);
      this.game.events.emit('pt:marker');
    }
  }

  Object.assign(SCENES, { VillageScene });
})();
