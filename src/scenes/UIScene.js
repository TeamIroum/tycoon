/**
 * 관청 업무 UI: 상단 바, 우측 지도·요청서·월 진행, 하단 메뉴, 단계별 팝업, 안내 화살표 (기능정의서 F-17) (담당: 팀원 4)
 * 상태는 TutorialFlow.view()로 읽고, 바꾸는 일은 UIScene의 버튼이 flow.dispatch로 한다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const SCENES = (TYCOON.scenes = TYCOON.scenes || {});
  const K = TYCOON.config.SCENE_KEYS;
  let MAP = { x: 984, y: 8, w: 288, h: 240 };
  let REQ = { x: 984, y: 256, w: 288, h: 200 };
  let ADV = { x: 992, y: 466, w: 272, h: 76 };
  let MENU = { x: 534, y: 642, w: 636, h: 70 };
  let HELP = { x: 1180, y: 642, w: 92, h: 70 };
  let WORLD_CX = 488;
  let CSS = function () { return TYCOON.ui.THEME.css; };
  let JUDGE_COLOR = { '충족': '#23705f', '보완': '#9a6b12', '미흡': '#b23a22' };


  class UIScene extends Phaser.Scene {
    constructor() { super({ key: K.UI }); }

    create() {
      let self = this;
      this.store = TYCOON.app.store; // flow를 감싼 얇은 어댑터 (main.js)
      this.view = K.OFFICE;
      this.popup = null; // 'step' | 'contract' | 'help' | 'info'
      this.info = null;
      this.selected = null;
      this.toast = null;
      this.targets = {};
      this.dyn = this.add.container(0, 0);
      this.guide = this.add.container(0, 0).setDepth(900);
      this.tweens.add({ targets: this.guide, y: 6, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.dialog = new TYCOON.ui.MascotDialog(this, this.store);
      this.dialog.onClose = function () { self.render(); };

      let off = this.store.subscribe(function (s, events) { self.onChange(s, events); });
      let onInfo = function (info) { self.popup = 'info'; self.info = info; self.render(); };
      let onInspect = function () { self.popup = 'step'; self.render(); };
      let onMarker = function () { self.render(); };
      this.game.events.on('pt:info', onInfo);
      this.game.events.on('pt:inspect', onInspect);
      this.game.events.on('pt:marker', onMarker);
      this.events.once('shutdown', function () {
        off();
        self.game.events.off('pt:info', onInfo);
        self.game.events.off('pt:inspect', onInspect);
        self.game.events.off('pt:marker', onMarker);
      });

      let s = this.store.getState();
      if (s.pending === 'INSPECTION') this.switchView(K.VILLAGE);
      else if (s.phase !== 'PLAN') this.popup = 'step';
      this.render();
      (TYCOON.app.pendingEvents || []).forEach(function (e) { self.triggerDialog(e); });
      TYCOON.app.pendingEvents = [];
    }

    // ---------- 상태 변화 ----------
    onChange(s, events) {
      let self = this;
      let has = function (e) { return events.indexOf(e) !== -1; };
      if (has('PROPOSAL_REVIEW') || has('PARTIAL_DELIVERY') || has('CONTRACT_SIGNED') || has('RECRUIT_OPENED') || (has('MONTH_PLAN') && s.month === 2)) this.popup = 'step';
      if (has('INSPECTION_READY')) { this.popup = null; this.switchView(K.VILLAGE); }
      if (has('USE_STARTED')) {
        // 지역 화면의 사용 개시 장면을 잠깐 보여준 뒤 성과평가 창을 연다.
        this.popup = null;
        this.time.delayedCall(2400, function () { self.popup = 'step'; self.render(); });
      }
      if (has('HIRED')) {
        // 동료가 걸어 들어와 앉는 모습을 보여준 뒤 완료 창을 연다.
        this.popup = null;
        this.switchView(K.OFFICE);
        this.time.delayedCall(2800, function () { self.popup = 'step'; self.render(); });
      }
      this.render();
      events.forEach(function (e) { self.triggerDialog(e); });
    }

    triggerDialog(event) {
      let id = TYCOON.ui.SCENARIO.dialogTriggers[event];
      if (!id) return;
      if (event === 'MONTH_PLAN' && this.store.getState().month !== 2) return;
      this.dialog.trigger(id);
    }

    cmd(type, payload) {
      if (this.dialog.isOpen()) return null;
      let r = this.store.dispatch(type, payload);
      if (!r.ok) this.showToast(r.error, CSS().bad);
      return r;
    }

    showToast(text, color) {
      let self = this;
      this.toast = { text: text, color: color || CSS().ink };
      this.render();
      if (this.toastTimer) this.toastTimer.remove();
      this.toastTimer = this.time.delayedCall(2600, function () { self.toast = null; self.render(); });
    }

    switchView(key) {
      if (key === this.view) { this.render(); return; }
      this.scene.stop(this.view);
      this.scene.run(key);
      this.view = key;
      this.scene.bringToTop();
      this.render();
    }

    openStep() {
      let s = this.store.getState();
      // 검사·검수는 지역 화면의 학당 표식에서 연다(스토리보드 장면 6).
      if (s.pending === 'INSPECTION' && !this.registry.get('markerPos')) {
        this.popup = null; this.switchView(K.VILLAGE); return;
      }
      this.popup = 'step';
      this.render();
      if (s.month === 1 && s.phase === 'PLAN') this.dialog.trigger('request');
    }

    // ---------- 그리기 ----------
    add2(obj) { this.dyn.add(obj); return obj; }
    t(x, y, str, opts) { return this.add2(TYCOON.ui.text(this, x, y, str, opts)); }
    btn(x, y, w, h, label, fn, opts) {
      opts = opts || {};
      if (opts.id) this.targets[opts.id] = { x: x, y: y, w: w, h: h };
      return this.add2(TYCOON.ui.button(this, x, y, w, h, label, fn, opts));
    }

    render() {
      let s = this.store.getState();
      if (!s) return;
      this.dyn.removeAll(true);
      this.targets = {};
      this.drawTop(s);
      if (s.fatal) this.t(640, 24, '복구 불가능 오류가 발생했습니다. 새 게임을 시작해 주세요.', { size: 17, bold: true, color: CSS().bad, origin: [0.5, 0] });
      this.drawRight(s);
      this.drawBottom(s);
      if (!this.dialog.isOpen()) this.drawGuideBox(s);
      if (this.popup === 'step') this.drawStep(s);
      if (this.popup === 'contract') this.drawContract(s);
      if (this.popup === 'help') this.drawHelp(s);
      if (this.popup === 'info') this.drawInfo();
      this.drawGuideArrow(s);
      if (s.fatal) {
        let veil = this.add2(this.add.graphics().setDepth(2000)); veil.fillStyle(0x111827, 0.94); veil.fillRect(0, 0, 1280, 720);
        this.add2(TYCOON.ui.text(this, 640, 270, '복구할 수 없는 오류가 발생했습니다.', { size: 24, bold: true, color: CSS().light, origin: [0.5, 0.5] }).setDepth(2001));
        this.add2(TYCOON.ui.text(this, 640, 315, '진행 중인 명령을 중단했습니다. 새 게임을 시작해 주세요.', { size: 17, color: CSS().lightMuted, origin: [0.5, 0.5] }).setDepth(2001));
        this.btn(500, 360, 280, 52, '새 게임 시작', () => { TYCOON.app.flow.newGame(); this.scene.start(K.TITLE); }, { id: 'fatalNewGame' }).setDepth(2002);
      }
      let dbg = TYCOON.app.debugTargets || {};
      Object.keys(this.targets).forEach(function (k) { dbg[k] = this.targets[k]; }, this);
      dbg.marker = this.registry.get('markerPos') || null;
      TYCOON.app.debugTargets = dbg;
    }

    phaseLabel(s) {
      if (s.phase === 'PLAN') return s.month + '월차 월초 계획';
      if (s.phase === 'PAUSED') return s.month + '월차 진행 중';
      if (s.phase === 'REPORT') return s.month + '월차 월말 보고';
      if (s.phase === 'RECRUIT') return '첫 동료 모집';
      return '튜토리얼 완료';
    }

    drawTop(s) {
      let x = 200, w = 768;
      this.add2(TYCOON.ui.paper(this, x, 6, w, 46));
      this.t(x + 20, 18, this.phaseLabel(s), { size: 18, bold: true });
      let active = s.project.status === 'COMPLETED' ? 0 : 1;
      this.t(x + 214, 20, '진행 업무 ' + active + '건', { size: 15 });
      let grade = s.evaluation ? s.evaluation.grade + ' ' + TYCOON.config.BALANCE.gradeLabels[s.evaluation.grade] : '평가 전';
      this.t(x + 340, 20, '종합 등급 ' + grade, { size: 15, bold: !!s.evaluation, color: s.evaluation ? CSS().warn : CSS().muted });
      let unit = TYCOON.config.BALANCE.currencyUnit;
      this.t(x + w - 20, 20, '집행 가능 ' + (s.budget.total - s.budget.spent) + unit + ' / ' + s.budget.total + unit, { size: 15, origin: [1, 0] });
      let g = this.add2(this.add.graphics());
      g.fillStyle(TYCOON.ui.THEME.paperLine, 1);
      [196, 324, 500].forEach(function (dx) { g.fillRect(x + dx, 16, 2, 26); });

      let save = TYCOON.app.saveStatus || (TYCOON.app.autoSave && TYCOON.app.autoSave.lastResult);
      let saveFailed = save && save.ok === false && ['STORAGE_UNAVAILABLE', 'READ_FAILED', 'WRITE_FAILED', 'CLEAR_FAILED'].includes(save.reason);
      if (saveFailed) {
        this.t(x + 8, 58, '진행 상황이 저장되지 않았습니다', { size: 13, bold: true, color: CSS().bad }).setBackgroundColor('#f8e4df').setPadding(8, 4, 8, 4);
      }
      if (this.toast) {
        let toastY = saveFailed ? 91 : 58;
        this.t(x + w, toastY, this.toast.text, { size: 13, color: this.toast.color || CSS().ink, origin: [1, 0] }).setBackgroundColor('#f1e6cc').setPadding(8, 4, 8, 4);
      }
    }

    drawRight(s) {
      let self = this;
      let T = TYCOON.ui.THEME;
      // 지역 지도 (미니). 누르면 지역 화면과 관청을 오간다.
      this.add2(TYCOON.ui.paper(this, MAP.x, MAP.y, MAP.w, MAP.h, { header: 34 }));
      this.t(MAP.x + 16, MAP.y + 12, '지역 지도', { size: 16, bold: true, color: CSS().paper });
      let g = this.add2(this.add.graphics());
      let cx = MAP.x + MAP.w / 2, cy = MAP.y + 140;
      g.fillStyle(0x6f6a4e, 1);
      g.fillPoints([{ x: cx, y: cy - 75 }, { x: cx + 120, y: cy }, { x: cx, y: cy + 75 }, { x: cx - 120, y: cy }], true);
      g.fillStyle(0x3d5e73, 1);
      g.fillPoints([{ x: cx + 50, y: cy - 44 }, { x: cx + 74, y: cy - 32 }, { x: cx - 10, y: cy + 70 }, { x: cx - 34, y: cy + 58 }], true);
      let spots = [
        ['관청', -60, -24, 0x2f6f8f], ['학당', -64, 26, s.region.hallLit ? 0xe0b44c : 0x6b6258],
        ['공방', -8, 30, 0x2f7a6b], ['다리 끊김', 46, -6, 0xc2462e]
      ];
      spots.forEach(function (sp) {
        g.fillStyle(sp[3], 1); g.fillRect(cx + sp[1] - 7, cy + sp[2] - 7, 14, 14);
        self.t(cx + sp[1], cy + sp[2] - 10, sp[0], { size: 12, bold: true, origin: [0.5, 1] }).setBackgroundColor('#f1e6cc').setPadding(4, 1, 4, 1);
      });
      let mz = this.add2(this.add.zone(MAP.x, MAP.y + 34, MAP.w, MAP.h - 34).setOrigin(0, 0).setInteractive({ useHandCursor: true }));
      mz.on('pointerup', function () { self.switchView(self.view === K.VILLAGE ? K.OFFICE : K.VILLAGE); });

      // 조달 요청서 목록 (첫 버전은 1건. 잠긴 칸은 두지 않는다: 기획서 v0.8 3장)
      let sc = TYCOON.ui.SCENARIO.project;
      this.add2(TYCOON.ui.paper(this, REQ.x, REQ.y, REQ.w, REQ.h, { header: 34 }));
      this.t(REQ.x + 16, REQ.y + 12, '조달 요청서 1건', { size: 16, bold: true, color: CSS().paper });
      let cxr = REQ.x + 14, cyr = REQ.y + 50, cw = REQ.w - 28, ch = 84;
      let cg = this.add2(this.add.graphics());
      cg.fillStyle(T.paperHi, 1); cg.fillRect(cxr, cyr, cw, ch);
      cg.lineStyle(2, this.popup === 'step' ? T.ochre : T.paperLine, 1); cg.strokeRect(cxr + 1, cyr + 1, cw - 2, ch - 2);
      cg.fillStyle(0xc9b58a, 1); cg.fillRect(cxr + 12, cyr + 30, 40, 16);
      cg.fillStyle(0xd9d2c3, 1); cg.fillRect(cxr + 26, cyr + 22, 24, 12);
      cg.fillStyle(0x8a7a58, 1); cg.fillRect(cxr + 12, cyr + 46, 40, 4);
      this.t(cxr + 66, cyr + 10, sc.title, { size: 16, bold: true });
      this.t(cxr + 66, cyr + 34, sc.requester, { size: 13, color: CSS().muted });
      this.t(cxr + 66, cyr + 56, TYCOON.ui.STATUS_LABEL[s.project.status], { size: 13, bold: true, color: s.project.status === 'COMPLETED' ? CSS().ok : CSS().warn });
      this.t(cxr + cw - 12, cyr + 56, '기한 2월차', { size: 13, color: CSS().bad, origin: [1, 0] });
      this.targets.requestCard = { x: cxr, y: cyr, w: cw, h: ch };
      let rz = this.add2(this.add.zone(cxr, cyr, cw, ch).setOrigin(0, 0).setInteractive({ useHandCursor: true }));
      rz.on('pointerup', function () { if (self.popup === 'step') { self.popup = null; self.render(); } else self.openStep(); });
      this.t(REQ.x + 16, REQ.y + 146, '다른 요청은 다음 과제에서 들어옵니다.', { size: 12, color: CSS().muted, width: REQ.w - 32 });

      // 월 진행
      let ready = TYCOON.app.flow.planReady();
      let label = { PLAN: s.month + '월차 진행\n(월초 계획 확정)', PAUSED: '진행 중', REPORT: '월말 보고 중', RECRUIT: '모집 중', END: '진행 완료' }[s.phase];
      let b = this.btn(ADV.x, ADV.y, ADV.w, ADV.h, label, function () {
        b.setEnabled(false); // 같은 프레임의 중복 입력 방지
        self.cmd('ADVANCE_MONTH');
      }, { variant: 'gold', enabled: ready.ready, size: 18, id: 'advance' });
      if (s.phase === 'PLAN' && !ready.ready && ready.reason) {
        this.t(ADV.x + ADV.w / 2, ADV.y + ADV.h + 8, ready.reason, { size: 12, origin: [0.5, 0], width: ADV.w, align: 'center' }).setBackgroundColor('#f1e6cc').setPadding(6, 3, 6, 3);
      }
    }

    drawBottom(s) {
      let self = this;
      this.add2(TYCOON.ui.paper(this, MENU.x, MENU.y, MENU.w, MENU.h));
      let items = [
        ['요청함', function () { if (self.popup === 'step') { self.popup = null; self.render(); } else self.openStep(); }, self.popup === 'step', 'menuRequest'],
        ['계약 현황', function () { self.popup = self.popup === 'contract' ? null : 'contract'; self.render(); }, self.popup === 'contract', 'menuContract'],
        ['관청', function () { self.switchView(K.OFFICE); }, self.view === K.OFFICE, 'menuOffice'],
        ['지역 지도', function () { self.switchView(K.VILLAGE); }, self.view === K.VILLAGE, 'menuRegion'],
        ['강당', function () { self.switchView(K.HALL); }, self.view === K.HALL, 'menuHall']
      ];
      items.forEach(function (it, k) {
        self.btn(MENU.x + 14 + k * 122, MENU.y + 14, 114, 42, it[0], it[1], { variant: it[2] ? 'tab-on' : 'paper', id: it[3] });
      });
      this.add2(TYCOON.ui.paper(this, HELP.x, HELP.y, HELP.w, HELP.h));
      this.btn(HELP.x + 10, HELP.y + 14, HELP.w - 20, 42, '도움말', function () { self.popup = self.popup === 'help' ? null : 'help'; self.render(); }, { variant: self.popup === 'help' ? 'tab-on' : 'paper', id: 'help' });
    }

    // 좌하단 단계 안내 (대화가 없을 때)
    stepText(s) {
      if (s.phase === 'PLAN' && s.month === 1) {
        if (this.popup !== 'step' && !s.project.quantities) return '1단계: 오른쪽 조달 요청서를 눌러 요청서를 열어 보세요.';
        if (!s.project.quantities) return '2단계: 요청 내용과 재고를 확인하고 부족 수량을 확정하세요.';
        return '3단계: 오른쪽의 1월차 진행을 누르면 제안 검토로 넘어가요.';
      }
      if (s.pending === 'PROPOSAL_REVIEW') return '4단계: 적격 여부와 판단 근거를 확인하고 계약을 확정하세요.';
      if (s.phase === 'REPORT' && s.month === 1) return '5단계: 1월차 월말 보고를 확인하세요.';
      if (s.phase === 'PLAN') return '6단계: 오른쪽의 2월차 진행을 눌러 납품을 시작하세요.';
      if (s.pending === 'PARTIAL_DELIVERY') return '7단계: 공방과 일정을 협의하고 지급 순서를 확인하세요.';
      if (s.pending === 'INSPECTION') return this.view === K.VILLAGE ? '8단계: 물품이 도착하면 학당 위 표식을 눌러 검사·검수 결과를 확인하세요.' : '8단계: 아래 지역 지도를 눌러 납품 현장을 보세요.';
      if (s.phase === 'REPORT') return '9단계: 첫 성과평가 결과를 확인하세요.';
      if (s.phase === 'RECRUIT') return '10단계: 후보 3명을 비교해 1명을 선발하세요.';
      return '튜토리얼을 마쳤어요. 마무리 장면을 보세요.';
    }

    drawGuideBox(s) {
      let L = TYCOON.ui.DIALOG_LAYOUT;
      let c = this.add2(this.add.container(0, 0));
      TYCOON.ui.drawMascotBox(this, c, L, '달이', false);
      c.add(TYCOON.ui.text(this, L.x + 20, L.y + 14, '달이', { size: 14, bold: true, color: CSS().ok }));
      c.add(TYCOON.ui.text(this, L.x + 20, L.y + 40, this.stepText(s), { size: 15, width: L.w - 40, lineSpacing: 6 }));
    }

    // ---------- 안내 화살표 ----------
    // 판단 포인트(매트 상태 점검)는 화살표로 알려주지 않는다. 정답 맞히기가
    // 되지 않게 하고, 빠뜨리면 달이 힌트로 알려준다(기획서 v0.8 4장).
    guideTarget(s) {
      if (this.dialog.isOpen()) return null;
      let tg = this.targets;
      let pick = function (id, label, sub) { return tg[id] ? { r: tg[id], label: label, sub: sub } : null; };
      if (this.popup === 'help' || this.popup === 'contract' || this.popup === 'info') return null;
      if (s.pending === 'INSPECTION' && this.popup !== 'step') {
        let m = this.registry.get('markerPos');
        if (this.view === K.VILLAGE && m) return { r: m, label: '여기를 클릭!', sub: '[검사·검수 결과 확인]' };
        if (this.view !== K.VILLAGE) return pick('menuRegion', '클릭!', '[납품 현장 보기]');
        return null;
      }
      if (this.popup !== 'step') {
        if (s.phase === 'PLAN' && s.month === 1 && !s.project.quantities) return pick('requestCard', '여기를 클릭!', '[첫 조달 요청서 열기]');
        if (s.phase === 'PLAN' && TYCOON.app.flow.planReady().ready) return pick('advance', '클릭!', '[이번 달 진행]');
        if (s.phase !== 'PLAN') return pick('requestCard', '클릭!', '[작업 열기]');
        return null;
      }
      if (s.phase === 'PLAN' && s.month === 1) {
        let c = s.project.checks;
        if (!c.residents) return pick('chkResidents', '클릭!', '[주민 수 확인]');
        if (!c.userSpec) return pick('chkUserSpec', '클릭!', '[사용자 규격 확인]');
        if (!c.inventoryCount) return pick('chkInventory', '클릭!', '[재고 수량 세기]');
        if (!s.project.quantities) return pick('confirmQty', '클릭!', '[부족 수량 확정]');
        return pick('advance', '클릭!', '[1월차 진행]');
      }
      if (s.phase === 'PLAN') return pick('advance', '클릭!', '[2월차 진행]');
      if (s.pending === 'PROPOSAL_REVIEW') return pick('sign', '클릭!', '[계약 체결]');
      if (s.pending === 'PARTIAL_DELIVERY') return s.project.event.supplierNegotiated ? pick('confirmReq', '클릭!', '[지급 순서 확인]') : pick('negotiate', '클릭!', '[일정 협의]');
      if (s.pending === 'INSPECTION') return pick('inspect', '클릭!', '[사용 개시]');
      if (s.phase === 'REPORT') return pick('closeReport', '클릭!', s.month === 1 ? '[2월차 계획으로]' : '[정원 승인 확인]');
      if (s.phase === 'RECRUIT') return this.selected ? pick('hire', '클릭!', '[선발 확정]') : pick('cand1', '후보를 골라', '클릭!');
      if (s.phase === 'END') return pick('ending', '클릭!', '[마무리 장면]');
      return null;
    }

    drawGuideArrow(s) {
      this.guide.removeAll(true);
      if (s.fatal) return;
      // The three candidate cards fill the center of the recruitment panel.
      // The generic arrow label overlaps neighboring choices there; the
      // tutorial instruction remains visible in the guide box below.
      if (s.phase === 'RECRUIT') return;
      let g = this.guideTarget(s);
      if (!g) return;
      let r = g.r;
      let dir, tx, ty;
      if (r.x > 900) { dir = 'right'; tx = r.x - 6; ty = r.y + r.h / 2; }
      else if (r.y > 600) { dir = 'down'; tx = r.x + r.w / 2; ty = r.y - 6; }
      else if (r.x + r.w + 200 < 980) { dir = 'left'; tx = r.x + r.w + 6; ty = r.y + r.h / 2; }
      else { dir = 'right'; tx = r.x - 6; ty = r.y + r.h / 2; }
      this.guide.add(TYCOON.ui.arrow(this, tx, ty, dir, g.label, g.sub));
    }

    // ---------- 팝업 ----------
    frame(w, h, title) {
      let self = this;
      let x = TYCOON.ui.snap2(WORLD_CX - w / 2), y = TYCOON.ui.snap2(64 + Math.max(0, (522 - h) / 2));
      let shade = this.add2(this.add.graphics());
      shade.fillStyle(0x0b1222, 0.25); shade.fillRect(x + 6, y + 6, w, h);
      this.add2(TYCOON.ui.paper(this, x, y, w, h, { header: 40 }));
      this.t(x + 20, y + 14, title, { size: 18, bold: true, color: CSS().paper });
      this.btn(x + w - 44, y + 10, 30, 28, '×', function () { self.popup = null; self.render(); }, { variant: 'paper', size: 16, id: 'popupClose' });
      return { x: x, y: y + 44, w: w, h: h - 44, cx: x + 20, right: x + w - 20 };
    }

    row(F, y, label, value, done, btnLabel, onClick, enabled, id) {
      this.t(F.cx, y + 6, label, { size: 14, color: CSS().muted });
      this.t(F.cx + 150, y + 6, value, { size: 14, width: F.w - 340, color: done ? CSS().ink : CSS().bad });
      if (btnLabel) this.btn(F.right - 140, y, 140, 32, done ? '확인함' : btnLabel, onClick, { enabled: !done && enabled !== false, size: 14, variant: done ? 'paper' : 'primary', id: id });
    }

    section(F, y, str) { this.t(F.cx, y, str, { size: 15, bold: true, color: CSS().ok }); }

    drawStep(s) {
      if (s.phase === 'PLAN' && s.month === 1) return this.stepRequest(s);
      if (s.phase === 'PLAN') return this.stepPlan2(s);
      if (s.pending === 'PROPOSAL_REVIEW') return this.stepProposals(s);
      if (s.pending === 'PARTIAL_DELIVERY') return this.stepPartial(s);
      if (s.pending === 'INSPECTION') return this.stepInspection(s);
      if (s.phase === 'REPORT') return this.stepReport(s);
      if (s.phase === 'RECRUIT') return this.stepRecruit(s);
      return this.stepEnd(s);
    }

    stepRequest(s) {
      let self = this;
      let sc = TYCOON.ui.SCENARIO.project;
      let c = s.project.checks, r = sc.residents, inv = sc.inventory, specs = TYCOON.data.SPECS;
      let F = this.frame(660, 522, '조달 요청서 상세 확인 (' + sc.place + ')');
      let y = F.y + 10;
      this.t(F.cx, y, sc.requester + '가 강당에 머무는 주민의 잠자리(매트·침구)를 요청했습니다.', { size: 14, width: F.w - 40 });
      y += 34; this.section(F, y, '요청 내용 확인');
      this.row(F, y + 26, '주민 수·연령 구성', c.residents ? r.total + '명 (성인 ' + r.adults + ', 고령자 ' + r.elderly + ', 아동 ' + r.children + ')' : '미확인', c.residents, '확인', function () { self.cmd('CHECK_RESIDENTS'); }, true, 'chkResidents');
      this.row(F, y + 66, '사용자 규격', c.userSpec ? sc.userSpecCheck.resultText : '미확인', c.userSpec, '요청기관에 확인', function () { self.cmd('CHECK_USER_SPEC'); }, true, 'chkUserSpec');
      this.row(F, y + 130, '필수 규격', s.project.requiredSpecs.map(function (k) { return specs[k]; }).join(', '), true);
      this.row(F, y + 156, '희망 사항', sc.optionalSpecs.map(function (k) { return specs[k]; }).join(', ') + ' (필수 아님)', true);
      y += 196; this.section(F, y, '남은 재고');
      this.row(F, y + 26, '재고 수량', c.inventoryCount ? '매트 ' + inv.mattress.count + '개, 침구 ' + inv.bedding.count + '세트' : '미확인', c.inventoryCount, '수량 세기', function () { self.cmd('CHECK_INVENTORY_COUNT'); }, true, 'chkInventory');
      let condText = c.mattressCondition ? '젖은 매트 ' + inv.mattress.wet + '개, 쓸 수 있는 매트 ' + (inv.mattress.count - inv.mattress.wet) + '개' : (c.inventoryCount ? '점검 전' : '수량을 먼저 세세요');
      this.row(F, y + 66, '매트 상태', condText, c.mattressCondition, '상태 점검', function () { self.cmd('CHECK_MATTRESS_CONDITION'); }, c.inventoryCount, 'chkCondition');
      y += 112; this.section(F, y, '부족 수량');
      let q = s.project.quantities;
      if (q) {
        this.t(F.cx, y + 28, '매트 ' + q.mattress + '개, 침구 ' + q.bedding + '세트로 확정했습니다.', { size: 16, bold: true });
        this.t(F.cx, y + 56, '오른쪽의 1월차 진행을 누르면 제안 검토로 넘어갑니다.', { size: 13, color: CSS().muted });
      } else {
        let complete = TYCOON.app.flow.requestComplete();
        this.t(F.cx, y + 30, complete ? '주민 수에서 쓸 수 있는 재고를 빼 부족 수량을 정합니다.' : '요청 내용과 재고 수량을 확인하면 확정할 수 있습니다.', { size: 13, color: CSS().muted, width: 400 });
        this.btn(F.right - 190, y + 22, 190, 40, '부족 수량 확정', function () { self.cmd('CONFIRM_QUANTITIES'); }, { enabled: complete, id: 'confirmQty' });
      }
    }

    stepPlan2(s) {
      let c = s.project.contract;
      let F = this.frame(560, 300, '2월차 월초 계획');
      this.section(F, F.y + 14, '이번 달 할 일');
      this.t(F.cx, F.y + 42, '1. ' + c.supplierName + '의 납품 대응\n2. 검사·검수 결과 확인과 사용 개시', { size: 15, lineSpacing: 8 });
      this.section(F, F.y + 112, '계약');
      this.t(F.cx, F.y + 140, '매트 ' + c.quantities.mattress + '개, 침구 ' + c.quantities.bedding + '세트, ' + c.amount + TYCOON.config.BALANCE.currencyUnit + '\n계약 후 ' + c.deliveryWeeks + '주 이내 납품', { size: 15, lineSpacing: 8 });
      this.t(F.cx, F.y + 210, '준비가 되면 오른쪽의 2월차 진행을 누르세요.', { size: 13, color: CSS().muted });
    }

    stepProposals(s) {
      let self = this;
      let T = TYCOON.ui.THEME;
      let w = TYCOON.config.BALANCE.weights;
      let ev = TYCOON.ui.proposalRows();
      let q = s.project.quantities;
      let unit = TYCOON.config.BALANCE.currencyUnit;
      let F = this.frame(780, 522, '공급기업 제안 검토 및 적격 판정');
      this.t(F.cx, F.y + 8, '계약 방식: ' + TYCOON.ui.SCENARIO.project.contractMethod + '   계약 수량: 매트 ' + q.mattress + '개, 침구 ' + q.bedding + '세트', { size: 13 });
      this.t(F.cx, F.y + 30, '평가 기준(임시, 초기 검토안): 필수 조건을 충족한 제안을 가격 ' + w.price + ', 품질 ' + w.quality + ', 납기 ' + w.delivery + '점으로 비교', { size: 13, color: CSS().muted });
      this.t(F.cx, F.y + 50, '필수 규격·평가 기준의 임의 변경과 선호 기업의 임의 선정은 할 수 없습니다.', { size: 13, bold: true, color: CSS().bad });
      let allSpecs = s.project.requiredSpecs.concat(TYCOON.ui.SCENARIO.project.optionalSpecs);
      ev.rows.forEach(function (r, k) {
        let x = F.cx, y = F.y + 78 + k * 112, cw = F.w - 40, ch = 104;
        let g = self.add2(self.add.graphics());
        g.fillStyle(T.paperHi, 1); g.fillRect(x, y, cw, ch);
        g.lineStyle(2, r.id === ev.winnerId ? T.ochre : (r.eligible ? T.paperLine : T.vermilion), 1); g.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
        self.t(x + 14, y + 8, r.name, { size: 17, bold: true });
        self.t(x + 14, y + 34, r.kind + '   계약 금액 ' + r.cost + unit + '   납품 ' + r.deliveryWeeks + '주', { size: 13, color: CSS().muted });
        let sx = x + 14;
        allSpecs.forEach(function (key) {
          let has = r.specs.indexOf(key) !== -1;
          let req = s.project.requiredSpecs.indexOf(key) !== -1;
          let tx = self.t(sx, y + 58, (has ? '충족 ' : '없음 ') + TYCOON.data.SPECS[key] + (req ? '' : '(희망)'), { size: 12, color: has ? CSS().ok : (req ? CSS().bad : CSS().muted) });
          sx += tx.width + 16;
        });
        if (r.eligible) {
          self.t(x + cw - 14, y + 8, '적격 판정  ' + r.score + '점', { size: 17, bold: true, origin: [1, 0], color: r.id === ev.winnerId ? CSS().warn : CSS().ok });
          self.t(x + cw - 14, y + 34, '가격 ' + r.scoreParts.price + '  품질 ' + r.scoreParts.quality + '  납기 ' + r.scoreParts.delivery, { size: 12, origin: [1, 0], color: CSS().muted });
          if (r.id === ev.winnerId) self.t(x + 14, y + 80, '평가 1순위', { size: 13, bold: true, color: CSS().warn });
        } else {
          self.t(x + cw - 14, y + 8, '부적격 - 선택 불가', { size: 17, bold: true, origin: [1, 0], color: CSS().bad });
          self.t(x + 14, y + 80, r.reasons.join(', '), { size: 13, color: CSS().bad });
        }
      });
      let win = ev.rows.filter(function (r) { return r.id === ev.winnerId; })[0];
      let avail = s.budget.total - s.budget.spent;
      if (win) this.t(F.cx, F.y + F.h - 36, '계약하면 집행 가능액 ' + avail + ' → ' + (avail - win.cost) + unit, { size: 13, color: CSS().muted });
      this.btn(F.right - 300, F.y + F.h - 50, 300, 40, '적격 1순위와 계약 체결 및 이행 시작', function () { self.cmd('SIGN_CONTRACT'); }, { enabled: !!win, size: 15, id: 'sign' });
    }

    stepPartial(s) {
      let self = this;
      let pd = TYCOON.ui.SCENARIO.project.partialDelivery;
      let c = s.project.contract, ev = s.project.event;
      let F = this.frame(660, 400, '일부 납품 대응');
      this.t(F.cx, F.y + 10, c.supplierName + '의 완제품 침구가 모자라 일부만 먼저 들어왔습니다. 기한 안에 해결하면 평가에 불이익이 없습니다.', { size: 14, width: F.w - 40 });
      this.section(F, F.y + 62, '납품 현황');
      this.t(F.cx, F.y + 88, '매트  ' + s.project.delivered.mattress + ' / ' + c.quantities.mattress + '개', { size: 15 });
      this.t(F.cx + 220, F.y + 88, '침구  ' + s.project.delivered.bedding + ' / ' + c.quantities.bedding + '세트', { size: 15, bold: true, color: CSS().warn });
      this.section(F, F.y + 130, '협의와 확인');
      this.row(F, F.y + 156, '공방과 일정 협의', ev.supplierNegotiated ? pd.supplierAnswer : '협의 전', ev.supplierNegotiated, '일정 협의', function () { self.cmd('EVENT_NEGOTIATE_SUPPLIER'); }, true, 'negotiate');
      this.row(F, F.y + 224, '지급 순서', ev.requesterConfirmed ? '요청기관이 ' + pd.requesterAnswer : '확인 전', ev.requesterConfirmed, '요청기관에 확인', function () { self.cmd('EVENT_CONFIRM_REQUESTER'); }, true, 'confirmReq');
      this.t(F.cx, F.y + F.h - 34, '두 가지를 마치면 남은 침구가 출고되고 학당으로 운송됩니다.', { size: 13, color: CSS().muted });
    }

    stepInspection(s) {
      let self = this;
      let c = s.project.contract, sc = TYCOON.ui.SCENARIO.project;
      let F = this.frame(620, 360, '검사·검수 결과 확인');
      this.t(F.cx, F.y + 10, '검사·검수 주체: ' + sc.inspector + ' (요청기관). 지방조달청은 결과를 확인하고 사업을 마무리합니다.', { size: 14, width: F.w - 40 });
      let rows = [
        ['매트', c.quantities.mattress + '개', s.project.delivered.mattress + '개'],
        ['침구', c.quantities.bedding + '세트', s.project.delivered.bedding + '세트'],
        ['필수 규격', s.project.requiredSpecs.map(function (k) { return TYCOON.data.SPECS[k]; }).join(', '), '충족']
      ];
      let y = F.y + 64;
      this.t(F.cx, y, '항목', { size: 13, color: CSS().muted });
      this.t(F.cx + 130, y, '계약', { size: 13, color: CSS().muted });
      this.t(F.cx + 440, y, '납품', { size: 13, color: CSS().muted });
      rows.forEach(function (r, k) {
        self.t(F.cx, y + 28 + k * 30, r[0], { size: 15 });
        self.t(F.cx + 130, y + 28 + k * 30, r[1], { size: 15, width: 300 });
        self.t(F.cx + 440, y + 28 + k * 30, r[2], { size: 15, bold: true, color: CSS().ok });
      });
      this.btn(F.right - 260, F.y + F.h - 54, 260, 40, '결과 확인하고 사용 개시', function () { self.cmd('CONFIRM_INSPECTION'); }, { id: 'inspect' });
    }

    stepReport(s) {
      let self = this;
      let T = TYCOON.ui.THEME;
      let rep = s.reports.filter(function (r) { return r.month === s.month; })[0];
      if (s.month === 1) {
        let F1 = this.frame(600, 300, '1월차 월말 보고');
        rep.lines.forEach(function (line, k) { self.t(F1.cx, F1.y + 14 + k * 32, line, { size: 15 }); });
        this.btn(F1.right - 200, F1.y + F1.h - 54, 200, 40, '2월차 계획으로', function () { self.cmd('CLOSE_REPORT'); }, { id: 'closeReport' });
        return;
      }
      let F = this.frame(680, 522, (s.evaluation && s.evaluation.passed ? '2월차 월말 정산 및 첫 성과평가 보고서' : '2월차 월말 정산 및 성과평가 미통과 보고서'));
      let reportLines = rep.lines.concat(s.project.inspection.findings);
      reportLines.forEach(function (line, k) { self.t(F.cx, F.y + 8 + k * 20, line, { size: 13, width: F.w - 40 }); });
      let ev = s.evaluation;
      let summaryY = Math.max(F.y + 105, F.y + 14 + reportLines.length * 20);
      this.t(F.cx, summaryY, ev.passed ? '평가 통과 · 등급 ' + ev.grade : '평가 미통과 · 등급 D — 시설 개선과 동료 모집은 보류됩니다.', { size: 16, bold: true, color: ev.passed ? CSS().ok : CSS().bad });
      let by = Math.max(F.y + 128, summaryY + 28);
      let g = this.add2(this.add.graphics());
      g.fillStyle(T.paperHi, 1); g.fillRect(F.cx, by, F.w - 40, 248);
      g.lineStyle(2, T.ochre, 1); g.strokeRect(F.cx + 1, by + 1, F.w - 42, 246);
      [['품질', '규격 충족과 사용 적합성', ev.quality], ['기한', '필요한 시점의 공급', ev.deadline], ['절차', '정해진 기준과 기록', ev.procedure]].forEach(function (r, k) {
        let yy = by + 18 + k * 40;
        self.t(F.cx + 20, yy, r[0], { size: 17, bold: true });
        self.t(F.cx + 80, yy + 2, r[1], { size: 13, color: CSS().muted });
        self.t(F.cx + 300, yy, r[2], { size: 17, bold: true, color: JUDGE_COLOR[r[2]] });
      });
      this.t(F.right - 40, by + 16, ev.grade, { size: 64, bold: true, color: CSS().warn, origin: [1, 0] });
      this.t(F.right - 40, by + 96, '종합 등급 ' + TYCOON.config.BALANCE.gradeLabels[ev.grade], { size: 14, bold: true, color: CSS().warn, origin: [1, 0] });
      this.t(F.cx + 20, by + 146, ev.reason, { size: 15, width: F.w - 80 });
      this.t(F.cx + 20, by + 210, ev.passed ? '첫 성과 달성 보상: 추가 정원 1명 승인' : '보완 안내: 계약 필수 규격과 최종 납품 수량을 다시 확인하세요. 등급 기준은 TEMP입니다.', { size: 13, color: ev.passed ? CSS().muted : CSS().bad });
      this.btn(F.right - 320, F.y + F.h - 52, 320, 40, ev.passed ? '정원 +1명 승인 확인 및 후보 보기' : '평가 결과 확인 후 튜토리얼 종료', function () { self.cmd('CLOSE_REPORT'); }, { id: 'closeReport', size: 15 });
    }

    stepRecruit(s) {
      let self = this;
      let T = TYCOON.ui.THEME;
      let F = this.frame(780, 522, '첫 동료 모집 (후보 3명 중 1명 선발)');
      this.t(F.cx, F.y + 8, '능력, 전문 분야, 특성이 모두 공개돼 있습니다. 선발한 동료는 두 번째 업무석에 앉습니다.', { size: 13 });
      (s.meta.candidates || []).forEach(function (c, k) {
        let x = F.cx + k * 248, y = F.y + 36, cw = 236, ch = 350;
        let on = self.selected === c.id;
        let g = self.add2(self.add.graphics());
        g.fillStyle(on ? 0xe7f2ee : T.paperHi, 1); g.fillRect(x, y, cw, ch);
        g.lineStyle(on ? 4 : 2, on ? T.teal : T.paperLine, 1); g.strokeRect(x + 2, y + 2, cw - 4, ch - 4);
        self.t(x + 16, y + 14, (k + 1) + '. ' + c.level + ' ' + c.name, { size: 18, bold: true });
        self.t(x + 16, y + 48, '전문 분야', { size: 12, color: CSS().muted });
        self.t(x + 16, y + 66, c.specialty, { size: 15, bold: true, color: CSS().ok });
        self.t(x + 16, y + 94, '고유 특성', { size: 12, color: CSS().muted });
        self.t(x + 16, y + 112, c.trait, { size: 15 });
        TYCOON.data.ABILITIES.forEach(function (a, n) {
          let yy = y + 152 + n * 30;
          self.t(x + 16, yy, a.label, { size: 14 });
          let pg = self.add2(self.add.graphics());
          for (let p = 0; p < 5; p++) {
            pg.fillStyle(p < c.abilities[a.key] ? T.teal : 0xd8ccae, 1);
            pg.fillRect(x + 66 + p * 24, yy + 2, 18, 16);
          }
          self.t(x + 196, yy, String(c.abilities[a.key]), { size: 14, bold: true });
        });
        self.btn(x + 16, y + ch - 56, cw - 32, 40, on ? '선택됨' : '이 후보 선택', function () { self.selected = c.id; self.render(); }, { variant: on ? 'tab-on' : 'paper', size: 14, id: 'cand' + k });
      });
      this.t(F.cx, F.y + F.h - 36, '능력 수치와 후보 목록은 임시입니다.', { size: 12, color: CSS().muted });
      this.btn(F.right - 260, F.y + F.h - 52, 260, 40, '선발 확정 및 새 업무석 배치', function () { self.cmd('HIRE', { candidateId: self.selected }); }, { enabled: !!this.selected, id: 'hire', size: 15 });
    }

    stepEnd(s) {
      let self = this;
      let h = s.staff.hired;
      let passed = !!(s.evaluation && s.evaluation.passed);
      let F = this.frame(600, 260, passed ? '첫 동료 선발 완료' : '튜토리얼 종료 · 평가 미통과');
      if (h) {
        this.t(F.cx, F.y + 14, h.name + '(' + h.specialty + ')이 두 번째 업무석에 앉았습니다.\n튜토리얼 주민들의 잠자리 마련을 마쳤습니다.', { size: 15, lineSpacing: 8 });
        this.btn(F.right - 220, F.y + F.h - 54, 220, 40, '마무리 장면 보기', function () { self.scene.stop(self.view); self.scene.start(K.ENDING); }, { id: 'ending' });
      } else {
        this.t(F.cx, F.y + 18, 'D 등급은 미통과입니다. 시설 개선과 추가 정원 승인은 보류되며, 후보 생성과 채용은 진행되지 않습니다.\n평가 결과와 보완 사유를 확인하고 튜토리얼을 마칩니다.', { size: 15, width: F.w - 50, lineSpacing: 8 });
        this.btn(F.right - 220, F.y + F.h - 54, 220, 40, '처음 화면으로', function () { self.scene.start(K.TITLE); }, { id: 'ending' });
      }
    }

    drawContract(s) {
      let self = this;
      let F = this.frame(520, 300, '계약 현황');
      let c = s.project.contract;
      let unit = TYCOON.config.BALANCE.currencyUnit;
      if (!c) {
        this.t(F.cx, F.y + 16, '아직 체결한 계약이 없습니다.\n요청서를 확인하고 1월차 진행에서 제안을 검토하세요.', { size: 15, lineSpacing: 8, color: CSS().muted });
        return;
      }
      [
        '공급기업  ' + c.supplierName,
        '계약 수량  매트 ' + c.quantities.mattress + '개, 침구 ' + c.quantities.bedding + '세트',
        '계약 금액  ' + c.amount + unit + (s.project.supplement ? ' (보완 납품 ' + s.project.supplement.amount + unit + ' 별도)' : ''),
        '납품  매트 ' + s.project.delivered.mattress + '개, 침구 ' + s.project.delivered.bedding + '세트',
        '상태  ' + TYCOON.ui.STATUS_LABEL[s.project.status]
      ].forEach(function (l, k) { self.t(F.cx, F.y + 14 + k * 32, l, { size: 15 }); });
    }

    drawHelp(s) {
      let self = this;
      let F = this.frame(460, 470, '도움말');
      this.section(F, F.y + 12, '달이 힌트');
      this.t(F.cx, F.y + 38, '확인을 빠뜨렸을 때 달이가 알려줍니다.', { size: 13, color: CSS().muted });
      this.btn(F.right - 140, F.y + 12, 140, 36, s.meta.hintsOn ? '힌트 켜짐' : '힌트 꺼짐', function () { self.cmd('SET_HINTS', { on: !s.meta.hintsOn }); }, { variant: s.meta.hintsOn ? 'primary' : 'paper', size: 14, id: 'hintToggle' });
      this.section(F, F.y + 76, '안내 다시 보기');
      let seen = s.meta.seenDialogs;
      if (!seen.length) this.t(F.cx, F.y + 104, '아직 본 안내가 없습니다.', { size: 13, color: CSS().muted });
      seen.slice(-7).forEach(function (id, k) {
        let d = TYCOON.ui.SCENARIO.dialogs[id];
        self.btn(F.cx, F.y + 104 + k * 42, F.w - 40, 34, d.speaker + '  ' + d.title, function () { self.popup = null; self.render(); self.dialog.replay(id); }, { variant: 'paper', size: 14 });
      });
    }

    drawInfo() {
      let F = this.frame(420, 170, this.info.title);
      this.t(F.cx, F.y + 16, this.info.lines.join('\n'), { size: 15, width: F.w - 40 });
    }
  }

  Object.assign(SCENES, { UIScene });
})();
