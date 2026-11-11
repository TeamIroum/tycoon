# Claude Code 팀원 개발 가이드

이 문서는 조달청 타이쿤 팀원 2·3이 기존 프로젝트에서 Claude Code로 작업을 시작하고, 담당 파일 경계를 지키며 변경을 검증하기 위한 공통 안내서다.

## 1. 프로젝트와 개발 환경

- 프로젝트 루트: `C:\tycoon`
- 게임 엔진: Phaser 3.80.1
- 언어 및 화면: JavaScript, HTML, CSS
- 화면 기준: 1280×720, PC 웹 브라우저
- 구조: IIFE, 전역 `TYCOON`
- 실행: 루트의 `index.html`을 브라우저에서 직접 열어 `file://`로 실행
- 자동 저장: F-18 단일 `localStorage` 슬롯, 성공한 진행 명령 이후 저장 및 새로고침 복원
- 제출본: F-19 기본·오프라인 제출 ZIP 생성과 압축 해제 후 실행 자동 검증 구현. 최종 팀명 반영과 실제 공모전 제출은 미완료.
- 테스트 기록(참고, 완료 조건 아님): 2026-11-12 기준 Node 자동 테스트 100개, Chromium CDP 4개 경로, UI E2E 10개 시나리오 통과. 개수는 실제 실행 출력으로 확인한다. 브라우저별 headful 결과는 실행 기록과 QA 문서를 구분해 확인한다.

별도 빌드 시스템이나 개발 서버를 추가하지 않는다. `import`/`export`, npm 빌드 도구, 외부 라이브러리를 임의로 도입하지 않는다.

## 2. Claude Code 작업 시작

1. Claude Code에서 작업 폴더를 `C:\tycoon`으로 연다.
2. 시작 전에 아래 필독 문서와 자신의 담당 범위를 확인한다.
3. 작업 트리의 기존 변경 사항을 확인하고, 사용자가 수정한 내용은 덮어쓰지 않는다.
4. 요청한 기능을 담당 파일 내에서 최소 변경으로 구현한다. 담당 외 파일 변경이 필요하면 그 파일을 수정하기 전에 소유자와 협의한다.
5. 변경에 맞는 자동 테스트 및 필요한 브라우저 테스트를 실제 실행한다.
6. 수정 파일, 동작, 실행 명령과 결과, 미검증 사항을 완료 보고 양식에 따라 남긴다.

## 3. 작업 전 필독 문서

프로젝트의 현재 문서 파일은 다음 위치에 있다.

- `docs/게임기획서.md` — 확정된 기획 정책 및 TEMP 구분
- `docs/기능정의서.md` — 기능 동작 및 완료 조건
- `docs/API명세서.md` — GameState, 명령, 이벤트 계약
- `docs/파트분배.md` — 담당 기능 ID와 파일 소유권의 기준
- `docs/GitHub_팀원_협업가이드.md` — 공통 브랜치, 인증, PR 및 병합 절차
- `README.md` — 실행·테스트·제출 안내
- `CLAUDE.md` — 저장소 기술 규칙 및 공통 개발 원칙

기획·기능·API·파트 분배 문서는 `docs/` 안에 있고, `README.md`와 `CLAUDE.md`는 프로젝트 루트에 있다. 새 개발 가이드도 `docs/Claude_Code_팀원_개발가이드.md`에 둔다. 기획 정책은 게임기획서 v0.8을 우선하고, 불확정 정책은 TEMP로 유지한다. 구현 상태와 미완료 기능은 코드와 기능정의서를 함께 확인한다.

## 4. 팀원별 담당 영역과 소유권

기능 ID 및 세부 파일 소유권은 `docs/파트분배.md`를 따른다.

| 담당 | 주요 영역 | 주요 소유 파일 |
|---|---|---|
| 팀원 1 — 황상진 | F-01~F-14 핵심 게임 규칙, F-18 저장, F-19 제출·통합 | `src/main.js`, `src/config/*`(`assets.js` 제외), `src/core/*`, `src/systems/*`, 규칙 데이터 `src/data/projects.js`, `suppliers.js`, `facilities.js`, Boot/Preload/Title Scene, `tools/*`, `submission/*` |
| 팀원 2 — 이현우 | 게임 에셋, 배경·맵·시설의 월드 시각 표현 | `src/config/assets.js`, `src/ui/art.js`, `src/scenes/VillageScene.js`, `src/scenes/HallScene.js`, 신규 `src/assets/**` |
| 팀원 3 — 이소미 | F-15~F-17 UI/UX, HUD·패널·대화·엔딩 및 전체 기능 UI | `src/scenes/OfficeScene.js`(전체 단독 소유), `src/scenes/UIScene.js`, `src/scenes/EndingScene.js`, `src/ui/widgets.js`, `src/ui/viewData.js`, `src/ui/MascotDialog.js`, `src/data/dialogs.js` |

