/**
 * 불러올 에셋 목록. (담당: 팀원 2)
 * 형식: { type: 'image', key: 'office_bg', url: 'src/assets/office/bg.png' }
 *       { type: 'audio', key: 'click', url: 'src/assets/ui/click.mp3' }
 * 경로는 index.html 기준 상대 경로. 새 항목은 아래 ASSETS.push 목록 끝에 한 줄씩 추가한다.
 * 에셋은 PreloadScene이 이 목록으로만 불러온다.
 * 아래 빈 배열 선언 줄은 tests/submission.test.mjs가 그 글자를 파일에서 처음 찾은 곳 하나만 바꾸므로 고치지 않는다.
 * 같은 글자를 이 주석이나 다른 곳에 다시 쓰지 않는다(주석이 대신 바뀌어 F-19 테스트가 실패한다).
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const CONFIG_NS = (TYCOON.config = TYCOON.config || {});

  const ASSETS = [];

  // 배경 그림 (1920×1080, 원본 2752×1536에서 축소, 제미나이 표시 제거, 파일 안 숨은 정보 없음).
  // 키는 src/ui/art.js의 BG_KEYS와 같다. 파일이 없거나 로드에 실패하면 art.js가 도형 그림으로 대신 그린다.
  ASSETS.push(
    { type: 'image', key: 'bg_region', url: 'src/assets/village/region_map.png' },
    { type: 'image', key: 'bg_office', url: 'src/assets/office/office_bg.png' },
    { type: 'image', key: 'bg_hall_before', url: 'src/assets/hall/hall_before.png' },
    { type: 'image', key: 'bg_hall_after', url: 'src/assets/hall/hall_after.png' },
    // 개선 전 강당 바닥의 매트(2인용 세트 4개 = 매트 8장)와, 매트 상태 점검 뒤 젖은 매트(세트 1개 = 2장). 학당 강당2 그림에서 같은 자리를 잘라 냄
    { type: 'image', key: 'bg_hall_mats', url: 'src/assets/hall/hall_mats.png' },
    { type: 'image', key: 'bg_hall_mats_wet', url: 'src/assets/hall/hall_mats_wet.png' },
    // 채용한 동료(관청 두 번째 업무석에 앉은 뒷모습). art.drawOffice가 채용 뒤 직접 그린다. 다른 사람은 그리지 않는다.
    // 임시 텍스처 키(colleague_sit 등)는 tests/browser/texture-fallback-cdp.mjs가 이름·크기를 검사하므로 이 목록에 넣지 않는다.
    { type: 'image', key: 'art_colleague_seat', url: 'src/assets/people/colleague_seat.png' },
    // 타이틀 배경. TitleScene(팀원 1)에서 사용: if (this.textures.exists('bg_title')) this.add.image(0, 0, 'bg_title').setOrigin(0);
    { type: 'image', key: 'bg_title', url: 'src/assets/ui/title_bg.png' },
    // UI 키트 (widgets.js가 9조각으로 늘여 패널·버튼에 입힘). 모서리 두께는 widgets.js SKIN_INSET
    { type: 'image', key: 'ui_panel', url: 'src/assets/ui/kit/panel.png' }
  );
  // 마스코트 표정 (MascotDialog). 나르미 = 새, 달이 = 다람쥐. 한 줄에서 같은 틀·같은 배율로 잘라 크기가 바뀌지 않는다.
  ['talk', 'smile', 'point', 'pointsmile', 'wingup', 'happy', 'excited'].forEach(function (f) {
    ASSETS.push({ type: 'image', key: 'mascot_narumi_' + f, url: 'src/assets/ui/mascot/narumi_' + f + '.png' });
  });
  ['surprised', 'talk', 'smile', 'wave'].forEach(function (f) {
    ASSETS.push({ type: 'image', key: 'mascot_dali_' + f, url: 'src/assets/ui/mascot/dali_' + f + '.png' });
  });
  // 마스코트 머리 위 이모티콘, 젖은 매트 위 물방울(wet)
  ['smile', 'check', 'drops', 'sleep', 'cap', 'heart', 'clock', 'alert', 'sparkle', 'wet'].forEach(function (f) {
    ASSETS.push({ type: 'image', key: 'emote_' + f, url: 'src/assets/ui/emote/' + f + '.png' });
  });
  ['paper', 'teal', 'gold', 'red'].forEach(function (color) {
    ['n', 'h', 'p', 'd'].forEach(function (st) {
      ASSETS.push({ type: 'image', key: 'ui_btn_' + color + '_' + st, url: 'src/assets/ui/kit/btn_' + color + '_' + st + '.png' });
    });
  });

  Object.assign(CONFIG_NS, { ASSETS });
})();
