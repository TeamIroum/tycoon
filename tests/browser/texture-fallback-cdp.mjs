// 텍스처 로딩 순서 회귀 테스트 (실제 Phaser 3.80.1, headless Chrome, CDP).
// PreloadScene이 ASSETS 이미지를 먼저 불러온 뒤 임시 텍스처(makeTextures)를 만들기 때문에
//   - 실제 이미지가 있는 키는 실제 이미지를 유지하고
//   - 없거나 로드에 실패한 키는 임시 캔버스 텍스처로 채워지는지 확인한다.
// 저장소의 assets.js는 바꾸지 않는다. 실제 index.html을 바탕으로 임시 페이지를 만들고 assets.js 직후에
// 시험용 ASSETS 항목만 넣는다. 시험용 PNG는 실행 중에 임시 폴더에 만든다.
// file://와 로컬 HTTP 서버(온라인 배포와 같은 http 방식) 두 가지로 실행한다.
// 게임 진행은 dispatch로, 타이틀 시작·엔딩 버튼은 CDP 마우스 입력으로 누른다.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const STEP_TIMEOUT_MS = 10000, CDP_CALL_TIMEOUT_MS = 30000, POLL_MS = 50;

// ---- 임시 텍스처 키와 크기 (src/ui/art.js makeTextures 기준) ----
const PEOPLE = ['resident_a', 'resident_b', 'resident_c', 'resident_d', 'player', 'colleague'];
const FRAMES = { stand: [16, 28], walk0: [16, 28], walk1: [16, 28], sit: [16, 22], lie: [28, 10] };
const TEMP = { truck: [44, 28] };
for (const p of PEOPLE) for (const [f, size] of Object.entries(FRAMES)) TEMP[`${p}_${f}`] = size;
const TEMP_KEYS = Object.keys(TEMP);

