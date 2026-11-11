# 조달청 타이쿤 — 개발 규칙

이 문서는 프로젝트의 기술 구조, 코드 작성 규칙, 협업 기준을 정한다. 게임 기획은 `docs/게임기획서.md`, 기능 동작은 `docs/기능정의서.md`, 코드 계약은 `docs/API명세서.md`를 따른다.

## 1. 문서 우선순위

기획·기능·API·파트 분배 문서가 충돌하면 게임기획서, 기능정의서, API명세서, 파트분배·README 순서로 검토한다. 실제 코드와 문서가 다르면 상태를 확인하고 담당자와 협의한 뒤 관련 문서를 함께 갱신한다. 정책이 정해지지 않은 값과 규칙은 `TEMP`로 유지한다.

## 2. 프로젝트 및 실행 환경

- 프로젝트: 조달청 타이쿤, Phaser 3.80.1, JavaScript, HTML/CSS, Canvas
- 대상: PC 웹 브라우저, 기준 해상도 1280×720
- 구조: 기존 IIFE와 전역 `TYCOON`
- 실행: 루트 `index.html`을 더블클릭하여 `file://`로 실행
- 별도 서버·빌드·npm 시스템은 도입하지 않는다.
- `import`/`export`, `require`, `type="module"`을 사용하지 않는다.
- 게임 데이터는 기존 JS 스크립트로 로드하며 `fetch`에 의존하지 않는다.

## 3. 기획과 현재 정책

첫 버전은 주민들의 잠자리 마련 튜토리얼부터 첫 동료 선발까지다. S~C 평가는 통과, D는 미통과다. D에서는 시설 개선, 추가 정원 승인, 후보 생성과 채용을 보류하고 사업 상태 `EVALUATED`를 유지한다. 결과와 보완 안내를 보여준 뒤 튜토리얼을 종료하며 `USE_STARTED`를 발생시키지 않는다. 등급 공식과 D 도달 조건은 TEMP다.

정식 검사 수량 목표는 품목별 `max(계약 수량, 실제 필요 수량)`이며, 최종 실제 납품 수량은 목표 이상이어야 한다. 필수 규격도 계약 규격에 포함되어야 한다. 점검 생략 경로는 계약 매트 12개, 실제 필요 14개, TEMP 보완 2개 및 18만 원 추가 비용, 최종 납품 14개다. 계약 집행액과 보완 비용을 중복 계산하지 않는다.

## 4. 핵심 구조와 코드 규칙

### 상태 및 명령

- 화면은 `TYCOON.app.store.getState()`로 상태를 읽고 `TYCOON.app.store.dispatch(command)`로 명령을 전달한다.
- 게임 규칙은 `src/systems/`에서 처리하고 밸런스는 `src/config/balance.js` 및 `src/data/`에서 관리한다.
- Scene/UI에서 규칙을 중복 구현하거나 GameState setter/System을 직접 호출하지 않는다.
- 기존 코드의 IIFE, 이름 공간, 스크립트 로딩 순서를 유지한다.
- System 결과는 기존 결과 형식 `{ ok: true, ... }` 또는 `{ ok: false, reason: '...' }`을 따른다.
- 명령 실패와 롤백은 상태 및 meta를 명령 직전 snapshot으로 복원한다. 명령 직전이 `INSPECTING`이면 정상 롤백 뒤에도 그 상태가 유지된다.
- 복원 자체가 실패한 경우에만 `ROLLBACK_FAILED` fatal 상태로 전환한다. fatal 중 명령은 차단하며 새 게임에서 fatal을 초기화한다.

### Phaser 및 리소스

- Scene의 `init`, `preload`, `create`, `update` 생명주기를 따른다.
- Canvas 환경에서 검증하고 WebGL 전용 기능에 의존하지 않는다.
- 에셋 경로는 `src/config/assets.js`, 로딩은 `PreloadScene`의 기존 구조를 따른다.
- 프로젝트 공식 마스코트 원본과 기존 리소스를 우선 사용한다.

### 저장

- F-18은 GameState 직렬화와 브라우저 저장소 연동을 구분한다. `src/core/BrowserSave.js`가 단일 `localStorage` 슬롯의 자동 저장·복원을 담당한다.
- 새 게임 시작 시 기존 저장을 교체하고, 성공한 진행 명령마다 저장한다. 실패·롤백·fatal을 정상 상태로 저장하지 않는다.
- 새로고침 시 마지막으로 성공한 명령 이후의 상태로 복원한다(월중 포함). 복원은 명령을 다시 실행하지 않는다.
- 저장 실패는 게임 진행을 막지 않고 `saveStatus`를 통해 UI에 전달한다. UI에서 `localStorage`를 직접 다루지 않는다.

## 5. 담당 파일과 협의

담당 범위와 파일 소유권은 `docs/파트분배.md`, 기능의 구현 상태는 `docs/기능정의서.md`와 실제 코드에서 확인한다.

