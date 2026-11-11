/*
 * 마스코트 안내 대화창 (담당: 팀원 4, 기능정의서 F-15)
 *
 * - 같은 안내는 한 번만 자동으로 띄운다. 본 목록은 store의 meta에 저장된다.
 * - 떠 있는 동안 화면 전체 입력을 막아 상태 명령이 실행되지 않게 한다.
 * - 초상 자리는 비워 둔다. 나르미·달이는 조달청 공식 원본 이미지로 넣는다
 *   (CLAUDE.md 6장 에셋). 여기서 마스코트를 그리지 않는다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const UI = (TYCOON.ui = TYCOON.ui || {});

  class MascotDialog {
    constructor(scene, store, layout) {
      this.scene = scene;
      this.store = store;
      this.layout = layout || TYCOON.ui.DIALOG_LAYOUT;
      this.queue = [];
      this.current = null;
      this.lineIndex = 0;
      this.container = null;
      this.onClose = null;
      let self = this;
      scene.input.keyboard && scene.input.keyboard.on('keydown', function (ev) {
        if (!self.current) return;
        if (ev.key === 'Enter' || ev.key === ' ') self.next();
        if (ev.key === 'Escape') self.skip();
      });
    }

    isOpen() { return !!this.current; }

    // 자동 안내: 이미 본 안내와 꺼진 힌트는 띄우지 않는다.
    trigger(id) {
      let def = TYCOON.ui.SCENARIO.dialogs[id];
      if (!def) return;
      let meta = this.store.getState().meta;
      if (meta.seenDialogs.indexOf(id) !== -1 && def.kind !== 'hint') return;
      if (def.kind === 'hint' && !meta.hintsOn) return;
      if (this.current && this.current.id === id) return;
      if (this.queue.some(function (q) { return q.id === id; })) return;
      this.queue.push({ id: id, replay: false });
      if (!this.current) this.showNext();
    }

    // 다시 보기: 본 안내만 다시 연다.
    replay(id) {
      this.queue.unshift({ id: id, replay: true });
      if (!this.current) this.showNext();
    }

    showNext() {
      let item = this.queue.shift();
      if (!item) { this.current = null; this.destroyView(); if (this.onClose) this.onClose(); return; }
      this.current = item;
      this.lineIndex = 0;
      if (!item.replay) this.store.dispatch('MARK_DIALOG_SEEN', { id: item.id });
      this.render();
    }

    next() {
      if (!this.current) return;
      let def = TYCOON.ui.SCENARIO.dialogs[this.current.id];
      if (this.lineIndex < def.lines.length - 1) { this.lineIndex++; this.render(); }
      else this.showNext();
    }

    // 건너뛰기: 지금 대화를 닫는다. 다시 보기에서 볼 수 있다.
    skip() {
      if (!this.current) return;
      this.showNext();
    }

    destroyView() {
      if (this.container) { this.container.destroy(); this.container = null; }
    }

    render() {
      let scene = this.scene;
      let T = TYCOON.ui.THEME;
      let L = this.layout;
      let def = TYCOON.ui.SCENARIO.dialogs[this.current.id];
      let self = this;
      this.destroyView();
      let c = scene.add.container(0, 0).setDepth(1000);
      this.container = c;

      // 입력 차단 막: 화면 전체를 덮는다.
      let blocker = scene.add.zone(0, 0, 1280, 720).setOrigin(0, 0).setInteractive();
      c.add(blocker);
      let dim = scene.add.graphics();
      dim.fillStyle(0x0b1222, 0.3); dim.fillRect(0, 0, 1280, 720);
      c.add(dim);

      TYCOON.ui.drawMascotBox(scene, c, L, def.speaker, def.kind === 'hint');
      c.add(TYCOON.ui.text(scene, L.x + 20, L.y + 14, def.speaker + (this.current.replay ? '  다시 보기' : '') + '  ' + def.title, { size: 14, bold: true, color: def.kind === 'hint' ? T.css.warn : T.css.ok }));
      c.add(TYCOON.ui.text(scene, L.x + 20, L.y + 44, def.lines[this.lineIndex], { size: 15, width: L.w - 40, lineSpacing: 4 }));
      c.add(TYCOON.ui.text(scene, L.x + L.w - 20, L.y + L.h - 22, (this.lineIndex + 1) + ' / ' + def.lines.length + '  Enter 다음  Esc 건너뛰기', { size: 11, color: T.css.muted, origin: [1, 0] }));

      let last = this.lineIndex >= def.lines.length - 1;
      let bw = 76, bh = 28;
      // 버튼은 위쪽 오른편에 두어 대사 두세 줄과 겹치지 않게 한다.
      let nx = L.x + L.w - bw - 14, ny = L.y + 10;
      let sx = nx - bw - 8;
      c.add(TYCOON.ui.button(scene, sx, ny, bw, bh, '건너뛰기', function () { self.skip(); }, { variant: 'paper', size: 14 }));
      c.add(TYCOON.ui.button(scene, nx, ny, bw, bh, last ? '닫기' : '다음', function () { self.next(); }, { size: 14 }));
      TYCOON.app.debugTargets = TYCOON.app.debugTargets || {};
      TYCOON.app.debugTargets.dialogNext = { x: nx, y: ny, w: bw, h: bh };
      TYCOON.app.debugTargets.dialogSkip = { x: sx, y: ny, w: bw, h: bh };
    }

  }

  // 좌하단 마스코트 상자: 초상 자리 + 말풍선. 대화와 단계 안내가 같이 쓴다.
  // 초상은 비워 둔다. 조달청 공식 원본 이미지로 교체한다(CLAUDE.md 6장 에셋).
  TYCOON.ui.DIALOG_LAYOUT = { x: 112, y: 594, w: 412, h: 118 };
  TYCOON.ui.drawMascotBox = function (scene, container, L, speaker, highlight) {
    let T = TYCOON.ui.THEME;
    let g = scene.add.graphics();
    g.fillStyle(T.tealDeep, 1); g.fillRect(8, L.y - 18, 100, L.h + 18);
    g.fillStyle(0x2a3550, 1); g.fillRect(12, L.y - 14, 92, L.h + 10);
    g.lineStyle(2, highlight ? T.ochre : T.teal, 1); g.strokeRect(13, L.y - 13, 90, L.h + 8);
    container.add(g);
    container.add(TYCOON.ui.text(scene, 58, L.y + L.h / 2 - 8, speaker + '\n이미지 자리', { size: 12, color: T.css.lightMuted, origin: [0.5, 0.5], align: 'center', lineSpacing: 2 }));
    container.add(TYCOON.ui.paper(scene, L.x, L.y, L.w, L.h));
    let tail = scene.add.graphics();
    tail.fillStyle(T.tealDeep, 1); tail.fillTriangle(L.x, L.y + 40, L.x - 10, L.y + 50, L.x, L.y + 60);
    container.add(tail);
  };

  TYCOON.ui.MascotDialog = MascotDialog;
})();
