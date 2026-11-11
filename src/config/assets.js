/**
 * 불러올 에셋 목록. (담당: 팀원 1, 항목 추가는 각 담당자)
 * 형식: { type: 'image', key: 'office_bg', url: 'src/assets/office/bg.png' }
 *       { type: 'audio', key: 'click', url: 'src/assets/ui/click.mp3' }
 * 경로는 index.html 기준 상대 경로. 새 항목은 목록 끝에 한 줄씩 추가한다.
 * 에셋은 PreloadScene이 이 목록으로만 불러온다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const CONFIG_NS = (TYCOON.config = TYCOON.config || {});

  const ASSETS = [];

  Object.assign(CONFIG_NS, { ASSETS });
})();