| 팀원 | 기능·주요 파일 |
|---|---|
| 팀원 1 — 황상진 | F-01~F-14 핵심 규칙, F-18~F-19, 저장·통합 | `src/main.js`, `src/config/*`(`assets.js` 제외), `src/core/*`, `src/systems/*`, `src/data/projects.js`, `suppliers.js`, `facilities.js`, 시작 Scene, `tools/*`, `submission/*` |
| 팀원 2 — 이현우 | 게임 에셋, 마을·지형·시설 월드 표현 | `src/config/assets.js`, `src/ui/art.js`, `src/scenes/VillageScene.js`, `HallScene.js`, 신규 `src/assets/**` |
| 팀원 3 — 이소미 | F-15~F-17 UI/UX·대화·엔딩 | `src/scenes/OfficeScene.js`(전체 단독 소유), `UIScene.js`, `EndingScene.js`, `src/ui/widgets.js`, `viewData.js`, `MascotDialog.js`, `src/data/dialogs.js` |

공통 API, GameState, schema, 이벤트 계약과 게임 규칙은 팀원 1이 담당한다. 다른 팀원 소유 파일은 소유자와 협의 없이 수정하지 않는다. `OfficeScene.js`의 관청 화면 동작과 파일 내 관련 코드는 팀원 3 단독 소유이며 공통 GameState 변경은 기존 API 계약을 사용한다. `src/config/assets.js`와 `src/assets/**`는 팀원 2 단독 소유이며 에셋 등록을 위해 팀원 1의 별도 승인을 요구하지 않는다. 월드 Scene·아트의 공통 상태 연결은 팀원 1·2가, 화면과 공통 API 연결은 팀원 1·3이 협의한다.

## 6. 테스트 및 완료 보고

프로젝트 루트에서 다음 명령을 실행한다.

```powershell
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe' tests/all.mjs
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe' tests/browser/chromium-cdp.mjs
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe' tests/browser/play-walkthrough-cdp.mjs
```

테스트 개수는 변경될 수 있으므로 위 명령의 실제 출력을 기준으로 보고한다(2026-11-12 기준 Node 79개, Chromium CDP 4개 경로, UI E2E 10개 시나리오 통과). 실제 작업마다 관련 테스트를 다시 실행하고 결과를 구분한다. dispatch 기반 검증을 실제 마우스 플레이로 표현하지 않는다. 미실행·실패는 완료로 보고하지 않는다.

완료 보고에는 목적, 수정 파일별 변경, 실행 명령과 통과·실패·미실행 수, 브라우저 입력 방식, 미해결 위험을 적는다.

## 7. 제출 및 범위 관리

F-19 오프라인 제출 ZIP 생성과 독립 실행 검증은 완료됐으나 실제 공모전 제출과 GitHub Pages 배포는 별도 작업이다. 제출 파일명에 팀명 자리표시자가 남아 있을 수 있으므로 제출 전 확인한다. 제출 도구는 `tools/make-submission.mjs`를 사용한다. 미확정 공모전 조건은 임의로 정하지 않는다.

기존 정상 동작을 우선 보존하고 요청 범위의 최소 변경만 수행한다. 확정되지 않은 점수·가중치·재도전·후속 시스템을 임의로 추가하지 않는다. 문서 전체를 불필요하게 다시 쓰지 않는다.

## 8. GitHub 협업 규칙

- 저장소: `https://github.com/TeamIroum/tycoon.git`
- 브랜치: `main`은 안정화된 최종 버전, `develop`은 팀별 통합·테스트 브랜치다. `team1`(황상진), `team2`(이현우), `team3`(이소미)는 개발 브랜치이며 `team4`는 사용하지 않는다.
- 각 팀원은 본인 브랜치에서 개발·테스트하고 `develop` 대상 PR을 생성한다. 팀원 1이 검토 후 `develop`에 병합하고 통합 테스트를 관리한다. 통합 수정은 담당 개발 브랜치에서 수행해 PR로 반영한다.
- `main`과 `develop` 직접 커밋·push는 금지한다. 안정화 후 `develop`에서 `main`으로 PR을 만들며 검토·병합은 팀원 1이 담당한다.
- force push, 타 팀원 브랜치 변경·삭제, 인증정보 커밋을 금지한다.
- GitHub 권한 및 `main` branch protection/ruleset 적용 여부는 별도 확인한다.
- 상세 절차는 `docs/GitHub_팀원_협업가이드.md`를 따른다.

## 팀원별 개발 문서

팀원 2와 3은 작업 시작 전에 다음 문서를 확인한다.

- `docs/파트분배.md`
- `docs/Claude_Code_팀원_개발가이드.md`
- `docs/GitHub_팀원_협업가이드.md`

담당 파일과 기능 범위는 `docs/파트분배.md`를 기준으로 한다. Claude Code 사용 방법과 작업 보고 형식은 `docs/Claude_Code_팀원_개발가이드.md`를 따른다. 실제 저장소에 없는 인계 문서를 존재하는 것처럼 가정하지 않는다. 문서가 충돌하면 임의로 판단하지 않고 팀원 1에게 확인한다.
