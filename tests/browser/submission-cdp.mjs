// F-19 제출 ZIP 실행 검증 (CDP, 의존성 없음).
// 기본·오프라인 ZIP을 임시 폴더에 만들고 압축을 푼 뒤, 압축을 푼 게임실행.html을 file://로 연다.
// - 오프라인 ZIP: 오프라인_실행/index.html로 이동하고, 타이틀의 '새로 시작'을 마우스로 눌러 관청 화면이 열리는지 확인한다.
//   모든 요청이 압축을 푼 폴더 안의 file://인지 확인한다(네트워크·저장소 원본 폴더 미사용).
// - 기본 ZIP: GitHub Pages 주소로 이동하는지 확인한다. 네트워크에 의존하지 않도록 Pages 요청은 가로채 대체 응답을 준다
//   (실제 Pages 게임 실행은 이 테스트가 검증하지 않는다).
// 브라우저: TYCOON_BROWSER 환경 변수(기본 Chrome). 예) Edge: C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readZip } from '../../tools/zip.mjs';
import { writeSubmission, LAUNCHER, OFFLINE_DIR } from '../../tools/make-submission.mjs';

const browserPath = process.env.TYCOON_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const STEP_TIMEOUT_MS = 10000, CDP_CALL_TIMEOUT_MS = 30000, POLL_MS = 50;
const GAME_URL = 'https://teamiroum.github.io/tycoon/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tycoon-submission-cdp-'));