각 파일은 표의 한 팀원이 소유한다. 팀원 2의 월드 Scene은 비주얼과 배치를 담당하며 규칙·상태 변경은 팀원 1의 System을 통해 처리한다. UI는 상태를 Store/viewData로 읽고 명령은 dispatch로 전달한다. `UIScene.js` 및 UI 파일은 팀원 3 소유다.
## 5. 코드 수정 및 협업 규칙

- 기존 IIFE와 전역 `TYCOON`, 현재 스크립트 로딩 순서 및 `file://` 실행을 유지한다.
- 화면은 `TYCOON.app.store.getState()`로 상태를 읽고 `TYCOON.app.store.dispatch(command)`로 명령을 전달한다.
- 게임 규칙은 `src/systems/`에서 처리하고 UI에 규칙을 복제하지 않는다.
- 확정 기획을 우선 적용하고, 확정되지 않은 점수·가중치·후보 규칙·수량 등은 임의 확정하지 않고 TEMP로 남긴다.
- 기존 동작과 테스트를 존중한다. 테스트 기대값만 바꾸거나 기존 테스트를 제거해 통과시키지 않는다.
- 담당 파일 밖 변경, 공용 인터페이스 변경, 다른 담당자가 진행 중인 작업과 충돌할 수 있는 변경은 먼저 협의한다.
- 이 개발 가이드와 파트 분배 문서가 충돌하면 임의로 범위를 재배정하지 말고 팀원 1에게 확인한다.

### 공통 API·GameState 변경 절차

1. 변경하려는 상태 필드, 명령, 이벤트, 저장 데이터 영향과 모든 소비자를 먼저 찾는다.
2. 팀원 1에게 목적과 호환성 영향을 공유하고, 관련 소비자인 팀원 2·3과 사용처를 협의한다.
3. 합의 전에는 공통 API/schema/GameState를 단독으로 확정하거나 소비자 파일을 함께 고치지 않는다.
4. 합의된 계약에 맞춰 담당 파일을 수정하고 회귀 테스트를 추가·실행한다.
5. UI 표기 또는 기획 설명도 바뀌면 관련 소유자와 문서 담당 범위를 확인해 반영한다.

공통 규칙·계약·후보·저장 구조는 팀원 1이 소유한다. 월드 Scene 연동은 팀원 1·2, UI와 `saveStatus` 표시는 팀원 1·3이 함께 확인한다.

## 6. 테스트 실행

Windows PowerShell에서 프로젝트 루트 기준으로 실행한다. Node.js 실행 파일이 PATH에 있으면 `node`를 사용하고, 그렇지 않으면 아래 확인된 절대 경로를 사용한다.

```powershell
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe' tests/all.mjs
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe' tests/browser/chromium-cdp.mjs
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe' tests/browser/play-walkthrough-cdp.mjs
```

참고 기록은 2026-11-12 기준 Node 100개, Chromium CDP 4개 경로, UI E2E 10개 시나리오다. 개수는 완료 조건이 아니며 실행 시점의 실제 출력을 보고하고, 실행하지 않은 테스트는 통과로 쓰지 않는다. 코드 변경이 없거나 범위상 일부 테스트를 실행하지 못했다면 그 사실과 이유를 구분한다. headful 브라우저 결과 및 미검증 환경은 인계 문서에 기록된 범위를 넘겨 주장하지 않는다.

## 7. 작업 완료 보고 양식

```text
담당 팀원 / 작업 목표:

수정 파일:
- 경로 — 변경 내용과 이유

구현 결과:
- 기대 동작과 실제 동작
- 관련 API·데이터 계약 및 협의 내용

테스트:
- 실행 명령 — 통과/실패/미실행 수
- 브라우저 입력 여부와 확인 경로

미해결·미검증 사항:
- 오류, TEMP 결정 필요 항목, 재현 절차 또는 미검증 이유

다음 담당자에게 필요한 인계:
- 파일 충돌 가능성, 후속 작업, 검토 요청
```

