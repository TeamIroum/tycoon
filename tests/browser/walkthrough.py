"""
튜토리얼 완주 테스트 (index.html을 file://로 연다). 기능정의서 F-01 ~ F-17 흐름
실행: python3 tests/browser/walkthrough.py        # 모든 확인 → 통과 등급
      python3 tests/browser/walkthrough.py skip   # 매트 점검 생략 → C 등급
      python3 tests/browser/walkthrough.py d      # D 미통과 분기
      python3 tests/browser/walkthrough.py fatal  # 롤백 실패 안내와 새 게임
필요: pip install playwright && playwright install chromium
"""
import sys, time, json
from playwright.sync_api import sync_playwright
import pathlib, os
ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = (ROOT / 'index.html').as_uri() + '?debug'
os.makedirs('shots', exist_ok=True)
mode = sys.argv[1] if len(sys.argv) > 1 else 'normal'
skip = mode == 'skip'
d_grade = mode == 'd'
fatal_mode = mode == 'fatal'
pre = mode + '_' if mode != 'normal' else ''
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.goto(URL); time.sleep(1.2)
    if d_grade:
        pg.evaluate("TYCOON.app.flow.balance.gradeTable.splice(0, TYCOON.app.flow.balance.gradeTable.length, {min: 0, grade: 'D'})")
    def shot(n): pg.screenshot(path='shots/%s%s.png' % (pre, n))
    def dialog_open():
        return pg.evaluate("""(() => { const g = TYCOON.app.game; for (const k of ['UIScene','EndingScene']) { const s = g.scene.getScene(k); if (s && s.sys.isActive() && s.dialog && s.dialog.isOpen()) return true; } return false; })()""")
    def close_dialogs():
        for _ in range(12):
            if not dialog_open(): return
            click('dialogNext'); 
    def click(name, wait=0.3):
        r = pg.evaluate("JSON.stringify((TYCOON.app.debugTargets||{})['%s'] || null)" % name)
        r = json.loads(r)
        if not r: raise Exception('no target ' + name)
        pg.mouse.click(r['x'] + r['w']/2, r['y'] + r['h']/2); time.sleep(wait)
    def st(): return json.loads(pg.evaluate("JSON.stringify({ph: TYCOON.app.store.getState().phase, pe: TYCOON.app.store.getState().pending, m: TYCOON.app.store.getState().month})"))
    shot('00_title')
    click('titleStart', 0); time.sleep(1)
    shot('01_intro_dialog'); close_dialogs(); shot('02_start')
    click('requestCard'); shot('03_request_dialog'); close_dialogs(); shot('04_request')
    if fatal_mode:
        pg.evaluate("(() => { const f=TYCOON.app.flow; f.state.load=()=>{throw new Error('forced restore failure')}; f.procurement.checkResidents=()=>{f.state.spendBudget(1); return TYCOON.core.fail(TYCOON.core.REASON.INVALID_STATE)}; })()")
        click('chkResidents')
        assert pg.evaluate("TYCOON.app.flow.fatal !== null && TYCOON.app.store.dispatch('CHECK_RESIDENTS').code === 'ROLLBACK_FAILED'")
        assert 'ROLLBACK_FAILED' in (pg.evaluate("TYCOON.app.debugTargets.fatalNewGame ? 'ROLLBACK_FAILED' : ''"))
        click('fatalNewGame')
        assert pg.evaluate("TYCOON.app.flow.fatal === null")
        b.close()
        raise SystemExit(0)
    click('chkResidents'); click('chkUserSpec'); click('chkInventory')
    if not skip: click('chkCondition')
    click('confirmQty')
    if skip: shot('05_hint'); close_dialogs(); click('confirmQty')
    shot('06_qty_done')
    click('advance', 0.5); close_dialogs(); shot('07_proposals')
    click('sign'); close_dialogs(); shot('08_report1')
    click('closeReport'); close_dialogs(); shot('09_plan2')
    click('advance'); close_dialogs(); shot('10_partial')
    click('negotiate'); click('confirmReq', 0.5); close_dialogs(); time.sleep(0.3); shot('11_region_truck')
    time.sleep(2.5); shot('12_marker')
    click('marker'); shot('13_inspection')
    click('inspect', 0.8); shot('14_' + ('d' if d_grade else 'use_started')); close_dialogs(); time.sleep(2.6); close_dialogs(); shot('15_eval')
    click('closeReport'); close_dialogs()
    if d_grade:
        shot('16_d_tutorial_end')
        outcome = pg.evaluate("JSON.stringify({grade: TYCOON.app.flow.state.getEvaluation().grade, passed: TYCOON.app.flow.state.getEvaluation().passed, status: TYCOON.app.flow.state.getProjectStatus(), facility: TYCOON.app.flow.state.getFacilityState('hall').stage, headcount: TYCOON.app.flow.state.getStaff().headcount, candidates: TYCOON.app.flow.state.getCandidates(), errors: []})")
        print('D_OUTCOME', outcome)
        assert pg.evaluate("TYCOON.app.flow.state.getEvaluation().grade === 'D' && !TYCOON.app.flow.state.getEvaluation().passed && TYCOON.app.flow.state.getProjectStatus() === 'EVALUATED' && TYCOON.app.flow.state.getFacilityState('hall').stage === 'BEFORE' && TYCOON.app.flow.state.getStaff().headcount === 1 && TYCOON.app.flow.state.getCandidates() === null")
        assert not errors, errors
        b.close()
        raise SystemExit(0)
    shot('16_recruit')
    click('cand1'); shot('17_selected'); click('hire', 1.2); shot('18_walk'); time.sleep(2.2); shot('19_end_popup')
    click('ending', 0.8); shot('20_end0'); click('endingNext', 0.6); shot('21_end1'); click('endingNext', 0.8); shot('22_end2')
    close_dialogs(); click('endingNext', 0.8); shot('23_title_again')
    print('STATE', pg.evaluate("JSON.stringify({ph: TYCOON.app.store.getState().phase, g: TYCOON.app.store.getState().evaluation.grade, sp: TYCOON.app.store.getState().budget.spent})"))
    b.close()
print('ERRORS', errors[:10])
