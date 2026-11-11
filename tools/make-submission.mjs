/**
 * 공모전 제출용 ZIP 만들기.
 *   node tools/make-submission.mjs                  기본 ZIP: 게임실행.html(Pages로 연결) + 실행안내.txt
 *   node tools/make-submission.mjs --with-offline   오프라인 ZIP: 위 파일 + 오프라인_실행/(index.html, lib, src)
 *   --out-dir <폴더>                                 ZIP을 저장할 폴더 (기본: 프로젝트 루트)
 *
 * 기본 ZIP의 게임실행.html은 GitHub Pages 주소로 연결한다(인터넷 필요).
 * 오프라인 ZIP에서는 게임실행.html의 OFFLINE_INCLUDED를 true로 바꿔, file://로 열면 오프라인_실행/index.html을 연다.
 * 필수 파일 누락, 실행 파일이 참조하는 경로 누락, 외부 주소 참조, 자리표시자 주소가 있으면 ZIP을 만들지 않고 실패한다.
 * 한글 파일 이름이 어느 PC에서도 깨지지 않게 UTF-8로 표시한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { makeZip, readZip } from './zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 접수가이드 파일명 규칙: AI게임_실행파일_작품명_성명(또는 팀명).zip
// TODO: 팀명이 정해지면 '팀명'을 바꾼다. 바꾸기 전까지는 만들 때마다 경고를 출력한다.
export const ZIP_NAME = 'AI게임_실행파일_조달청타이쿤_팀명.zip';
export const TEAM_NAME_PLACEHOLDER = '팀명';
export const OFFLINE_DIR = '오프라인_실행';
export const LAUNCHER = '게임실행.html';
export const GUIDE = '실행안내.txt';
const OFFLINE_GUIDE_SOURCE = '실행안내_오프라인.txt';
const OFFLINE_FLAG_OFF = 'var OFFLINE_INCLUDED = false;';
const OFFLINE_FLAG_ON = 'var OFFLINE_INCLUDED = true;';
const OFFLINE_SOURCES = ['index.html', 'lib', 'src'];
const PAGES_URL = /https:\/\/[\w.-]+\.github\.io\/[\w./-]*/;
const ADDRESS_PLACEHOLDER = '아이디.github.io';

export class SubmissionError extends Error {}

export function parseArgs(argv) {
  const options = { withOffline: false, outDir: ROOT };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--with-offline') options.withOffline = true;
    else if (arg === '--out-dir') {
      const dir = argv[++i];
      if (!dir || dir.startsWith('--')) throw new SubmissionError('--out-dir 뒤에 저장할 폴더 경로가 필요합니다');
      options.outDir = path.resolve(dir);
    } else throw new SubmissionError(`알 수 없는 옵션: ${arg} (사용 가능: --with-offline, --out-dir <폴더>)`);
  }
  return options;
}

function collect(root, rel) {
  const full = path.join(root, rel);
  if (fs.statSync(full).isFile()) return [rel];
  // .gitkeep 등 숨김 파일은 제출하지 않는다.
  return fs.readdirSync(full).filter((n) => !n.startsWith('.')).sort().flatMap((n) => collect(root, path.join(rel, n)));
}