## 8. 팀원별 Claude Code 시작 프롬프트

프롬프트의 대괄호 부분을 해당 작업으로 바꾸고 프로젝트 루트에서 사용한다. 프롬프트는 작업 범위를 부여할 뿐, 담당 범위나 정책을 변경하지 않는다.

### 팀원 2 — 에셋 및 월드 표현

```text
프로젝트 C:\tycoon에서 이현우(팀원 2), team2 브랜치로 작업합니다. 먼저 CLAUDE.md, README.md, docs/게임기획서.md, docs/기능정의서.md, docs/API명세서.md, docs/파트분배.md, docs/Claude_Code_팀원_개발가이드.md, docs/GitHub_팀원_협업가이드를 확인하세요. 소유 파일은 src/config/assets.js 전체, src/ui/art.js, src/scenes/VillageScene.js, src/scenes/HallScene.js, 신규 에셋 경로 src/assets/**입니다. 캐릭터·건물·시설·배경, 에셋 등록·경로·리소스 설정 및 월드 표현을 담당합니다. 공통 게임 상태와 규칙 로직은 기존 API 계약을 사용하고 계약 변경이 필요할 때 팀원 1과 협의하세요. 에셋 등록은 본인 소유 범위이며 팀원 1의 별도 승인을 요구하지 않습니다. 먼저 작업 범위와 수정 계획을 보고하고 승인 뒤에만 개발을 시작하세요.
```

### 팀원 3 — UI/UX 및 게임 인터페이스

```text
프로젝트 C:\tycoon에서 이소미(팀원 3), team3 브랜치로 작업합니다. 먼저 CLAUDE.md, README.md, docs/게임기획서.md, docs/기능정의서.md, docs/API명세서.md, docs/파트분배.md, docs/Claude_Code_팀원_개발가이드.md, docs/GitHub_팀원_협업가이드를 확인하세요. OfficeScene.js 전체는 팀원 3 단독 소유이며 관청 화면 구현, 사용자 입력, 화면 내 동작과 파일 내 관련 상태 변경 코드를 담당합니다. UIScene.js, EndingScene.js, ui/widgets.js, ui/viewData.js, ui/MascotDialog.js, data/dialogs.js도 소유합니다. 공통 GameState 변경과 게임 규칙은 기존 Store/TutorialFlow API 계약으로 연동하고 API 계약 자체를 임의 변경하지 마세요. 먼저 작업 범위와 수정 계획·테스트 계획을 보고하고 승인 뒤 개발을 시작하세요. src/ui/art.js, src/config/assets.js 및 Village/Hall Scene은 팀원 2 소유입니다.
```
## 9. GitHub 협업 권한

모든 팀원은 자신의 개발 브랜치에서 Git 작업과 PR 생성을 수행한다. `team1`은 황상진, `team2`는 이현우, `team3`은 이소미의 브랜치다. `team4`는 사용하지 않는다. 작업 브랜치 PR은 `develop`을 대상으로 하고, 팀원 1이 검토 후 병합해 통합 테스트를 진행한다. `develop`에서 `main`으로의 안정화 PR과 병합도 팀원 1이 담당한다. `main`과 `develop` 직접 변경은 금지한다. 팀원별 GitHub 권한과 branch protection/ruleset의 실제 적용 여부는 저장소 설정에서 별도로 확인해야 한다.

인증·clone·개인 브랜치 생성·테스트·commit/push·PR·충돌 해결 절차는 `docs/GitHub_팀원_협업가이드.md`를 따른다. 접근 권한이 없거나 원격 주소가 확인되지 않으면 우회하지 말고 팀원 1에게 보고한다. 인증 비밀정보를 저장소에 넣지 않고 force push 및 다른 팀원 브랜치 변경/삭제를 하지 않는다.

모든 팀원은 고정 개발 브랜치 `team1`, `team2`, `team3`에서 작업하고 `develop` 대상 PR을 생성한다. 팀원 1이 `develop`에 통합하고 테스트한 뒤 안정화되면 `develop`에서 `main`으로 PR을 만든다. `main`과 `develop` 직접 변경 및 최종 병합은 팀원 1이 관리한다. 담당 파일 소유권과 공통 API 협의 원칙은 계속 유지한다.
