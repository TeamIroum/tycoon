# F-18 저장 실패 안내 UI 인계

## 변경 사항

- UI 파일: `src/scenes/UIScene.js`
- `UIScene.drawTop()`은 `TYCOON.app.saveStatus`를 읽고, 앱 호환 경로로 `TYCOON.app.autoSave.lastResult`를 보조 조회합니다. UI에서 localStorage를 직접 다루거나 저장 로직을 복제하지 않습니다.
- `STORAGE_UNAVAILABLE`, `READ_FAILED`, `WRITE_FAILED`, `CLEAR_FAILED` 상태에서 `진행 상황이 저장되지 않았습니다`를 상단 요약 바 아래에 지속 표시합니다.
- 저장 상태가 성공으로 바뀌면 다음 화면 렌더에서 안내가 사라집니다. 저장 성공 알림은 표시하지 않습니다. `EMPTY`, 손상 데이터 폐기, `FATAL`은 저장 실패 배너로 표시하지 않습니다.
- 기존 명령 오류 토스트가 동시에 표시되면 한 줄 아래로 옮겨 두 안내가 겹치지 않게 했습니다. 배너는 상단 영역에 있어 대화창과 우측/하단 조작 요소를 가리지 않습니다.
- 새 게임의 저장 성공 상태로 갱신되면 이전 배너가 제거됩니다. fatal 복구 후 새 게임을 시작하는 CDP 경로에서도 확인했습니다.

## 검증

- `tests/browser/play-walkthrough-cdp.mjs`의 `autosave-unavailable` 경로를 보강했습니다. CDP 마우스 클릭으로 저장 실패 배너 노출, 요청 확인 버튼 작동, 저장 성공 이후 배너 해제, 반복 성공 알림 부재를 검증합니다.
- `fatal` 경로는 저장 실패 배너가 있던 세션에서 fatal 복구 및 새 게임 후 배너가 남지 않는지 확인합니다.
- 전체 `dialog-input-blocking` 경로도 재실행해 대화 중 배경 입력 차단을 회귀 검증합니다.
- 화면 캡처: `tests/browser/play-qa-shots/autosave-unavailable-autosave-warning-visible.png`, `tests/browser/play-qa-shots/autosave-unavailable-autosave-warning-cleared.png` (1280×720 Chromium `file://`).

## 팀원 3 확인 사항

- 안내 문구는 의도적으로 항상 같은 짧은 문구이며 실패 원인 상세는 노출하지 않습니다. 원인 설명이나 사용자가 저장을 재시도하는 버튼이 필요하면 별도 UI 요구사항으로 협의해야 합니다.
- UI는 현재 `saveStatus` 값을 렌더 시점마다 조회합니다. 자동 저장 상태 갱신은 팀원 1의 `BrowserSave.attach()`가 담당합니다.
