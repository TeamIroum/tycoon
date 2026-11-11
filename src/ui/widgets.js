/*
 * UI 공통 요소 (담당: 팀원 4)
 *
 * 화면 스타일은 클릭 흐름 스토리보드(노션 '1109 docx')를 따른다.
 * 한지색 패널, 청록 머리띠와 테두리, 청록 버튼, 노란 안내 화살표.
 * 버튼은 '눌렀다 같은 버튼에서 뗄 때'만 실행한다. 대화창을 닫는 클릭이
 * 아래 버튼까지 전달되지 않게 하기 위한 규칙이다(CLAUDE.md 4.7).
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const UI = (TYCOON.ui = TYCOON.ui || {});

  let THEME = {
    paper: 0xf1e6cc, paperHi: 0xf8f0dc, paperDim: 0xe4d6b4, paperLine: 0xc9b78f,
    teal: 0x2f7a6b, tealHi: 0x3c9483, tealDeep: 0x24564f,
    ochre: 0xe0b44c, vermilion: 0xc2462e, arrow: 0xf2c230, arrowLine: 0x8a2a14,
    navy: 0x1e2b47, navyDeep: 0x16203a,
    css: {
      ink: '#2a2730', muted: '#6b6258', ok: '#23705f', bad: '#b23a22', warn: '#9a6b12',
      paper: '#f1e6cc', white: '#ffffff', light: '#efe7d2', lightMuted: '#c9c0aa'
    },
    font: '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", "Nanum Gothic", sans-serif'
  };
  TYCOON.ui.THEME = THEME;

  function snap2(v) { return Math.round(v / 2) * 2; }
  TYCOON.ui.snap2 = snap2;

  TYCOON.ui.text = function (scene, x, y, str, opts) {
    opts = opts || {};
    let style = {
      fontFamily: THEME.font,
      fontSize: (opts.size || 16) + 'px',
      color: opts.color || THEME.css.ink,
      fontStyle: opts.bold ? 'bold' : 'normal',
      lineSpacing: opts.lineSpacing === undefined ? 6 : opts.lineSpacing
    };
    if (opts.width) style.wordWrap = { width: opts.width, useAdvancedWrap: true };
    if (opts.align) style.align = opts.align;
    if (opts.stroke) { style.stroke = opts.stroke; style.strokeThickness = opts.strokeThickness || 4; }
    let t = scene.add.text(snap2(x), snap2(y), str, style);
    if (opts.origin) t.setOrigin(opts.origin[0], opts.origin[1]);
    return t;
  };

  // 한지색 패널. header가 있으면 위쪽에 청록 머리띠를 그린다.
  TYCOON.ui.paper = function (scene, x, y, w, h, opts) {
    opts = opts || {};
    let g = scene.add.graphics();
    g.fillStyle(THEME.tealDeep, 1); g.fillRect(x, y, w, h);
    g.fillStyle(opts.fill === undefined ? THEME.paper : opts.fill, 1); g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.lineStyle(2, THEME.paperLine, 1); g.strokeRect(x + 7, y + 7, w - 14, h - 14);
    if (opts.header) {
      g.fillStyle(THEME.teal, 1); g.fillRect(x + 4, y + 4, w - 8, opts.header);
      g.fillStyle(THEME.ochre, 1); g.fillRect(x + 4, y + 4 + opts.header, w - 8, 2);
    }
    return g;
  };

  // 예전 이름 호환 (마무리 장면 등)
  TYCOON.ui.panel = function (scene, x, y, w, h, opts) { return TYCOON.ui.paper(scene, x, y, w, h, opts); };

  TYCOON.ui.button = function (scene, x, y, w, h, label, onClick, opts) {
    opts = opts || {};
    let variant = opts.variant || 'primary';
    let c = scene.add.container(snap2(x), snap2(y));
    let g = scene.add.graphics();
    let t = scene.add.text(w / 2, h / 2, label, {
      fontFamily: THEME.font, fontSize: (opts.size || 16) + 'px', color: THEME.css.paper,
      fontStyle: 'bold', align: 'center', lineSpacing: 2
    }).setOrigin(0.5);
    let zone = scene.add.zone(0, 0, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    c.add([g, t, zone]);
    let enabled = opts.enabled !== false;
    let pressed = false;
    let hover = false;

    function draw() {
      g.clear();
      let fill, line, line2 = null, ink = THEME.css.paper;
      if (!enabled) { fill = 0xcfc6b0; line = 0xa89f8a; ink = '#8a8170'; }
      else if (variant === 'primary') { fill = hover ? THEME.tealHi : THEME.teal; line = THEME.tealDeep; }
      else if (variant === 'gold') { fill = hover ? THEME.tealHi : THEME.teal; line = THEME.ochre; line2 = THEME.tealDeep; }
      else if (variant === 'accent') { fill = hover ? 0xd65a40 : THEME.vermilion; line = 0x7a2414; }
      else if (variant === 'tab-on') { fill = THEME.teal; line = THEME.ochre; }
      else { fill = hover ? THEME.paperHi : THEME.paperDim; line = THEME.tealDeep; ink = THEME.css.ink; }
      let top = pressed ? 2 : 0;
      g.fillStyle(fill, 1); g.fillRect(0, top, w, h - top);
      g.lineStyle(line2 ? 4 : 2, line, 1); g.strokeRect(line2 ? 2 : 1, top + (line2 ? 2 : 1), w - (line2 ? 4 : 2), h - top - (line2 ? 4 : 2));
      if (line2) { g.lineStyle(2, line2, 1); g.strokeRect(5, top + 5, w - 10, h - top - 10); }
      t.setColor(ink);
      t.y = h / 2 + (pressed ? 1 : 0);
    }

    zone.on('pointerover', function () { hover = true; draw(); });
    zone.on('pointerout', function () { hover = false; pressed = false; draw(); });
    zone.on('pointerdown', function () { if (enabled) { pressed = true; draw(); } });
    zone.on('pointerup', function () {
      let wasPressed = pressed;
      pressed = false; draw();
      if (wasPressed && enabled) onClick();
    });

    c.setEnabled = function (v) {
      enabled = !!v;
      if (zone.input) zone.input.cursor = enabled ? 'pointer' : 'default';
      draw();
      return c;
    };
    c.setLabel = function (s) { t.setText(s); return c; };
    c.setEnabled(enabled);
    return c;
  };

  // 노란 안내 화살표. dir은 화살표가 가리키는 방향(left/right/up/down).
  TYCOON.ui.arrow = function (scene, tx, ty, dir, label, sub) {
    let c = scene.add.container(0, 0);
    let g = scene.add.graphics();
    let L = 64, T = 30, H = 26;
    let pts;
    if (dir === 'left') pts = [[0, 0], [H, -T / 2 - 8], [H, -T / 2 + 4], [L, -T / 2 + 4], [L, T / 2 - 4], [H, T / 2 - 4], [H, T / 2 + 8]];
    else if (dir === 'right') pts = [[0, 0], [-H, -T / 2 - 8], [-H, -T / 2 + 4], [-L, -T / 2 + 4], [-L, T / 2 - 4], [-H, T / 2 - 4], [-H, T / 2 + 8]];
    else if (dir === 'up') pts = [[0, 0], [-T / 2 - 8, H], [-T / 2 + 4, H], [-T / 2 + 4, L], [T / 2 - 4, L], [T / 2 - 4, H], [T / 2 + 8, H]];
    else pts = [[0, 0], [-T / 2 - 8, -H], [-T / 2 + 4, -H], [-T / 2 + 4, -L], [T / 2 - 4, -L], [T / 2 - 4, -H], [T / 2 + 8, -H]];
    let poly = pts.map(function (p) { return { x: snap2(tx + p[0]), y: snap2(ty + p[1]) }; });
    g.fillStyle(THEME.arrow, 1); g.fillPoints(poly, true);
    g.lineStyle(2, THEME.arrowLine, 1); g.strokePoints(poly, true);
    c.add(g);
    let lx = tx, ly = ty, ox = 0.5, oy = 1;
    if (dir === 'left') { lx = tx + L + 8; ly = ty - 4; ox = 0; oy = 0.5; }
    if (dir === 'right') { lx = tx - L - 8; ly = ty - 4; ox = 1; oy = 0.5; }
    if (dir === 'up') { ly = ty + L + 6; oy = 0; }
    if (dir === 'down') { ly = ty - L - 6; oy = 1; }
    let txt = TYCOON.ui.text(scene, lx, ly, label + (sub ? '\n' + sub : ''), {
      size: 16, bold: true, color: '#ffe066', stroke: '#3a1d0e', strokeThickness: 5,
      origin: [ox, oy], align: ox === 1 ? 'right' : (ox === 0 ? 'left' : 'center'), lineSpacing: 2
    });
    c.add(txt);
    return c;
  };

  TYCOON.ui.STATUS_LABEL = {
    REQUESTED: '접수', REVIEWING: '확인 중', CONTRACTED: '계약 완료',
    DELIVERING: '납품 중', INSPECTING: '검사·검수', EVALUATED: '평가 완료', COMPLETED: '사용 개시'
  };
})();
