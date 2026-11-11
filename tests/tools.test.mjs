/** 설정·빌드 도구 단위 테스트 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYCOON } from './load.mjs';
import { makeZip, crc32 } from '../tools/zip.mjs';

const { pickZoom } = TYCOON.config;

test('표시 배율: 창에 들어가는 가장 큰 배율만 고른다', () => {
  assert.equal(pickZoom(1920, 1080), 1.5);
  assert.equal(pickZoom(1920, 960), 1);
  assert.equal(pickZoom(1366, 768), 1);
  assert.equal(pickZoom(1000, 600), 0.5);
  assert.equal(pickZoom(300, 200), 0.5);
});

test('ZIP: 시그니처와 파일 수', () => {
  const zip = makeZip([{ name: 'index.html', data: Buffer.from('<html>') }, { name: 'a.txt', data: Buffer.from('a') }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), 2);
});

test('CRC32: 알려진 값과 일치', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('Phaser 설정: 더블클릭 실행용 (CANVAS, 이미지 HTMLImageElement, HTML5 오디오)', () => {
  const fakePhaser = { CANVAS: 1, AUTO: 0, Scale: { NONE: 0 } };
  const cfg = TYCOON.config.createPhaserConfig(fakePhaser, [], { width: 1920, height: 1080 });
  assert.equal(cfg.type, fakePhaser.CANVAS);
  assert.equal(cfg.loader.imageLoadType, 'HTMLImageElement');
  assert.equal(cfg.audio.disableWebAudio, true);
  assert.equal(cfg.pixelArt, true);
  assert.equal(cfg.scale.zoom, 1.5);
});
