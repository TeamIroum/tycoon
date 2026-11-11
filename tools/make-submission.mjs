/**
 * 공모전 제출용 ZIP 만들기. 실행: node tools/make-submission.mjs
 *
 * 게임 본체는 GitHub Pages에 있고, 제출하는 게임실행.html은 그 주소로 연결만 한다.
 * 담는 파일: submission/게임실행.html, submission/실행안내.txt
 * --with-offline 을 붙이면 인터넷이 안 될 때를 대비한 오프라인 실행본(오프라인_실행/)도 함께 담는다.
 *
 * 만들기 전에 submission/ 두 파일의 '아이디.github.io' 주소를 실제 주소로 바꿔야 한다.
 * 한글 파일 이름이 어느 PC에서도 깨지지 않게 UTF-8로 표시한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeZip } from './zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 접수가이드 파일명 규칙: AI게임_실행파일_작품명_성명(또는 팀명).zip
// TODO: 팀명이 정해지면 '팀명'을 바꾼다.
const ZIP_NAME = 'AI게임_실행파일_조달청타이쿤_팀명.zip';
const withOffline = process.argv.includes('--with-offline');

const launcher = fs.readFileSync(path.join(ROOT, 'submission', '게임실행.html'), 'utf8');
const guide = fs.readFileSync(path.join(ROOT, 'submission', '실행안내.txt'), 'utf8');
if (launcher.includes('아이디.github.io') || guide.includes('아이디.github.io')) {
  throw new Error("submission/ 파일의 '아이디.github.io'를 실제 GitHub Pages 주소로 바꾼 뒤 다시 실행하세요");
}

function collect(rel) {
  const full = path.join(ROOT, rel);
  if (fs.statSync(full).isFile()) return [rel];
  return fs.readdirSync(full).filter((n) => n !== '.gitkeep').sort().flatMap((n) => collect(path.join(rel, n)));
}

const files = [
  { name: '게임실행.html', data: Buffer.from(launcher, 'utf8') },
  { name: '실행안내.txt', data: Buffer.from(guide, 'utf8') }
];
if (withOffline) {
  for (const rel of ['index.html', 'lib', 'src'].flatMap(collect)) {
    files.push({ name: '오프라인_실행/' + rel.split(path.sep).join('/'), data: fs.readFileSync(path.join(ROOT, rel)) });
  }
}
const zip = makeZip(files);
fs.writeFileSync(path.join(ROOT, ZIP_NAME), zip);
console.log(`${ZIP_NAME}: 파일 ${files.length}개, ${Math.round(zip.length / 1024)} KB${withOffline ? ' (오프라인 실행본 포함)' : ''}`);
