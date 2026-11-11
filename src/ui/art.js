/*
 * 임시 그래픽 (담당: 팀원 3. 관청 그림 drawOffice는 팀원 4와 공유)
 *
 * AI 생성 이미지 에셋이 준비되기 전까지 쓰는 도형 그래픽이다.
 * - 쿼터뷰 타일 64×32, 모든 좌표는 2px 그리드(짝수)로 맞춘다(CLAUDE.md 6장).
 * - 인물은 발 위치를 기준점(origin 0.5, 1)으로 두고 깊이 = 바닥 y.
 * - 에셋이 들어오면 이 파일의 그리기 함수를 이미지 배치로 바꾼다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const UI = (TYCOON.ui = TYCOON.ui || {});
  UI.art = UI.art || {};
  let snap2 = function (v) { return Math.round(v / 2) * 2; };

  let C = {
    ground: 0x6f6a4e, groundDark: 0x5c5840, mud: 0x6b5a45, path: 0x9b8a68,
    water: 0x3d5e73, waterHi: 0x52788f,
    wall: 0xcfc3a6, wallShade: 0xa8997a, wood: 0x6e4a32, woodDark: 0x543826,
    roof: 0x4a5a6a, roofShade: 0x35424f, roofEdge: 0x6c7f91,
    window: 0x2a2f3a, windowLit: 0xf2cf6e,
    floor: 0x9c8058, floorDark: 0x86704f, floorCrack: 0x5e4c36,
    mat: 0xc9b58a, matShade: 0xa8956c, matWet: 0x6d7f86, bedding: 0xd9d2c3, beddingShade: 0xb5ad9c,
    desk: 0x8a5a3a, deskShade: 0x6a432a, deskBroken: 0x5a4a3e
  };
  TYCOON.ui.art.COLORS = C;

  function iso(i, j, ox, oy) { return { x: snap2(ox + (i - j) * 32), y: snap2(oy + (i + j) * 16) }; }
  TYCOON.ui.art.iso = iso;

  function diamond(g, ox, oy, i, j, wi, wj, color, alpha) {
    let a = iso(i, j, ox, oy), b = iso(i + wi, j, ox, oy), c = iso(i + wi, j + wj, ox, oy), d = iso(i, j + wj, ox, oy);
    g.fillStyle(color, alpha === undefined ? 1 : alpha);
    g.fillPoints([a, b, c, d], true);
  }
  TYCOON.ui.art.diamond = diamond;

  // 바닥 면 (i, j)부터 wi × wj 크기, 높이 h(px)의 상자
  function isoBox(g, ox, oy, i, j, wi, wj, h, col) {
    h = snap2(h);
    let p = function (a, b, up) { let q = iso(a, b, ox, oy); return { x: q.x, y: q.y - (up || 0) }; };
    let front = p(i + wi, j + wj), right = p(i + wi, j), left = p(i, j + wj), back = p(i, j);
    g.fillStyle(col.left, 1);
    g.fillPoints([left, front, { x: front.x, y: front.y - h }, { x: left.x, y: left.y - h }], true);
    g.fillStyle(col.right, 1);
    g.fillPoints([front, right, { x: right.x, y: right.y - h }, { x: front.x, y: front.y - h }], true);
    g.fillStyle(col.top, 1);
    g.fillPoints([{ x: back.x, y: back.y - h }, { x: right.x, y: right.y - h }, { x: front.x, y: front.y - h }, { x: left.x, y: left.y - h }], true);
    return { front: front, left: left, right: right, back: back };
  }
  TYCOON.ui.art.isoBox = isoBox;

  // 한옥풍 건물: 벽 상자 + 처마가 나온 지붕 + 창
  function building(scene, ox, oy, b, opts) {
    opts = opts || {};
    let g = scene.add.graphics();
    let wallCol = { top: C.wall, left: opts.damaged ? 0x9b8f76 : C.wall, right: opts.damaged ? 0x857a63 : C.wallShade };
    let r = isoBox(g, ox, oy, b.i, b.j, b.wi, b.wj, b.h, wallCol);
    // 창
    let winColor = opts.lit ? C.windowLit : C.window;
    for (let k = 0; k < b.wi; k++) {
      let p = iso(b.i + k + 0.35, b.j + b.wj, ox, oy);
      g.fillStyle(winColor, 1); g.fillRect(p.x + 4, p.y - b.h + 14, 12, 14);
    }
    for (let m = 0; m < b.wj; m++) {
      let q = iso(b.i + b.wi, b.j + m + 0.35, ox, oy);
      g.fillStyle(winColor, opts.lit ? 1 : 0.9); g.fillRect(q.x + 6, q.y - b.h + 10, 12, 14);
    }
    // 지붕: 처마를 0.25칸 내밀고 높이를 올린다
    let e = 0.25, rh = 10;
    let roofOy = oy - b.h;
    isoBox(g, ox, roofOy, b.i - e, b.j - e, b.wi + 2 * e, b.wj + 2 * e, rh, { top: C.roof, left: C.roofShade, right: C.roofShade });
    // 용마루: 긴 축을 따라 지붕 위에 얹는다
    if (b.wi >= b.wj) isoBox(g, ox, roofOy - rh, b.i, b.j + b.wj / 2 - 0.12, b.wi, 0.24, 8, { top: C.roofEdge, left: C.roofShade, right: C.roofShade });
    else isoBox(g, ox, roofOy - rh, b.i + b.wi / 2 - 0.12, b.j, 0.24, b.wj, 8, { top: C.roofEdge, left: C.roofShade, right: C.roofShade });
    if (opts.damaged) {
      g.fillStyle(0x2a2420, 1);
      let hole = iso(b.i + b.wi * 0.6, b.j + b.wj * 0.3, ox, roofOy - rh);
      g.fillRect(hole.x - 8, hole.y - 4, 16, 8);
    }
    g.setDepth(r.front.y);
    return { g: g, front: r.front, top: iso(b.i + b.wi / 2, b.j + b.wj / 2, ox, oy - b.h - 40) };
  }
  TYCOON.ui.art.building = building;

  // ---------- 인물 텍스처 (아트 1px = 화면 2px) ----------
  let PALETTES = {
    resident_a: { cloth: '#7a8fa6', pants: '#4b5566', hair: '#2b2622' },
    resident_b: { cloth: '#a67a5b', pants: '#5b4a3e', hair: '#3a2e26' },
    resident_c: { cloth: '#6f8f6a', pants: '#4a5a46', hair: '#2b2622' },
    resident_d: { cloth: '#9a6f8f', pants: '#56465a', hair: '#cfcfcf' },
    player: { cloth: '#2f4a6b', pants: '#1f2b3d', hair: '#1c1a1a' },
    colleague: { cloth: '#5b6f3a', pants: '#3a4628', hair: '#2b2622' }
  };
  TYCOON.ui.art.PALETTES = PALETTES;
  let SKIN = '#e0b48c';

  function hex(c) { return parseInt(c.slice(1), 16); }

  function makePerson(scene, key, pal) {
    function frame(name, w, h, draw) {
      let g = scene.make.graphics({ x: 0, y: 0, add: false });
      let px = function (x, y, ww, hh, col) { g.fillStyle(hex(col), 1); g.fillRect(x * 2, y * 2, ww * 2, hh * 2); };
      draw(px);
      g.generateTexture(key + '_' + name, w * 2, h * 2);
      g.destroy();
    }
    function standing(px, step) {
      px(2, 0, 4, 2, pal.hair);
      px(2, 2, 4, 3, SKIN);
      px(1, 5, 6, 5, pal.cloth);
      px(0, 6, 1, 3, SKIN); px(7, 6, 1, 3, SKIN);
      if (step === 0) { px(2, 10, 2, 4, pal.pants); px(4, 10, 2, 4, pal.pants); }
      if (step === 1) { px(1, 10, 2, 4, pal.pants); px(5, 10, 2, 3, pal.pants); }
      if (step === 2) { px(2, 10, 2, 3, pal.pants); px(4, 10, 2, 4, pal.pants); px(4, 10, 1, 1, pal.cloth); }
    }
    frame('stand', 8, 14, function (px) { standing(px, 0); });
    frame('walk0', 8, 14, function (px) { standing(px, 1); });
    frame('walk1', 8, 14, function (px) { standing(px, 2); });
    frame('sit', 8, 11, function (px) {
      px(2, 0, 4, 2, pal.hair); px(2, 2, 4, 3, SKIN); px(1, 5, 6, 4, pal.cloth);
      px(1, 9, 6, 2, pal.pants);
    });
    frame('lie', 14, 5, function (px) {
      px(0, 1, 2, 3, pal.hair); px(2, 1, 3, 3, SKIN); px(5, 0, 6, 5, pal.cloth); px(11, 1, 3, 3, pal.pants);
    });
  }

  TYCOON.ui.art.makeTextures = function (scene) {
    Object.keys(PALETTES).forEach(function (k) { makePerson(scene, k, PALETTES[k]); });
    // 납품 트럭 (아트 22×14)
    let g = scene.make.graphics({ x: 0, y: 0, add: false });
    let px = function (x, y, w, h, col) { g.fillStyle(col, 1); g.fillRect(x * 2, y * 2, w * 2, h * 2); };
    px(0, 1, 14, 9, 0xe9e4d6); px(0, 9, 14, 1, 0xb5ad9c);
    px(3, 3, 6, 4, 0x2f7a6b);
    px(14, 3, 7, 7, 0x2f6f8f); px(16, 4, 4, 3, 0xbfe0ef);
    px(0, 10, 22, 2, 0x3a3a3a);
    px(3, 11, 4, 3, 0x1c1c1c); px(15, 11, 4, 3, 0x1c1c1c);
    g.generateTexture('truck', 44, 28);
    g.destroy();
  };

  // ---------- 걷는 인물 ----------
  // 경로를 따라 이동하며 두 프레임을 번갈아 보여준다. 좌표는 짝수로 맞춘다.
  class Walker {
    constructor(scene, key, points, opts) {
      opts = opts || {};
      this.scene = scene; this.key = key; this.points = points;
      this.speed = opts.speed || 36; this.loop = opts.loop !== false;
      this.index = 0; this.t = 0; this.anim = 0; this.done = false;
      this.onArrive = opts.onArrive || null;
      this.fx = points[0].x; this.fy = points[0].y;
      // texture를 주면 프레임을 바꾸지 않는 이동체(트럭 등)로 쓴다.
      this.fixed = opts.texture || null;
      this.sprite = scene.add.image(snap2(this.fx), snap2(this.fy), this.fixed || key + '_stand').setOrigin(0.5, 1);
      this.sprite.setDepth(this.fy);
    }

    update(dt) {
      if (this.done) return;
      let a = this.points[this.index];
      let nextIndex = this.index + 1;
      if (nextIndex >= this.points.length) {
        if (!this.loop) { this.done = true; if (!this.fixed) this.sprite.setTexture(this.key + '_stand'); if (this.onArrive) this.onArrive(this); return; }
        nextIndex = 0;
      }
      let b = this.points[nextIndex];
      let dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      this.t += (this.speed * dt / 1000) / dist;
      if (this.t >= 1) { this.t = 0; this.index = nextIndex; return; }
      this.fx = a.x + (b.x - a.x) * this.t;
      this.fy = a.y + (b.y - a.y) * this.t;
      this.sprite.x = snap2(this.fx);
      this.sprite.y = snap2(this.fy);
      this.sprite.setDepth(this.sprite.y);
      this.sprite.setFlipX(b.x < a.x);
      this.anim += dt;
      if (!this.fixed) this.sprite.setTexture(this.key + (Math.floor(this.anim / 220) % 2 === 0 ? '_walk0' : '_walk1'));
    }
  }
  TYCOON.ui.art.Walker = Walker;

  // ---------- 강당 ----------
  // opts: { bedded, lit, conditionKnown, ox, oy, cols, rows, label }
  TYCOON.ui.art.drawHall = function (scene, state, opts) {
    opts = opts || {};
    let ox = opts.ox, oy = opts.oy, cols = opts.cols || 8, rows = opts.rows || 6;
    let objs = [];
    let g = scene.add.graphics(); objs.push(g);
    // 뒷벽
    let wallH = 96;
    let bl = iso(0, rows, ox, oy), bk = iso(0, 0, ox, oy), br = iso(cols, 0, ox, oy);
    g.fillStyle(C.wallShade, 1);
    g.fillPoints([bl, bk, { x: bk.x, y: bk.y - wallH }, { x: bl.x, y: bl.y - wallH }], true);
    g.fillStyle(C.wall, 1);
    g.fillPoints([bk, br, { x: br.x, y: br.y - wallH }, { x: bk.x, y: bk.y - wallH }], true);
    for (let w = 1; w < cols; w += 2) {
      let p = iso(w, 0, ox, oy);
      g.fillStyle(opts.lit ? C.windowLit : C.window, 1); g.fillRect(p.x + 8, p.y - 70, 24, 30);
      g.fillStyle(C.woodDark, 1); g.fillRect(p.x + 19, p.y - 70, 2, 30); g.fillRect(p.x + 8, p.y - 56, 24, 2);
    }
    // 바닥
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) diamond(g, ox, oy, i, j, 1, 1, (i + j) % 2 ? C.floor : C.floorDark);
    g.setDepth(0);

    // 주민 20명: 5열 × 4행. 앞쪽 일부만 깔개가 있다.
    let inv = TYCOON.ui.SCENARIO.project.inventory;
    let total = TYCOON.ui.SCENARIO.project.residents.total;
    let keys = ['resident_a', 'resident_b', 'resident_c', 'resident_d'];
    for (let n = 0; n < total; n++) {
      let col = n % 5, row = Math.floor(n / 5);
      let ci = 0.6 + col * 1.45, cj = 0.7 + row * 1.3;
      let hasMat = opts.bedded || n < inv.mattress.count;
      let wet = !opts.bedded && opts.conditionKnown && n >= inv.mattress.count - inv.mattress.wet && n < inv.mattress.count;
      let hasBedding = opts.bedded || n < inv.bedding.count;
      let mg = scene.add.graphics(); objs.push(mg);
      let base = iso(ci, cj, ox, oy);
      if (hasMat) isoBox(mg, ox, oy, ci - 0.05, cj - 0.1, 1.1, 0.55, 4, { top: wet ? C.matWet : C.mat, left: C.matShade, right: C.matShade });
      mg.setDepth(base.y);
      let sleeping = !wet;
      let person = scene.add.image(snap2(base.x + 4), snap2(base.y + 6), keys[n % 4] + (sleeping ? '_lie' : '_stand')).setOrigin(0.5, 1);
      person.setDepth(base.y + 2); objs.push(person);
      if (hasBedding && sleeping) {
        let bg = scene.add.graphics(); objs.push(bg);
        isoBox(bg, ox, oy, ci + 0.35, cj - 0.02, 0.6, 0.42, 4, { top: C.bedding, left: C.beddingShade, right: C.beddingShade });
        bg.setDepth(base.y + 4);
      }
    }
    if (!opts.lit) {
      let dark = scene.add.graphics(); objs.push(dark);
      dark.fillStyle(0x0b1222, 0.32);
      dark.fillRect(opts.clip ? opts.clip.x : 0, opts.clip ? opts.clip.y : 0, opts.clip ? opts.clip.w : 1280, opts.clip ? opts.clip.h : 720);
      dark.setDepth(5000);
    }
    return objs;
  };

  // ---------- 관청 내부 ----------
  TYCOON.ui.art.drawOffice = function (scene, state, opts) {
    let ox = opts.ox, oy = opts.oy, cols = 8, rows = 6;
    let g = scene.add.graphics();
    let wallH = 104;
    let bl = iso(0, rows, ox, oy), bk = iso(0, 0, ox, oy), br = iso(cols, 0, ox, oy);
    g.fillStyle(C.wallShade, 1);
    g.fillPoints([bl, bk, { x: bk.x, y: bk.y - wallH }, { x: bl.x, y: bl.y - wallH }], true);
    g.fillStyle(C.wall, 1);
    g.fillPoints([bk, br, { x: br.x, y: br.y - wallH }, { x: bk.x, y: bk.y - wallH }], true);
    // 창살 창
    for (let w = 1; w < cols - 1; w += 3) {
      let p = iso(w, 0, ox, oy);
      g.fillStyle(0xe8dcc0, 1); g.fillRect(p.x + 6, p.y - 84, 40, 36);
      g.fillStyle(C.woodDark, 1);
      for (let k = 0; k < 5; k++) g.fillRect(p.x + 6 + k * 10, p.y - 84, 2, 36);
      for (let m = 0; m < 4; m++) g.fillRect(p.x + 6, p.y - 84 + m * 12, 40, 2);
    }
    // 문
    let door = iso(0, 4, ox, oy);
    g.fillStyle(C.woodDark, 1);
    g.fillPoints([door, iso(0, 5, ox, oy), { x: iso(0, 5, ox, oy).x, y: iso(0, 5, ox, oy).y - 64 }, { x: door.x, y: door.y - 64 }], true);
    // 바닥: 부분 복구. 오른쪽 뒤편은 아직 갈라져 있다.
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      let cracked = !state.region.secondSeat && i >= 4 && j <= 2;
      diamond(g, ox, oy, i, j, 1, 1, cracked ? C.floorCrack : ((i + j) % 2 ? C.floor : C.floorDark));
    }
    g.setDepth(0);
    let objs = [g];

    function desk(i, j, broken) {
      let dg = scene.add.graphics();
      let r = isoBox(dg, ox, oy, i, j, 1.4, 0.8, 22, broken
        ? { top: C.deskBroken, left: 0x4a3c32, right: 0x40342b }
        : { top: C.desk, left: C.deskShade, right: C.deskShade });
      if (!broken) {
        let top = iso(i + 0.5, j + 0.3, ox, oy - 22);
        dg.fillStyle(C.bedding, 1); dg.fillRect(top.x - 6, top.y - 4, 12, 6);
        dg.fillStyle(0x2f3d55, 1); dg.fillRect(top.x + 10, top.y - 14, 14, 10);
      }
      dg.setDepth(r.front.y);
      objs.push(dg);
      return r;
    }
    let d1 = desk(2, 2, false);
    let d2 = desk(5, 1, !state.region.secondSeat);
    let seat1 = iso(2.7, 3.3, ox, oy);
    let p1 = scene.add.image(seat1.x, seat1.y, 'player_sit').setOrigin(0.5, 1).setDepth(seat1.y + 1);
    objs.push(p1);
    let seat2 = iso(5.7, 2.3, ox, oy);
    return { objs: objs, seat2: seat2, door: iso(0.6, 4.5, ox, oy), d2: d2, d1: d1 };
  };

  // ---------- 지역 ----------
  let REGION_BUILDINGS = [
    { id: 'office', name: '지방조달청 현장 거점', role: '플레이어의 운영 거점', i: 2, j: 1, wi: 2, wj: 2, h: 40 },
    { id: 'hall', name: '학당 강당', role: '요청기관: 학당 운영위원회', i: 2, j: 6, wi: 3, wj: 2, h: 44 },
    { id: 'market', name: '장터', role: '주민 생활 공간', i: 6, j: 2, wi: 2, wj: 1, h: 28 },
    { id: 'workshop', name: '한결침구공방', role: '공급기업: 지역 공방', i: 6, j: 6, wi: 2, wj: 2, h: 34 },
    { id: 'supply', name: '원단 공급처', role: '강 건너편. 다리가 끊겨 원단이 들어오지 않는다', i: 12, j: 2, wi: 2, wj: 2, h: 30 }
  ];
  TYCOON.ui.art.REGION_BUILDINGS = REGION_BUILDINGS;

  TYCOON.ui.art.drawRegion = function (scene, state, opts) {
    let ox = opts.ox, oy = opts.oy, cols = 15, rows = 10;
    let g = scene.add.graphics();
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      let river = i === 10 || i === 11;
      let color = river ? ((j % 2) ? C.water : C.waterHi) : ((i * 7 + j * 3) % 5 === 0 ? C.groundDark : C.ground);
      let road = (j === 9 && i < 10) || i === 9 || (j === 4 && i >= 5 && i < 10) || (i === 5 && j >= 4 && j < 10);
      if (!river && road) color = C.path;
      if (!river && i < 10 && j >= 8 && (i + j) % 3 === 0) color = C.mud;
      diamond(g, ox, oy, i, j, 1, 1, color);
    }
    g.setDepth(0);
    let objs = [g];
    // 끊어진 다리: 강 양쪽 교각만 남음
    let bg = scene.add.graphics();
    isoBox(bg, ox, oy, 9.7, 3.7, 0.6, 0.6, 14, { top: 0x7d6a55, left: 0x5e4f3f, right: 0x5e4f3f });
    isoBox(bg, ox, oy, 11.7, 3.7, 0.6, 0.6, 14, { top: 0x7d6a55, left: 0x5e4f3f, right: 0x5e4f3f });
    isoBox(bg, ox, oy, 10.3, 3.8, 0.5, 0.4, 6, { top: 0x6a5846, left: 0x4e4134, right: 0x4e4134 });
    bg.setDepth(iso(12, 4.3, ox, oy).y);
    objs.push(bg);

    let hit = [];
    REGION_BUILDINGS.forEach(function (b) {
      let lit = (b.id === 'hall' && state.region.hallLit) || b.id === 'office';
      let damaged = b.id === 'market' || (b.id === 'hall' && !state.region.hallLit) || b.id === 'supply';
      let bd = building(scene, ox, oy, b, { lit: lit, damaged: damaged });
      objs.push(bd.g);
      let label = TYCOON.ui.text(scene, bd.top.x, bd.top.y - 8, b.name, { size: 12, origin: [0.5, 1], color: '#f4ecd8' });
      label.setBackgroundColor('#1e2b47cc').setPadding(6, 3, 6, 3).setDepth(4000);
      objs.push(label);
      hit.push({ def: b, x: bd.top.x, y: bd.top.y + 30 });
    });
    return { objs: objs, hit: hit };
  };

  // 지역 주민 동선 (길 위)
  // 건물 뒤로 가려지지 않도록 앞쪽과 오른쪽 길을 쓴다.
  TYCOON.ui.art.regionPaths = function (ox, oy) {
    return [
      [iso(0.5, 9.4, ox, oy), iso(9.4, 9.4, ox, oy)],
      [iso(9.4, 0.6, ox, oy), iso(9.4, 9.4, ox, oy)],
      [iso(5.5, 4.5, ox, oy), iso(9.4, 4.5, ox, oy)],
      [iso(9.4, 9.4, ox, oy), iso(9.4, 4.5, ox, oy), iso(5.5, 4.5, ox, oy), iso(5.5, 9.4, ox, oy)],
      [iso(2, 9.4, ox, oy), iso(8, 9.4, ox, oy)],
      [iso(9.4, 2, ox, oy), iso(9.4, 8, ox, oy)]
    ];
  };
})();