// ---- 단색 PNG (임시 텍스처와 크기가 다르게 만들어 구분한다) ----
function crc32(buf) { let crc = 0xffffffff; for (const b of buf) { let c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, [r, g, b]) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const IMAGES = { 'truck.png': [64, 40, [255, 0, 0]], 'colleague_sit.png': [30, 50, [0, 255, 0]], 'resident_a_stand.png': [20, 36, [0, 0, 255]] };

const work = await mkdtemp(join(tmpdir(), 'tycoon-tex-'));
for (const [name, [w, h, rgb]] of Object.entries(IMAGES)) await writeFile(join(work, name), png(w, h, rgb));

// ---- 로컬 HTTP 서버: /repo/* → 저장소, /t/* → 임시 폴더 ----
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const [root, rest] = path.startsWith('/repo/') ? [REPO, path.slice(6)] : path.startsWith('/t/') ? [work, path.slice(3)] : [null, null];
  const file = root && normalize(join(root, rest));
  if (!file || !file.startsWith(normalize(root.endsWith(sep) ? root : root + sep))) { res.writeHead(404); return res.end(); }
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const HTTP = `http://127.0.0.1:${server.address().port}`;

// ---- 페이지 생성 ----
const index = await readFile(join(REPO, 'index.html'), 'utf8');
// mode: 'file' | 'http'. assets: null이면 실제 index.html을 그대로 연다. 배열이면 [key, 파일명] 목록을 시험용 이미지로 넣는다.
async function entry(mode, name, assets) {
  const repoBase = mode === 'file' ? pathToFileURL(REPO).href : `${HTTP}/repo/`;
  const workBase = mode === 'file' ? pathToFileURL(work + sep).href : `${HTTP}/t/`;
  if (assets === null) return `${repoBase}index.html?debug`;
  // 기존 ASSETS 항목은 저장소 기준 절대 경로로 바꾸고, 임시 텍스처 키 항목은 지운 뒤 시험용 항목만 넣는다.
  const inject = `<script>(function(){const A=TYCOON.config.ASSETS,base=${JSON.stringify(repoBase)},temp=${JSON.stringify(TEMP_KEYS)};
for(const a of A)a.url=new URL(a.url,base).href;
for(let i=A.length-1;i>=0;i--)if(temp.indexOf(A[i].key)>=0)A.splice(i,1);
for(const [key,file] of ${JSON.stringify(assets)})A.push({type:'image',key,url:new URL(file,${JSON.stringify(workBase)}).href});})();</script>`;
  let html = index.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => `<script src="${new URL(src, repoBase).href}"></script>`);
  html = html.replace(/(<script src="[^"]*src\/config\/assets\.js"><\/script>)/, `$1\n${inject}`);
  assert.ok(html.includes(inject), 'assets.js script tag not found in index.html');
  await writeFile(join(work, `${name}.html`), html);
  return `${workBase}${name}.html?debug`;
}

// ---- 브라우저 안에서 읽는 식 ----
const TEXTURES = `(()=>{const tm=TYCOON.app.game.textures,out={};for(const k of ${JSON.stringify(TEMP_KEYS)}){if(!tm.exists(k)){out[k]=null;continue}const s=tm.get(k).source[0],img=s.image;
out[k]={w:s.width,h:s.height,kind:img instanceof HTMLCanvasElement?'canvas':img instanceof HTMLImageElement?'image':String(img&&img.constructor&&img.constructor.name),file:img&&img.src?decodeURIComponent(img.src.split('/').pop()):null}}return out})()`;
const ASSET_IMAGES = `TYCOON.config.ASSETS.filter(a=>a.type==='image').map(a=>a.key)`;
const TITLE_READY = "(()=>{const g=TYCOON.app.game,s=g.scene.getScene(TYCOON.config.SCENE_KEYS.TITLE);return !!(TYCOON.app.debugTargets.titleStart&&s&&s.sys.settings.status===5&&s.sys.isActive())})()";
// 특정 Scene에서 키를 쓰는 표시 객체의 텍스처 상태
const SCENE_USE = (sceneKey, key) => `(()=>{const s=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.${sceneKey});const list=[];const walk=(o)=>{if(o.list)o.list.forEach(walk);if(o.texture&&o.texture.key===${JSON.stringify(key)})list.push(o)};s.children.list.forEach(walk);
return list.map(o=>{const img=o.texture.source[0].image;return {visible:o.visible,w:o.width,h:o.height,kind:img instanceof HTMLCanvasElement?'canvas':'image'}})})()`;
const NORMAL_PATH = ['CHECK_RESIDENTS', 'CHECK_USER_SPEC', 'CHECK_INVENTORY_COUNT', 'CHECK_MATTRESS_CONDITION', 'CONFIRM_QUANTITIES', 'ADVANCE_MONTH', 'SIGN_CONTRACT', 'CLOSE_REPORT', 'ADVANCE_MONTH', 'EVENT_NEGOTIATE_SUPPLIER', 'EVENT_CONFIRM_REQUESTER', 'CONFIRM_INSPECTION', 'CLOSE_REPORT'];

// ---- Chrome 1회 실행 ----
async function withChrome(url, fn) {
  const profile = await mkdtemp(join(tmpdir(), 'tycoon-tex-cdp-'));
  const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--window-size=1296,871', url], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; child.stderr.setEncoding('utf8'); child.stderr.on('data', (s) => { stderr += s; });
  let ws; const pending = new Map(); let nextId = 0; const consoleErrors = [];
  try {
    let port; for (let i = 0; i < 100 && !port; i++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]); } catch { await delay(100); } }
    if (!port) throw new Error(`Chrome DevTools did not start: ${stderr}`);
    let targets; for (let i = 0; i < 100 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await delay(100); } }
    const page = targets && targets.find((t) => t.type === 'page'); if (!page) throw new Error('Chromium page target missing');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || '')); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' ')); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
    ws.onclose = () => { for (const p of pending.values()) p.reject(new Error('CDP connection closed')); pending.clear(); };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, CDP_CALL_TIMEOUT_MS);
      pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } }); ws.send(JSON.stringify({ id, method, params }));
    });
    await send('Runtime.enable'); await send('Page.enable');
    // 첫 로드에서 난 오류도 받기 위해 Runtime.enable 뒤 한 번 새로 연다.
    await send('Page.reload', { ignoreCache: true });
    const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '')); return r.result.value; };
    const waitFor = async (expression, label, timeout = STEP_TIMEOUT_MS) => {
      const started = Date.now(); let last = null;
      for (;;) { try { if (await evaluate(expression)) return; last = null; } catch (e) { last = e.message; } if (Date.now() - started >= timeout) break; await delay(POLL_MS); }
      throw new Error(`Timed out waiting for ${label}${last ? ` (${last})` : ''}; console errors: ${consoleErrors.join(' | ')}`);
    };
    const click = async (name, wait = 300) => {
      const t = await evaluate(`TYCOON.app.debugTargets[${JSON.stringify(name)}]`); if (!t) throw new Error(`Missing UI target: ${name}`);
      const r = await evaluate("(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return {x:r.x,y:r.y,sx:r.width/c.width,sy:r.height/c.height}})()");
      const x = r.x + (t.x + t.w / 2) * r.sx, y = r.y + (t.y + t.h / 2) * r.sy;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await delay(wait);
    };
    const closeDialogs = async () => { for (let i = 0; i < 40; i++) { if (!(await evaluate("(()=>{const s=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.UI);return !!(s&&s.sys.isActive()&&s.dialog&&s.dialog.isOpen())})()"))) return; await click('dialogNext', 80); } throw new Error('Dialog did not close'); };
    return await fn({ send, evaluate, waitFor, click, closeDialogs, consoleErrors });
  } finally {
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await Promise.race([exited, delay(5000)]); }
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch((e) => console.error(`profile cleanup failed: ${e.message}`));
  }
}

