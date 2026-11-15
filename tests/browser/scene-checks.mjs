// 브라우저 테스트 공용: 타이틀·게임 화면의 Scene 실행 상태, 리스너 수, 타이틀이 실제로 보이는지 확인한다.
// chromium-cdp.mjs와 play-walkthrough-cdp.mjs가 사용한다.
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

// 실행 중(RUNNING·PAUSED·SLEEPING)인 Scene 키 목록. 시작 전(PENDING)이나 종료된 Scene은 제외한다.
export const RUNNING_SCENES = "TYCOON.app.game.scene.getScenes(false).filter((s)=>s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping()).map((s)=>s.sys.settings.key)";
// 화면 Scene 간 신호와 상태 구독 수
export const LISTENERS = "(()=>{const g=TYCOON.app.game;return {ptInfo:g.events.listenerCount('pt:info'),ptInspect:g.events.listenerCount('pt:inspect'),ptMarker:g.events.listenerCount('pt:marker'),flow:TYCOON.app.flow.listeners.length,stateChanged:TYCOON.app.flow.state.listenerCount(TYCOON.core.EVENTS.STATE_CHANGED)}})()";

// 1×1 PNG 스크린샷의 RGB. 한 픽셀이면 PNG 필터 예측값이 모두 0이라 필터 바이트 뒤 값이 그대로 색이다.
function pixelOf(pngBase64) {
  const buf = Buffer.from(pngBase64, 'base64');
  const colorType = buf[25];
  const idat = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  assert.ok(colorType === 2 || colorType === 6, `unexpected PNG color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  return [raw[1], raw[2], raw[3]];
}

// 타이틀 '새로 시작' 버튼 안쪽 한 점이 버튼 색(0x2f7a6b)으로 보이는지. 다른 Scene이 위에 그려지면 다른 색이 된다.
export async function titleButtonVisible(send, evaluate) {
  const at = await evaluate("(()=>{const t=TYCOON.app.debugTargets.titleStart,c=document.querySelector('canvas'),r=c.getBoundingClientRect(),sx=r.width/c.width,sy=r.height/c.height;return {x:r.x+(t.x+8)*sx,y:r.y+(t.y+8)*sy}})()");
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.round(at.x), y: Math.round(at.y), width: 1, height: 1, scale: 1 } });
  const rgb = pixelOf(shot.data);
  const want = [0x2f, 0x7a, 0x6b];
  return { rgb, visible: rgb.every((v, i) => Math.abs(v - want[i]) <= 3) };
}

// 타이틀만 실행 중이고, 타이틀 버튼이 실제로 보이며, 게임 화면 리스너가 남지 않았는지
// extraFlow: 테스트가 직접 flow.subscribe로 붙인 구독 수
export async function assertTitleOnly({ send, evaluate, waitFor }, label, { extraFlow = 0 } = {}) {
  await waitFor(`JSON.stringify(${RUNNING_SCENES})==='["TitleScene"]'&&!!TYCOON.app.debugTargets.titleStart`, `${label}: only TitleScene running`);
  const scenes = await evaluate(RUNNING_SCENES);
  const listeners = await evaluate(LISTENERS);
  // 다음 그리기까지 기다린 뒤 픽셀을 읽는다.
  await evaluate('new Promise((r)=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const pixel = await titleButtonVisible(send, evaluate);
  assert.deepEqual(scenes, ['TitleScene'], `${label}: running scenes`);
  assert.deepEqual({ ptInfo: listeners.ptInfo, ptInspect: listeners.ptInspect, ptMarker: listeners.ptMarker, stateChanged: listeners.stateChanged }, { ptInfo: 0, ptInspect: 0, ptMarker: 0, stateChanged: 0 }, `${label}: game-screen listeners left on title`);
  assert.equal(listeners.flow, 1 + extraFlow, `${label}: flow subscribers on title (autosave${extraFlow ? ' + test' : ''} only)`);
  assert.ok(pixel.visible, `${label}: title start button covered, pixel ${JSON.stringify(pixel.rgb)}`);
  return { scenes, listeners, titlePixel: pixel.rgb };
}

// 새 게임 직후: 관청·UI만 실행 중, 리스너는 기준값과 같아야 한다.
export async function assertGameStarted({ evaluate, waitFor }, label, baseline) {
  await waitFor(`JSON.stringify(${RUNNING_SCENES})==='["OfficeScene","UIScene"]'`, `${label}: only OfficeScene and UIScene running`);
  const scenes = await evaluate(RUNNING_SCENES);
  const listeners = await evaluate(LISTENERS);
  assert.deepEqual(scenes, ['OfficeScene', 'UIScene'], `${label}: running scenes`);
  if (baseline) assert.deepEqual(listeners, baseline, `${label}: listener counts differ from first game`);
  return { scenes, listeners };
}
