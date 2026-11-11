/** F-19 제출 ZIP 검증: 기본·오프라인 ZIP 내용, 실행 파일 참조 경로, 실패 조건. ZIP은 임시 폴더에만 만든다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readZip } from '../tools/zip.mjs';
import { buildSubmission, writeSubmission, parseArgs, SubmissionError, ZIP_NAME, OFFLINE_DIR, LAUNCHER, GUIDE } from '../tools/make-submission.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools', 'make-submission.mjs');
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tycoon-submission-'));
const text = (files, name) => files.find((f) => f.name === name).data.toString('utf8');
/** 제출에 필요한 파일만 임시 루트로 복사한다(누락 실험용). */
function copyRoot() {
  const dir = tempDir();
  for (const rel of ['index.html', 'lib', 'src', 'submission']) fs.cpSync(path.join(ROOT, rel), path.join(dir, rel), { recursive: true });
  return dir;
}
const runTool = (args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });

test('F-19 기본 ZIP: 실행 파일과 안내만 담고, 실행 파일은 Pages로 연결', () => {
  const dir = tempDir();
  try {
    const r = writeSubmission({ outDir: dir });
    const files = readZip(fs.readFileSync(r.path));
    assert.deepEqual(files.map((f) => f.name), [LAUNCHER, GUIDE]);
    const launcher = text(files, LAUNCHER);
    assert.match(launcher, /var OFFLINE_INCLUDED = false;/);
    assert.match(launcher, /var GAME_URL = 'https:\/\/TeamIroum\.github\.io\/tycoon\/';/);
    assert.match(launcher, /OFFLINE_INCLUDED && location\.protocol === 'file:' \? OFFLINE_GAME_URL : GAME_URL/);
    assert.match(text(files, GUIDE), /인터넷 연결이 필요합니다/);
    assert.equal(files.some((f) => f.name.startsWith(OFFLINE_DIR + '/')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('F-19 오프라인 ZIP: 실행 파일이 여는 경로와 index.html이 참조하는 파일이 모두 포함', () => {
  const dir = tempDir();
  try {
    const r = writeSubmission({ outDir: dir, withOffline: true });
    const files = readZip(fs.readFileSync(r.path));
    const names = new Set(files.map((f) => f.name));
    const launcher = text(files, LAUNCHER);
    assert.match(launcher, /var OFFLINE_INCLUDED = true;/);
    const offlineEntry = launcher.match(/new URL\('([^']+)'/)[1];
    assert.equal(offlineEntry, `${OFFLINE_DIR}/index.html`);
    assert.ok(names.has(offlineEntry), '실행 파일이 여는 오프라인 index.html');
    assert.match(text(files, GUIDE), /오프라인 실행본/);

    const indexHtml = text(files, `${OFFLINE_DIR}/index.html`);
    const refs = [...indexHtml.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
    assert.ok(refs.length > 30, 'index.html 스크립트 목록');
    for (const ref of refs) {
      assert.doesNotMatch(ref, /^(?:[a-z]+:)?\/\//i, `외부 주소 참조: ${ref}`);
      assert.ok(names.has(`${OFFLINE_DIR}/${ref}`), `참조 파일 누락: ${ref}`);
    }
    // 개발 파일과 숨김 파일은 넣지 않는다.
    for (const name of names) {
      assert.ok(name === LAUNCHER || name === GUIDE || /^오프라인_실행\/(index\.html|lib\/|src\/)/.test(name), `제출 범위 밖 파일: ${name}`);
      assert.doesNotMatch(name, /(^|\/)\.[^/]+$/, `숨김 파일: ${name}`);
      assert.doesNotMatch(name, /\\/, `경로 구분자: ${name}`);
    }
    // 원본 파일 내용과 일치
    assert.ok(files.find((f) => f.name === `${OFFLINE_DIR}/src/main.js`).data.equals(fs.readFileSync(path.join(ROOT, 'src/main.js'))));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('F-19 결과물에 자리표시자 주소가 없고, 팀명 자리표시자는 경고로 보고', () => {
  for (const withOffline of [false, true]) {
    const r = buildSubmission({ withOffline });
    for (const f of r.files.filter((x) => /\.(html|txt)$/.test(x.name))) assert.equal(f.data.toString('utf8').includes('아이디.github.io'), false, f.name);
    assert.equal(r.name, ZIP_NAME);
    assert.equal(r.warnings.some((w) => w.includes('팀명')), ZIP_NAME.includes('팀명'));
  }
});

test('F-19 CLI: 잘못된 옵션은 실패하고 ZIP을 만들지 않음', () => {
  const dir = tempDir();
  try {
    for (const args of [['--offline'], ['--out-dir'], ['--out-dir', '--with-offline']]) {
      const r = runTool([...args, ...(args.includes('--out-dir') ? [] : ['--out-dir', dir])]);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, /제출 ZIP을 만들지 않았습니다/);
      assert.doesNotMatch(r.stdout, /KB/);
    }
    assert.deepEqual(fs.readdirSync(dir), []);
    assert.throws(() => parseArgs(['--with-offlin']), SubmissionError);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('F-19 CLI: 정상 생성은 위치·크기와 팀명 경고를 출력', () => {
  const dir = tempDir();
  try {
    const r = runTool(['--with-offline', '--out-dir', dir]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /오프라인 실행본 포함/);
    assert.match(r.stderr, /주의: ZIP 파일명에 팀명 자리표시자/);
    assert.deepEqual(fs.readdirSync(dir), [ZIP_NAME]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('F-19 필수 파일 누락: 오프라인 참조 파일·안내·실행 파일이 없으면 실패하고 ZIP을 만들지 않음', () => {
  const root = copyRoot(), out = tempDir();
  try {
    fs.rmSync(path.join(root, 'src/main.js'));
    assert.throws(() => writeSubmission({ root, outDir: out, withOffline: true }), (e) => e instanceof SubmissionError && /index\.html이 참조하는 파일이 없습니다: src\/main\.js/.test(e.message));
    assert.doesNotThrow(() => buildSubmission({ root }), '기본 ZIP은 오프라인 파일이 필요 없음');
    fs.cpSync(path.join(ROOT, 'src/main.js'), path.join(root, 'src/main.js'));
    // 에셋 목록(ASSETS)에 등록됐지만 파일이 없는 경우. 주석의 예시 경로는 검사하지 않는다.
    const assetsPath = path.join(root, 'src/config/assets.js');
    fs.writeFileSync(assetsPath, fs.readFileSync(assetsPath, 'utf8').replace('const ASSETS = [];', "const ASSETS = [{ type: 'image', key: 'missing', url: 'src/assets/missing.png' }];"));
    assert.throws(() => buildSubmission({ root, withOffline: true }), /참조하는 파일이 없습니다: src\/assets\/missing\.png/);
    fs.mkdirSync(path.join(root, 'src/assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/assets/missing.png'), 'png');
    assert.doesNotThrow(() => buildSubmission({ root, withOffline: true }));

    fs.rmSync(path.join(root, 'submission/실행안내_오프라인.txt'));
    assert.throws(() => buildSubmission({ root, withOffline: true }), /필수 파일 없음: submission\/실행안내_오프라인\.txt/);
    fs.rmSync(path.join(root, 'submission', LAUNCHER));
    assert.throws(() => buildSubmission({ root }), /필수 파일 없음: submission\/게임실행\.html/);
    assert.deepEqual(fs.readdirSync(out), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true }); }
});

test('F-19 실행 파일 이상: 자리표시자 주소, 오프라인 표시 누락, 외부 주소 참조는 실패', () => {
  const root = copyRoot();
  try {
    const launcherPath = path.join(root, 'submission', LAUNCHER);
    const original = fs.readFileSync(launcherPath, 'utf8');
    fs.writeFileSync(launcherPath, original.replaceAll('TeamIroum.github.io', '아이디.github.io'));
    assert.throws(() => buildSubmission({ root }), /아이디\.github\.io/);
    fs.writeFileSync(launcherPath, original.replace('var OFFLINE_INCLUDED = false;', ''));
    assert.throws(() => buildSubmission({ root }), /OFFLINE_INCLUDED/);
    fs.writeFileSync(launcherPath, original.replace("'오프라인_실행/index.html'", "'offline/index.html'"));
    assert.throws(() => buildSubmission({ root }), /오프라인 실행 경로/);
    fs.writeFileSync(launcherPath, original);

    const indexPath = path.join(root, 'index.html');
    fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8').replace('<script src="lib/phaser-3.80.1.min.js"></script>', '<script src="https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js"></script>'));
    assert.throws(() => buildSubmission({ root, withOffline: true }), /외부 주소 참조/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