/** index.html의 src/href와 에셋 목록(ASSETS)의 url. 실행 파일이 실제로 불러오는 경로다. */
function referencedPaths(indexHtml, assetsJs) {
  const refs = [...indexHtml.replace(/<!--[\s\S]*?-->/g, '').matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  if (assetsJs) {
    // 주석의 예시 경로를 잡지 않도록 assets.js를 격리 실행해 실제 목록만 읽는다.
    const sandbox = {};
    vm.runInNewContext(assetsJs, { globalThis: sandbox }, { timeout: 1000 });
    const assets = (sandbox.TYCOON && sandbox.TYCOON.config && sandbox.TYCOON.config.ASSETS) || [];
    refs.push(...assets.map((a) => a.url).filter((u) => typeof u === 'string'));
  }
  return refs;
}

/**
 * ZIP에 넣을 파일을 모으고 검사한다. 문제가 하나라도 있으면 SubmissionError를 던진다(ZIP을 만들지 않는다).
 * @returns {{ name: string, files: { name: string, data: Buffer }[], warnings: string[] }}
 */
export function buildSubmission({ root = ROOT, withOffline = false } = {}) {
  const problems = [];
  const read = (rel) => {
    const full = path.join(root, rel);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) { problems.push(`필수 파일 없음: ${rel}`); return null; }
    return fs.readFileSync(full, 'utf8');
  };

  let launcher = read(`submission/${LAUNCHER}`);
  const guide = read(`submission/${withOffline ? OFFLINE_GUIDE_SOURCE : GUIDE}`);
  if (launcher !== null) {
    if (launcher.includes(ADDRESS_PLACEHOLDER)) problems.push(`${LAUNCHER}: '${ADDRESS_PLACEHOLDER}'를 실제 GitHub Pages 주소로 바꾸세요`);
    if (!PAGES_URL.test(launcher)) problems.push(`${LAUNCHER}: GitHub Pages 주소가 없습니다`);
    if (launcher.split(OFFLINE_FLAG_OFF).length !== 2) problems.push(`${LAUNCHER}: '${OFFLINE_FLAG_OFF}' 줄이 정확히 한 번 있어야 합니다`);
    if (!launcher.includes(`'${OFFLINE_DIR}/index.html'`)) problems.push(`${LAUNCHER}: 오프라인 실행 경로가 '${OFFLINE_DIR}/index.html'과 다릅니다`);
    if (withOffline) launcher = launcher.replace(OFFLINE_FLAG_OFF, OFFLINE_FLAG_ON);
  }
  if (guide !== null && guide.includes(ADDRESS_PLACEHOLDER)) problems.push(`${GUIDE}: '${ADDRESS_PLACEHOLDER}'를 실제 주소로 바꾸세요`);

  const files = [];
  if (launcher !== null) files.push({ name: LAUNCHER, data: Buffer.from(launcher, 'utf8') });
  if (guide !== null) files.push({ name: GUIDE, data: Buffer.from(guide, 'utf8') });

  if (withOffline) {
    const sources = [];
    for (const rel of OFFLINE_SOURCES) {
      if (!fs.existsSync(path.join(root, rel))) problems.push(`필수 파일 없음: ${rel}`);
      else sources.push(...collect(root, rel).map((r) => r.split(path.sep).join('/')));
    }
    const included = new Set(sources);
    const indexHtml = included.has('index.html') ? fs.readFileSync(path.join(root, 'index.html'), 'utf8') : '';
    const assetsJs = included.has('src/config/assets.js') ? fs.readFileSync(path.join(root, 'src/config/assets.js'), 'utf8') : '';
    for (const ref of referencedPaths(indexHtml, assetsJs)) {
      if (/^(?:[a-z]+:)?\/\//i.test(ref)) problems.push(`외부 주소 참조(오프라인 실행 불가): ${ref}`);
      else if (!included.has(decodeURI(ref.split(/[?#]/)[0]).replace(/^\.\//, ''))) problems.push(`index.html이 참조하는 파일이 없습니다: ${ref}`);
    }
    for (const rel of sources) files.push({ name: `${OFFLINE_DIR}/${rel}`, data: fs.readFileSync(path.join(root, rel)) });
  }

  if (problems.length) throw new SubmissionError(problems.map((p) => '- ' + p).join('\n'));
  const warnings = [];
  if (ZIP_NAME.includes(TEAM_NAME_PLACEHOLDER)) warnings.push(`ZIP 파일명에 팀명 자리표시자 '${TEAM_NAME_PLACEHOLDER}'가 남아 있습니다. 제출 전 실제 팀명으로 바꾸세요`);
  return { name: ZIP_NAME, files, warnings };
}

/** 검사 → ZIP 생성 → 다시 읽어 내용 확인 → 임시 파일에 쓴 뒤 이름 변경. 실패하면 새 ZIP을 남기지 않는다. */
export function writeSubmission({ outDir = ROOT, ...options } = {}) {
  const result = buildSubmission(options);
  const zip = makeZip(result.files);
  const back = readZip(zip);
  if (back.length !== result.files.length || back.some((f, i) => f.name !== result.files[i].name || !f.data.equals(result.files[i].data))) {
    throw new SubmissionError('- 생성한 ZIP을 다시 읽은 내용이 원본과 다릅니다');
  }
  fs.mkdirSync(outDir, { recursive: true });
  const target = path.join(outDir, result.name);
  const temp = target + '.tmp';
  fs.writeFileSync(temp, zip);
  fs.renameSync(temp, target);
  return { ...result, path: target, size: zip.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const r = writeSubmission(options);
    console.log(`${r.name}: 파일 ${r.files.length}개, ${Math.round(r.size / 1024)} KB${options.withOffline ? ' (오프라인 실행본 포함)' : ' (Pages 연결, 인터넷 필요)'}`);
    console.log(`저장 위치: ${r.path}`);
    for (const w of r.warnings) console.warn(`주의: ${w}`);
  } catch (error) {
    if (!(error instanceof SubmissionError)) throw error;
    console.error(`제출 ZIP을 만들지 않았습니다.\n${error.message}`);
    process.exitCode = 1;
  }
}
