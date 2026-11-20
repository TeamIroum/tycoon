/*
 * 월드 그래픽 (담당: 팀원 2)
 *
 * - 배경 그림(src/config/assets.js의 BG_KEYS)이 불러와져 있으면 지역·관청·강당을 그 그림으로 그린다.
 *   그림이 없거나 로드에 실패하면 아래 도형 그래픽으로 그린다(폴백).
 * - 쿼터뷰 타일 64×32, 모든 좌표는 2px 그리드(짝수)로 맞춘다(CLAUDE.md 6장).
 * - 인물은 발 위치를 기준점(origin 0.5, 1)으로 두고 깊이 = 바닥 y.
 * - 공개 함수의 이름·반환 형식은 API명세서 6-5를 따른다(다른 팀 Scene이 사용).
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

  // ---------- 배경 그림 ----------
  // 키는 src/config/assets.js와 같다. 그림은 모두 1920×1080(화면 1280×720보다 크게)이며 아래 좌표도 그 기준이다.
  // 관청·지역·강당 화면은 그림을 원래 크기로 깔고, 마우스가 가장자리에 가면 화면이 그쪽으로 움직인다(EDGE_SCROLL).
  // 엔딩은 화면(또는 지정 영역)에 맞춰 줄여 보여 준다.
  let BG_KEYS = { region: 'bg_region', office: 'bg_office', hallBefore: 'bg_hall_before', hallAfter: 'bg_hall_after' };
  TYCOON.ui.art.BG_KEYS = BG_KEYS;
  let BG_W = 1920, BG_H = 1080;

  // 그림 위 위치 (1920×1080 기준, 눈금 그림으로 잰 값)
  let IMAGE_LAYOUT = {
    region: {
      // hit 좌표: VillageScene이 (x-84, y-60, 168×132) 클릭 영역, 학당은 (x, y-92)에 검사 표식을 둔다.
      buildings: {
        office: { x: 976, y: 226 },     // 지방조달청
        hall: { x: 510, y: 394 },       // 학당
        market: { x: 1336, y: 780 },    // 장터
        workshop: { x: 196, y: 606 },   // 공급기업(침구 공방)
        supply: { x: 1834, y: 900 },    // 강 건너
        clinic: { x: 1288, y: 568 },    // 의원 (그림에만 있는 건물)
        library: { x: 1614, y: 474 }    // 도서관 (그림에만 있는 건물)
      },
      // 그림에만 있는 건물(도형 지도에는 없음). 간판이 그려져 있어 이름표는 달지 않는다.
      extra: [
        { id: 'clinic', name: '의원', role: '마을 의원', noLabel: true },
        { id: 'library', name: '도서관', role: '마을 도서관', noLabel: true }
      ],
      // 납품 트럭: 학당 앞까지
      truck: { from: { x: 960, y: 630 }, to: { x: 646, y: 474 } }
    },
    // endingView: 엔딩에서 관청을 원래 크기(1배)로 보여 줄 때 그림의 왼쪽 위 화면 위치(동료 그림과 비율을 맞추려고 줄이지 않음)
    office: { seat2: { x: 1114, y: 576 }, door: { x: 496, y: 678 }, endingView: { x: -210, y: -160 } },
    // 개선 전 강당 바닥 매트 덮개(왼쪽 위), 점검 뒤 젖은 세트(왼쪽 위)와 그 위 물방울(아래 가운데)
    hallMats: { x: 1012, y: 446, wet: { x: 1282, y: 606 }, drops: [{ x: 1360, y: 618 }, { x: 1420, y: 618 }] },
    // 개선 후 강당 그림에서 매트 위 주민 머리 위치
    hallHeads: [{ x: 1158, y: 468 }, { x: 1248, y: 508 }, { x: 1308, y: 526 }, { x: 1300, y: 370 }, { x: 1438, y: 436 }, { x: 1546, y: 492 }, { x: 1608, y: 528 }]
  };
  TYCOON.ui.art.IMAGE_LAYOUT = IMAGE_LAYOUT;

  function hasBg(scene, key) { return !!(scene && scene.textures && scene.textures.exists(key)); }
  TYCOON.ui.art.hasBg = hasBg;

  function isEnding(scene) {
    let K = TYCOON.config && TYCOON.config.SCENE_KEYS;
    return !!(K && scene.scene && scene.scene.key === K.ENDING);
  }

  // 줄여 볼 때(배율 < 1)는 부드럽게, 원래 크기 이상으로 볼 때는 도트가 또렷하게(최근접) 그린다.
  // (게임 설정 pixelArt라 기본은 최근접이고, 1920 그림을 0.67배로 줄이면 픽셀 줄이 빠져 깨져 보인다.)
  function setBgFilter(scene, key, zoom) {
    let tex = scene.textures.get(key);
    if (tex && tex.setFilter) tex.setFilter(zoom < 0.999 ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST);
  }

  // rect 안에 비율을 지켜 맞춘다(contain). 반환: { img, s, x, y, w, h } — 그림 좌표 (px, py) → 화면 (x + px*s, y + py*s)
  function placeBg(scene, key, rect) {
    let s = Math.min(rect.w / BG_W, rect.h / BG_H);
    setBgFilter(scene, key, s);
    let x = snap2(rect.x + (rect.w - BG_W * s) / 2), y = snap2(rect.y + (rect.h - BG_H * s) / 2);
    // 배경은 항상 맨 아래(-10): 엔딩처럼 배경보다 먼저 만든 제목 상자 등을 가리지 않게 한다.
    let img = scene.add.image(x, y, key).setOrigin(0, 0).setScale(s).setDepth(-10);
    return { img: img, s: s, x: x, y: y, w: BG_W * s, h: BG_H * s };
  }
  TYCOON.ui.art.placeBg = placeBg;

  // 배율 s로 화면 (x, y)에 그림의 왼쪽 위를 맞춰 놓는다(맞춤 없이).
  function placeBgAt(scene, key, s, x, y) {
    setBgFilter(scene, key, s);
    let img = scene.add.image(x, y, key).setOrigin(0, 0).setScale(s).setDepth(-10);
    return { img: img, s: s, x: x, y: y, w: BG_W * s, h: BG_H * s };
  }

  // 배경과 같은 좌표·배율로 덧그림(그림 좌표 x, y가 왼쪽 위). 월드 화면이면 확대·축소에 맞춰 그리기 방식도 함께 바뀐다.
  function overlay(scene, p, key, x, y, depth) {
    if (!hasBg(scene, key)) return null;
    let o = scene.add.image(p.x + x * p.s, p.y + y * p.s, key).setOrigin(0, 0).setScale(p.s).setDepth(depth);
    if (p.world) {
      scene.__bgKeys = scene.__bgKeys || [];
      if (scene.__bgKeys.indexOf(key) < 0) scene.__bgKeys.push(key);
      setBgFilter(scene, key, scene.cameras.main.zoom);
    } else setBgFilter(scene, key, p.s);
    return o;
  }

  // 개선 전 강당 바닥의 매트 8장(세트 4개). wetKnown(매트 상태 점검)이면 젖은 2장(세트 1개)을 젖은 그림으로 덮고 물방울을 띄운다.
  // d: { mats, wet, drops } 깊이
  function addHallMats(scene, p, wetKnown, d) {
    let M = IMAGE_LAYOUT.hallMats, out = [];
    let m = overlay(scene, p, 'bg_hall_mats', M.x, M.y, d.mats);
    if (m) out.push(m);
    if (wetKnown) {
      let w = overlay(scene, p, 'bg_hall_mats_wet', M.wet.x, M.wet.y, d.wet);
      if (w) out.push(w);
      if (scene.textures.exists('emote_wet')) M.drops.forEach(function (pt) {
        out.push(scene.add.image(snap2(p.x + pt.x * p.s), snap2(p.y + pt.y * p.s), 'emote_wet').setOrigin(0.5, 1).setDepth(d.drops));
      });
    }
    return out;
  }

  // ---------- 화면 이동·확대 (월드 화면 카메라) ----------
  // 가장자리 이동: 화면 가장자리 zone(25%) 안에 마우스가 있으면 그 방향으로 1초에 화면 크기의 speed(30%)만큼 움직인다.
  //   (확대해도 화면 기준 속도는 같다.)
  // 확대·축소: 마우스 휠로만(마우스가 가리키는 곳을 중심으로). 화면을 열면 처음에는 그림 전체가 화면에 딱 맞는 배율(맞춤)로 시작하고,
  // 그보다 작게는 줄어들지 않으며 가장 크게 ZOOM.max배까지 확대된다.
  // 마우스가 UI의 누를 수 있는 것(버튼·요청서·대화창 등) 위에 있거나 게임 화면 밖이면 동작하지 않는다.
  // 좌표 규칙(Phaser 카메라, 원점 = 화면 가운데): 화면 = (세계 - scroll - 화면/2) × zoom + 화면/2
  let EDGE_SCROLL = { zone: 0.25, speed: 0.30 };
  let ZOOM = { max: 2, wheel: 1.0015 };   // 휠 한 칸(deltaY 약 100) ≈ 1.16배
  TYCOON.ui.art.EDGE_SCROLL = EDGE_SCROLL;
  TYCOON.ui.art.ZOOM = ZOOM;

  function worldToScreen(cam, x, y) {
    return { x: (x - cam.scrollX - cam.width / 2) * cam.zoom + cam.width / 2, y: (y - cam.scrollY - cam.height / 2) * cam.zoom + cam.height / 2 };
  }
  TYCOON.ui.art.worldToScreen = worldToScreen;

  function clampCam(cam) { cam.scrollX = cam.clampX(cam.scrollX); cam.scrollY = cam.clampY(cam.scrollY); }

  // 화면 점 (sx, sy) 아래의 세계 점이 그 자리에 머물도록 배율을 z로 바꾼다.
  function zoomAt(cam, z, sx, sy, minZ) {
    z = Math.max(minZ, Math.min(ZOOM.max, z));
    let w = cam.width, h = cam.height, z0 = cam.zoom;
    let wx = (sx - w / 2) / z0 + w / 2 + cam.scrollX, wy = (sy - h / 2) / z0 + h / 2 + cam.scrollY;
    cam.setZoom(z);
    cam.scrollX = wx - (sx - w / 2) / z - w / 2;
    cam.scrollY = wy - (sy - h / 2) / z - h / 2;
    clampCam(cam);
  }

  function uiScene(scene) {
    let ui = scene.scene.get(TYCOON.config.SCENE_KEYS.UI);
    return ui && ui.sys.isActive() ? ui : null;
  }
  function pointerOnUi(scene, p) { let ui = uiScene(scene); return !!(ui && ui.input.hitTestPointer(p).length); }

  function ensureWorldCamera(scene, w, h) {
    let cam = scene.cameras.main;
    cam.setBounds(0, 0, w, h);
    if (scene.__worldCam) return;
    scene.__worldCam = true;
    let minZ = Math.max(cam.width / w, cam.height / h);
    let filters = function () { (scene.__bgKeys || []).forEach(function (k) { setBgFilter(scene, k, cam.zoom); }); };
    // 처음에는 맞춤(그림 전체가 화면에 딱 맞는 배율)
    cam.setZoom(minZ);
    cam.centerOn(w / 2, h / 2);
    clampCam(cam);
    filters();
    let onUpdate = function (time, dt) {
      let p = scene.input.activePointer, gi = scene.sys.game.input;
      // 마우스를 한 번도 움직이지 않았으면 위치가 (0, 0)으로 남아 있어 왼쪽 위로 흘러가므로 움직인 뒤부터만 동작한다.
      if (!p || !gi.isOver || !(p.moveTime > 0) || pointerOnUi(scene, p)) return;
      let vw = cam.width, vh = cam.height, zx = vw * EDGE_SCROLL.zone, zy = vh * EDGE_SCROLL.zone;
      let dx = p.x < zx ? -1 : p.x > vw - zx ? 1 : 0;
      let dy = p.y < zy ? -1 : p.y > vh - zy ? 1 : 0;
      if (!dx && !dy) return;
      cam.scrollX += dx * vw * EDGE_SCROLL.speed * dt / 1000 / cam.zoom;
      cam.scrollY += dy * vh * EDGE_SCROLL.speed * dt / 1000 / cam.zoom;
      clampCam(cam);
    };
    let onWheel = function (pointer, over, deltaX, deltaY) {
      if (!deltaY || pointerOnUi(scene, pointer)) return;
      zoomAt(cam, cam.zoom * Math.pow(ZOOM.wheel, -deltaY), pointer.x, pointer.y, minZ);
      filters();
    };
    scene.input.on('wheel', onWheel);
    scene.events.on('update', onUpdate);
    scene.events.once('shutdown', function () {
      scene.events.off('update', onUpdate);
      scene.input.off('wheel', onWheel);
      scene.__worldCam = false;
    });
  }
  TYCOON.ui.art.ensureWorldCamera = ensureWorldCamera;

  // 월드 화면 배경: 엔딩이면 화면에 맞추고, 아니면 원래 크기로 깔고 화면 이동·확대를 켠다.
  function placeWorld(scene, key) {
    if (isEnding(scene)) return placeBg(scene, key, { x: 0, y: 0, w: 1280, h: 720 });
    let img = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(-10);
    scene.__bgKeys = scene.__bgKeys || [];
    if (scene.__bgKeys.indexOf(key) < 0) scene.__bgKeys.push(key);
    ensureWorldCamera(scene, BG_W, BG_H);
    setBgFilter(scene, key, scene.cameras.main.zoom);
    return { img: img, s: 1, x: 0, y: 0, w: BG_W, h: BG_H, world: true };
  }
  function at(p, pt) { return { x: snap2(p.x + pt.x * p.s), y: snap2(p.y + pt.y * p.s) }; }

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

  // 사람은 화면에 그리지 않는다(팀원 2 결정). 텍스처 키와 크기는 다른 Scene·테스트가 쓰므로 그대로 두고 빈 그림으로 만든다.
  // 다시 보이게 하려면 SHOW_PEOPLE = true.
  TYCOON.ui.art.SHOW_PEOPLE = false;

  function makePerson(scene, key, pal) {
    function frame(name, w, h, draw) {
      let g = scene.make.graphics({ x: 0, y: 0, add: false });
      let px = function (x, y, ww, hh, col) { g.fillStyle(hex(col), 1); g.fillRect(x * 2, y * 2, ww * 2, hh * 2); };
      if (TYCOON.ui.art.SHOW_PEOPLE) draw(px);
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
    // 하트 (아트 7×6): 개선 후 강당에서 주민 머리 위에 띄운다
    let h = scene.make.graphics({ x: 0, y: 0, add: false });
    let hp = function (x, y, w, hh, col) { h.fillStyle(col, 1); h.fillRect(x * 2, y * 2, w * 2, hh * 2); };
    hp(1, 0, 2, 1, 0xe8505b); hp(4, 0, 2, 1, 0xe8505b);
    hp(0, 1, 7, 2, 0xe8505b); hp(1, 3, 5, 1, 0xe8505b); hp(2, 4, 3, 1, 0xe8505b); hp(3, 5, 1, 1, 0xe8505b);
    hp(1, 1, 1, 1, 0xffc2c7);
    h.generateTexture('fx_heart', 14, 12);
    h.destroy();
  };

  // ---------- 걷는 인물 ----------
  // 경로를 따라 이동하며 두 프레임을 번갈아 보여준다. 좌표는 짝수로 맞춘다.
  // 사람은 걸어 다니지 않는다(팀원 2 결정, PEOPLE_WALK = false). 사람 Walker는 경로 끝에 바로 놓이고,
  // 도착 처리(onArrive)는 첫 update에서 한 번 부른다(관청 동료는 바로 자리에 앉는다).
  // 트럭처럼 texture를 준 이동체는 그대로 움직인다.
  TYCOON.ui.art.PEOPLE_WALK = false;
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
      this.arrivePending = false;
      if (!this.fixed && !TYCOON.ui.art.PEOPLE_WALK) {
        let last = points[points.length - 1];
        this.fx = last.x; this.fy = last.y;
        this.sprite.setPosition(snap2(last.x), snap2(last.y)).setDepth(last.y);
        this.done = true;
        this.arrivePending = !!this.onArrive;
      }
    }

    update(dt) {
      if (this.arrivePending) { this.arrivePending = false; this.onArrive(this); return; }
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
  // 그림을 놓을 영역: opts.rect → opts.clip → 엔딩 '전·후' 비교면 왼쪽(ox<640)·오른쪽 절반 → 없으면(null) 월드 화면(원래 크기 + 가장자리 이동)
  function hallRect(scene, opts) {
    if (opts.rect) return opts.rect;
    if (opts.clip) return opts.clip;
    if (isEnding(scene)) return opts.ox < 640 ? { x: 0, y: 92, w: 640, h: 500 } : { x: 640, y: 92, w: 640, h: 500 };
    return null;
  }

  // 배경 그림 강당: 개선 전(어둡게) / 개선 후(하트). opts.hearts === false면 정지 하트를 그리지 않는다(HallScene이 움직이는 하트를 띄움).
  function drawHallImage(scene, key, opts) {
    let r = hallRect(scene, opts);
    let p = r ? placeBg(scene, key, r) : placeWorld(scene, key);
    let objs = [p.img];
    // 개선 전: 바닥 매트, 점검 뒤 젖은 매트·물방울(물방울은 밤의 어두운 막 위에 둬서 잘 보이게)
    if (!(opts.bedded || opts.lit)) objs = objs.concat(addHallMats(scene, p, !!opts.conditionKnown, { mats: -5, wet: -4, drops: 5001 }));
    if (!opts.lit) {
      let dark = scene.add.graphics();
      dark.fillStyle(0x0b1222, 0.4);
      dark.fillRect(p.x, p.y, p.w, p.h);
      dark.setDepth(5000);
      objs.push(dark);
    } else if (opts.hearts !== false) {
      IMAGE_LAYOUT.hallHeads.forEach(function (hd, k) {
        if (k % 2) return;
        objs.push(scene.add.image(snap2(p.x + hd.x * p.s), snap2(p.y + (hd.y - 22) * p.s), 'fx_heart').setOrigin(0.5, 1).setDepth(4900));
      });
    }
    return objs;
  }

  // 엔딩 '강당의 밤': 개선 전(어두운 밤) 강당을 화면 가득 보여 준 뒤, 개선 후 강당으로 천천히 겹쳐 바뀐다(디졸브).
  // opts: { delay(ms, 기본 1200), duration(ms, 기본 1800), label: { x, y }, conditionKnown(기본 true) }
  //   label이 있으면 가운데 표시가 '전' → '후'로 바뀐다. conditionKnown이면 '전' 장면에 젖은 매트도 보인다.
  // 반환: 표시 객체 배열. 강당 그림이 없으면 null(호출하는 쪽이 예전처럼 나란히 그린다).
  TYCOON.ui.art.drawHallDissolve = function (scene, opts) {
    opts = opts || {};
    if (!hasBg(scene, BG_KEYS.hallBefore) || !hasBg(scene, BG_KEYS.hallAfter)) return null;
    let rect = { x: 0, y: 0, w: 1280, h: 720 };
    let before = placeBg(scene, BG_KEYS.hallBefore, rect);
    // 개선 전 바닥 매트(젖은 매트 포함). 깊이: 배경 -10 < 매트 < 어두운 막 -9 < 물방울 < 개선 후 -8 (개선 후가 나타나며 모두 덮는다)
    let mats = addHallMats(scene, before, opts.conditionKnown !== false, { mats: -9.6, wet: -9.5, drops: -8.9 });
    let dark = scene.add.graphics().setDepth(-9);
    dark.fillStyle(0x0b1222, 0.45); dark.fillRect(before.x, before.y, before.w, before.h);
    let after = placeBg(scene, BG_KEYS.hallAfter, rect);
    after.img.setDepth(-8).setAlpha(0);
    let hearts = IMAGE_LAYOUT.hallHeads.filter(function (hd, k) { return k % 2 === 0; }).map(function (hd) {
      return scene.add.image(snap2(after.x + hd.x * after.s), snap2(after.y + (hd.y - 22) * after.s), 'fx_heart').setOrigin(0.5, 1).setDepth(-7).setAlpha(0);
    });
    let objs = [before.img].concat(mats, [dark, after.img], hearts);
    let label = null;
    if (opts.label) {
      label = TYCOON.ui.text(scene, opts.label.x, opts.label.y, '전', { size: 18, bold: true, color: '#c9c0aa', origin: [0.5, 0], stroke: '#0f1628', strokeThickness: 5 });
      objs.push(label);
    }
    let delay = opts.delay === undefined ? 1200 : opts.delay, dur = opts.duration || 1800;
    let fadeIn = [after.img].concat(hearts);
    scene.tweens.add({ targets: fadeIn, alpha: 1, delay: delay, duration: dur, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: dark, alpha: 0, delay: delay, duration: dur, ease: 'Sine.easeInOut' });
    let swap = label ? scene.time.delayedCall(delay + dur / 2, function () { if (label.scene) label.setText('후').setColor('#ffe066'); }) : null;
    // 장면이 넘어가 지워지면 남은 애니메이션·예약을 멈춘다
    after.img.once('destroy', function () {
      scene.tweens.killTweensOf(fadeIn.concat([dark]));
      if (swap) swap.remove(false);
    });
    return objs;
  };

  // opts: { bedded, lit, conditionKnown, ox, oy, cols, rows, label, clip, rect, hearts }
  TYCOON.ui.art.drawHall = function (scene, state, opts) {
    opts = opts || {};
    let bgKey = (opts.bedded || opts.lit) ? BG_KEYS.hallAfter : BG_KEYS.hallBefore;
    if (hasBg(scene, bgKey)) return drawHallImage(scene, bgKey, opts);
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
    if (hasBg(scene, BG_KEYS.office)) {
      // 배경 그림 관청: 화면 전체. 사람은 그리지 않는다. seat2는 두 번째 업무석 좌표(OfficeScene·EndingScene이 사용)
      let L = IMAGE_LAYOUT.office;
      // 엔딩은 원래 크기로 사무실 가운데를 보여 준다(EndingScene이 동료 그림을 원래 크기로 붙이므로 비율을 맞춤)
      let pb = isEnding(scene) ? placeBgAt(scene, BG_KEYS.office, 1, L.endingView.x, L.endingView.y) : placeWorld(scene, BG_KEYS.office);
      let seat2 = at(pb, L.seat2), objsO = [pb.img];
      // 채용한 동료는 사용자 그림(art_colleague_seat)으로 두 번째 업무석에 앉힌다. OfficeScene·EndingScene이 붙이는 colleague_sit은 빈 임시 텍스처라 겹쳐도 보이지 않는다.
      if (state && state.staff && state.staff.hired && hasBg(scene, 'art_colleague_seat')) {
        objsO.push(scene.add.image(seat2.x, seat2.y, 'art_colleague_seat').setOrigin(0.5, 1).setScale(pb.s).setDepth(seat2.y + 1));
      }
      return { objs: objsO, seat2: seat2, door: at(pb, L.door), d1: null, d2: null };
    }
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
    if (hasBg(scene, BG_KEYS.region)) {
      // 배경 그림 지역: 화면 전체. hit 형식은 도형 그림과 같다({ def, x, y }, 'hall' 필수).
      let pr = placeWorld(scene, BG_KEYS.region);
      let objsI = [pr.img], hitI = [];
      REGION_BUILDINGS.concat(IMAGE_LAYOUT.region.extra).forEach(function (b) {
        let src = IMAGE_LAYOUT.region.buildings[b.id];
        if (!src) return;
        let pos = at(pr, src);
        if (!b.noLabel) {
          let label = TYCOON.ui.text(scene, pos.x, pos.y - 56 * pr.s, b.name, { size: 12, origin: [0.5, 1], color: '#f4ecd8' });
          label.setBackgroundColor('#1e2b47cc').setPadding(6, 3, 6, 3).setDepth(4000);
          objsI.push(label);
        }
        hitI.push({ def: b, x: pos.x, y: pos.y });
      });
      return { objs: objsI, hit: hitI };
    }
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

  // 지역 화면 배치: 납품 트럭 경로(월드 좌표). 배경 그림이 있으면 그림 기준, 없으면 도형 지도 기준.
  TYCOON.ui.art.regionLayout = function (scene, ox, oy) {
    let copy = function (p) { return { x: p.x, y: p.y }; };
    if (hasBg(scene, BG_KEYS.region)) {
      let R = IMAGE_LAYOUT.region;
      return { paths: [], truck: { from: copy(R.truck.from), to: copy(R.truck.to) } };
    }
    return { paths: TYCOON.ui.art.regionPaths(ox, oy), truck: { from: iso(7.4, 9.4, ox, oy), to: iso(3.8, 9.4, ox, oy) } };
  };
})();