function extract(zipPath, dir) {
  for (const f of readZip(fs.readFileSync(zipPath))) {
    const target = path.join(dir, ...f.name.split('/'));
    if (!target.startsWith(dir + path.sep)) throw new Error(`ZIP 경로가 폴더 밖을 가리킵니다: ${f.name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.data);
  }
}

/** 새 프로필로 브라우저를 열고 CDP 도우미를 돌려준다. close()는 연결·프로세스·프로필을 정리한다. */
async function openBrowser(url, onPaused) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tycoon-cdp-'));
  const child = spawn(browserPath, ['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--remote-debugging-port=0','--window-size=1296,871','about:blank'], { stdio: ['ignore','ignore','pipe'] });
  let stderr = ''; child.stderr.setEncoding('utf8'); child.stderr.on('data', (s) => { stderr += s; });
  let ws; const pending = new Map(); const errors = []; const requests = []; let nextId = 0;
  const close = async () => {
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill(); await Promise.race([exited, delay(5000)]);
      if (child.exitCode === null && child.signalCode === null) console.error(`Browser (pid ${child.pid}) did not exit within 5000ms after kill`);
    }
    await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch((e) => console.error(`Profile cleanup failed: ${profile}: ${e.message}`));
  };
  try {
    let port;
    for (let i = 0; i < 100 && !port; i++) { try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]); } catch { await delay(100); } }
    if (!port) throw new Error(`Browser DevTools did not start: ${stderr}`);
    let targets;
    for (let i = 0; i < 100 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await delay(100); } }
    const page = targets && targets.find((t) => t.type === 'page'); if (!page) throw new Error('Browser page target missing');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      if (ws.readyState !== WebSocket.OPEN) return reject(new Error(`CDP connection not open for ${method}`));
      const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, CDP_CALL_TIMEOUT_MS);
      pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.onclose = () => { for (const p of pending.values()) p.reject(new Error('CDP connection closed')); pending.clear(); };
    ws.onmessage = ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
      if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url);
      if (msg.method === 'Fetch.requestPaused' && onPaused) onPaused(msg.params, send);
      const p = pending.get(msg.id); if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
    };
    await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Network.enable');
    if (onPaused) await send('Fetch.enable', { patterns: [{ urlPattern: '*github.io*' }] });
    const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
    const waitFor = async (expression, label) => {
      const started = Date.now(); let last = null;
      for (;;) {
        try { if (await evaluate(expression)) return Date.now() - started; last = null; } catch (e) { last = e.message; }
        if (Date.now() - started >= STEP_TIMEOUT_MS) break; await delay(POLL_MS);
      }
      const where = await evaluate('location.href').catch((e) => e.message);
      throw new Error(`Timed out after ${STEP_TIMEOUT_MS}ms waiting for ${label}${last ? ` (last error: ${last})` : ''}\nlocation: ${where}\nrequests: ${JSON.stringify(requests)}\nerrors: ${JSON.stringify(errors)}`);
    };
    await send('Page.navigate', { url });
    return { send, evaluate, waitFor, errors, requests, close };
  } catch (error) { await close(); throw error; }
}

async function verifyOffline() {
  const out = path.join(work, 'offline-zip'), dir = path.join(work, 'offline');
  const zip = writeSubmission({ outDir: out, withOffline: true });
  extract(zip.path, dir);
  const launcherUrl = pathToFileURL(path.join(dir, LAUNCHER)).href + '?debug';
  const b = await openBrowser(launcherUrl);
  try {
    await b.waitFor(`decodeURIComponent(location.pathname).endsWith('/${OFFLINE_DIR}/index.html')`, 'launcher redirect to offline index.html');
    const location = await b.evaluate('decodeURIComponent(location.href)');
    await b.waitFor("(()=>{const T=window.TYCOON;if(!(T&&T.app&&T.app.game))return false;const s=T.app.game.scene.getScene(T.config.SCENE_KEYS.TITLE);return !!(T.app.debugTargets.titleStart&&s&&s.sys.settings.status===5&&s.sys.isActive()&&s.sys.isVisible())})()", 'offline TitleScene with titleStart');
    const t = await b.evaluate('TYCOON.app.debugTargets.titleStart');
    const rect = await b.evaluate("(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return {x:r.x,y:r.y,sx:r.width/c.width,sy:r.height/c.height}})()");
    const x = rect.x + (t.x + t.w / 2) * rect.sx, y = rect.y + (t.y + t.h / 2) * rect.sy;
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    await b.waitFor('TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.OFFICE)&&TYCOON.app.game.scene.isActive(TYCOON.config.SCENE_KEYS.UI)', 'title start mouse click to open Office and UI');
    const state = await b.evaluate('(()=>{const v=TYCOON.app.store.getState();return {month:v.month,phase:v.phase,status:v.project.status,save:TYCOON.app.saveStatus}})()');
    if (state.month !== 1 || state.phase !== 'PLAN' || state.status !== 'REQUESTED') throw new Error(`Unexpected new-game state: ${JSON.stringify(state)}`);
    const resources = await b.evaluate("performance.getEntriesByType('resource').map((e)=>e.name)");
    const extractedRoot = pathToFileURL(dir).href;
    const inZip = (u) => decodeURIComponent(u).startsWith(decodeURIComponent(extractedRoot));
    const outside = [...b.requests, ...resources].filter((u) => !u.startsWith('data:') && !inZip(u));
    if (outside.length) throw new Error(`Requests outside the extracted ZIP: ${JSON.stringify(outside)}`);
    const loaded = b.requests.filter(inZip).map((u) => decodeURIComponent(u).slice(decodeURIComponent(extractedRoot).length + 1).split('?')[0]);
    for (const must of [`${OFFLINE_DIR}/lib/phaser-3.80.1.min.js`, `${OFFLINE_DIR}/src/main.js`]) if (!loaded.includes(must)) throw new Error(`Expected ${must} to load from the extracted ZIP; loaded: ${JSON.stringify(loaded)}`);
    if (b.errors.length) throw new Error(`Browser errors: ${b.errors.join(' | ')}`);
    return { zip: path.basename(zip.path), entries: zip.files.length, location: location.slice(location.indexOf(OFFLINE_DIR)), requestsFromZip: loaded.length, requestsOutsideZip: 0, input: 'CDP mouse click on titleStart', state, browserErrors: b.errors.length };
  } finally { await b.close(); }
}

async function verifyDefault() {
  const out = path.join(work, 'default-zip'), dir = path.join(work, 'default');
  const zip = writeSubmission({ outDir: out });
  extract(zip.path, dir);
  const intercepted = [];
  const stub = Buffer.from('<!doctype html><title>pages-stub</title>').toString('base64');
  const b = await openBrowser(pathToFileURL(path.join(dir, LAUNCHER)).href, (params, send) => {
    intercepted.push(params.request.url);
    send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: stub }).catch(() => {});
  });
  try {
    await b.waitFor("document.title==='pages-stub'", 'launcher redirect to GitHub Pages (intercepted)');
    const href = await b.evaluate('location.href');
    if (href.toLowerCase() !== GAME_URL) throw new Error(`Launcher went to ${href}, expected ${GAME_URL}`);
    const offlineTried = b.requests.filter((u) => decodeURIComponent(u).includes(OFFLINE_DIR));
    if (offlineTried.length) throw new Error(`Default ZIP launcher requested the offline folder: ${offlineTried.join(', ')}`);
    return { zip: path.basename(zip.path), entries: zip.files.map((f) => f.name), redirectedTo: href, intercepted: intercepted.length, offlineRequests: 0, note: 'Pages response stubbed; real Pages game not exercised' };
  } finally { await b.close(); }
}

try {
  const offline = await verifyOffline();
  const defaultZip = await verifyDefault();
  console.log(JSON.stringify({ browser: path.basename(browserPath), offline, default: defaultZip }, null, 2));
} finally {
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