// 기대값: real에 든 키는 실제 이미지(파일명·크기 일치), 나머지 임시 키는 임시 캔버스 크기
function expectTextures(tex, real) {
  for (const k of TEMP_KEYS) {
    assert.ok(tex[k], `texture ${k} missing`);
    if (real[k]) {
      const [w, h] = IMAGES[real[k]];
      assert.deepEqual(tex[k], { w, h, kind: 'image', file: real[k] }, `${k} should be the real image ${real[k]}`);
    } else {
      assert.deepEqual({ w: tex[k].w, h: tex[k].h, kind: tex[k].kind }, { w: TEMP[k][0], h: TEMP[k][1], kind: 'canvas' }, `${k} should be the temporary canvas texture`);
    }
  }
}
const summarize = (tex, keys) => Object.fromEntries(keys.map((k) => [k, tex[k] && `${tex[k].kind} ${tex[k].w}x${tex[k].h}`]));

// 새 게임 → 끝까지 진행(dispatch) → 새로고침 복원 → 엔딩(마우스) 순서로 텍스처를 확인한다.
async function playSaveRestoreEnding(c, real) {
  await c.click('titleStart');
  await c.waitFor("TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.OFFICE)&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI)", 'Office after titleStart');
  await c.closeDialogs();
  await c.evaluate(`(()=>{const d=(t,p)=>TYCOON.app.store.dispatch(t,p);for(const t of ${JSON.stringify(NORMAL_PATH)}){const r=d(t);if(!r.ok)throw Error(t+':'+r.reason)}
const cands=TYCOON.app.flow.state.getCandidates();const r=d('HIRE',{candidateId:cands[0].id});if(!r.ok)throw Error('HIRE:'+r.reason);return true})()`);
  await c.waitFor("TYCOON.app.flow.view().phase==='END'&&TYCOON.app.flow.view().staff.headcount===2", 'END after hire');
  assert.equal(await c.evaluate('TYCOON.app.saveStatus&&TYCOON.app.saveStatus.ok'), true, 'autosave after hire');
  await c.send('Page.reload');
  await c.waitFor("!!(window.TYCOON&&TYCOON.app&&TYCOON.app.game)&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.OFFICE)&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI)", 'Office restored after reload');
  const restored = await c.evaluate("(()=>{const v=TYCOON.app.flow.view();return {phase:v.phase,headcount:v.staff.headcount}})()");
  assert.deepEqual(restored, { phase: 'END', headcount: 2 }, 'restored state');
  const afterRestore = await c.evaluate(TEXTURES);
  expectTextures(afterRestore, real);
  // 복원된 관청 화면에서 colleague_sit을 쓰는 객체가 있으면 같은 텍스처인지 확인한다(개수는 OfficeScene 연출에 따름).
  const office = await c.evaluate(SCENE_USE('OFFICE', 'colleague_sit'));
  for (const o of office) assert.equal(o.kind, real.colleague_sit ? 'image' : 'canvas', 'OfficeScene colleague_sit texture');
  await c.closeDialogs();
  await c.waitFor('!!TYCOON.app.debugTargets.ending', 'ending button after restore');
  await c.click('ending');
  await c.waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.ENDING)', 'EndingScene');
  // 엔딩 두 번째 장면(step 1)이 두 번째 업무석에 colleague_sit을 그린다.
  await c.click('endingNext');
  await c.waitFor('TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.ENDING).step===1', 'Ending step 1');
  const want = real.colleague_sit ? { kind: 'image', w: IMAGES[real.colleague_sit][0], h: IMAGES[real.colleague_sit][1] } : { kind: 'canvas', w: TEMP.colleague_sit[0], h: TEMP.colleague_sit[1] };
  const ending = await c.evaluate(SCENE_USE('ENDING', 'colleague_sit'));
  assert.ok(ending.length >= 1, 'EndingScene step 1 shows colleague_sit');
  for (const o of ending) assert.deepEqual({ kind: o.kind, w: o.w, h: o.h }, want, 'EndingScene colleague_sit texture');
  assert.ok(ending.every((o) => o.visible), 'EndingScene colleague_sit visible');
  return { restored, office: office.map((o) => `${o.kind} ${o.w}x${o.h}`), ending: ending.map((o) => `${o.kind} ${o.w}x${o.h}`) };
}

const SCENARIOS = [
  { id: 'repo-assets', mode: 'file', assets: null, desc: '저장소 index.html 그대로(현재 assets.js 목록)', play: true },
  { id: 'none', mode: 'file', assets: [], desc: '1. 실제 이미지 없음 → 전부 임시 텍스처', play: true },
  { id: 'truck', mode: 'file', assets: [['truck', 'truck.png']], desc: '2·4. truck만 실제 이미지' },
  { id: 'colleague-sit', mode: 'file', assets: [['colleague_sit', 'colleague_sit.png']], desc: '3·4·6·7. colleague_sit만 실제 이미지 + 저장·복원·엔딩', play: true },
  { id: 'partial', mode: 'file', assets: [['truck', 'truck.png'], ['colleague_sit', 'colleague_sit.png'], ['resident_a_stand', 'resident_a_stand.png']], desc: '4. 일부만 실제 이미지' },
  { id: 'missing', mode: 'file', assets: [['truck', 'no_such_dir/truck.png'], ['colleague_sit', 'missing.png'], ['resident_a_stand', 'resident_a_stand.png']], desc: '5. 파일 누락·잘못된 경로 → 임시 텍스처 폴백', play: true, failed: ['truck', 'colleague_sit'] },
  { id: 'http-none', mode: 'http', assets: [], desc: '8. HTTP 실행, 실제 이미지 없음' },
  { id: 'http-partial', mode: 'http', assets: [['truck', 'truck.png'], ['colleague_sit', 'colleague_sit.png']], desc: '8. HTTP 실행, 일부 실제 이미지 + 저장·복원·엔딩', play: true },
  { id: 'http-missing', mode: 'http', assets: [['truck', 'missing.png']], desc: '8. HTTP 실행, 파일 누락(404) 폴백', failed: ['truck'] }
];

const results = [];
let failures = 0;
try {
  for (const s of SCENARIOS) {
    const started = Date.now();
    try {
      const url = await entry(s.mode, s.id, s.assets);
      const out = await withChrome(url, async (c) => {
        await c.waitFor(TITLE_READY, 'TitleScene');
        const tex = await c.evaluate(TEXTURES);
        // 기대하는 실제 이미지 키: 시험용 항목 중 로드 실패 예정이 아닌 것. 저장소 그대로면 assets.js 이미지 항목 중 임시 키.
        let real = {};
        if (s.assets === null) {
          for (const k of await c.evaluate(ASSET_IMAGES)) if (TEMP[k]) real[k] = tex[k] && tex[k].file;
        } else {
          for (const [k, f] of s.assets) if (!(s.failed || []).includes(k)) real[k] = f;
        }
        expectTextures(tex, real);
        const failedKeys = await c.evaluate("(()=>{const l=TYCOON.app.game.scene.getScene(TYCOON.config.SCENE_KEYS.PRELOAD).load;return l.totalFailed})()");
        assert.equal(failedKeys, (s.failed || []).length, 'loader failed count');
        for (const k of s.failed || []) assert.ok(c.consoleErrors.some((e) => e.includes('[Preload]') && e.includes(k)), `Preload error log for ${k}`);
        const play = s.play ? await playSaveRestoreEnding(c, real) : null;
        const unexpected = c.consoleErrors.filter((e) => !(e.includes('[Preload]') && (s.failed || []).some((k) => e.includes(k))) && !/Failed to load resource/.test(e));
        assert.deepEqual(unexpected, [], 'unexpected browser errors');
        return { textures: summarize(tex, ['truck', 'colleague_sit', 'resident_a_stand', 'player_walk0']), real: Object.keys(real), play };
      });
      results.push({ id: s.id, mode: s.mode, desc: s.desc, pass: true, ms: Date.now() - started, ...out });
    } catch (e) {
      failures++;
      results.push({ id: s.id, mode: s.mode, desc: s.desc, pass: false, error: e.message });
    }
  }
} finally {
  server.close();
  await rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} [${r.mode}] ${r.desc}\n  ${JSON.stringify(r.pass ? { textures: r.textures, real: r.real, play: r.play } : { error: r.error })}`);
console.log(`\n${results.length - failures}/${results.length} texture scenarios passed`);
if (failures) process.exitCode = 1;
