# 조달청 타이쿤

조달 업무를 통해 주민의 요청을 해결하고 지역을 재건하는 2D 경영 시뮬레이션 프로토타입입니다.

## 바로 실행하기

프로젝트 루트의 `index.html`을 브라우저에서 더블클릭해 실행합니다. 별도 설치, 서버, 빌드 과정은 필요하지 않습니다. 최신 Chrome 또는 Edge를 권장합니다. 게임 진행은 F-18 브라우저 자동 저장을 통해 새로고침 후 복원됩니다.

제출용 진입 파일은 `submission/게임실행.html`입니다. 오프라인 실행본을 포함한 제출 ZIP은 별도 생성물이며, F-19 ZIP 생성과 독립 실행 검증은 완료했습니다. 실제 공모전 제출과 GitHub Pages 배포는 완료되지 않았습니다.

## 게임 진행

튜토리얼 '주민들의 잠자리 마련'부터 첫 동료 선발까지 진행합니다. 요청 확인, 재고 및 부족 수량 확인, 업체 제안 비교와 계약, 월말 보고, 일부 납품 대응, 검사, 성과평가, 시설 개선과 동료 모집을 경험합니다.

- S~C 등급은 통과, D 등급은 미통과입니다. D에서는 시설 개선·추가 정원·후보 생성·채용을 보류하고 사업을 `EVALUATED` 상태로 둔 채 결과와 보완 안내를 표시하고 튜토리얼을 종료합니다. 점수 공식과 D 도달 조건은 TEMP입니다.
- 정식 검사 목표는 품목별 `max(계약 수량, 실제 필요 수량)`입니다. 최종 실제 납품 수량이 목표 이상이어야 하며 필수 규격도 충족해야 합니다.
- 점검 생략 경로의 확정 예: 계약 매트 12개, 실제 필요 14개, TEMP 보완 2개(18만 원), 최종 납품 14개. 계약 집행액 164만 원과 보완 비용을 구분하며 총집행액 182만 원, 초기 예산 300만 원, 잔액 118만 원을 유지합니다.
- 미확정 기획과 밸런스는 `TEMP`로 표시합니다. 미정 정책을 임의로 확정하지 않습니다.

## 현재 구현 및 테스트 기준

- F-18: 성공한 진행 명령 뒤 단일 `localStorage` 슬롯에 자동 저장하고 새로고침 시 복원합니다. 저장 실패는 게임 입력을 막지 않는 안내로 표시합니다.
- F-19: 오프라인 제출 ZIP 생성 및 외부 폴더 압축 해제 후 독립 실행 검증을 완료했습니다. 실제 제출과 Pages 배포는 미완료입니다.
- 기준 자동 테스트: Node 60개 통과, Chromium CDP 4개 경로 통과, UI E2E 10개 시나리오 통과(기록된 QA 기준).
- Chrome headful: 전체 10개 시나리오 통과. Edge headful: 개별 시나리오는 통과했으나 전체 연속 실행은 불안정합니다. 자동화 러너 타이밍 문제와 게임 결함 여부는 아직 분리되지 않았습니다.

## 프로젝트 구조

```text
index.html          개발 실행 진입점
lib/                Phaser 3.80.1
src/                게임 코드(IIFE, 전역 TYCOON)
  config/           화면·밸런스·에셋 설정
  core/             GameState, schema, 저장 등 공통 기반
  data/             사업·업체·시설·대사 데이터
  systems/          게임 규칙
  ui/               위젯·대화·화면 데이터·아트
  scenes/           Phaser 장면
docs/               기획·기능·API·분배·협업 문서
tests/              자동 및 브라우저 테스트
submission/         제출용 실행 파일과 오프라인 리소스
tools/              제출 ZIP 생성 도구
```

## 테스트 실행

Windows PowerShell에서 프로젝트 루트 기준으로 실행합니다.

```powershell
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe' tests/all.mjs
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe' tests/browser/chromium-cdp.mjs
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe' tests/browser/play-walkthrough-cdp.mjs
```

프로젝트는 `file://` 실행 방식을 유지하며 npm 빌드 시스템이나 별도 개발 서버를 사용하지 않습니다.

## GitHub 협업

저장소: <https://github.com/TeamIroum/tycoon.git>

`main`은 안정화된 최종 버전 및 공모전 제출 브랜치이며, `develop`은 팀별 작업 통합과 테스트 브랜치입니다. 황상진은 `team1`, 이현우는 `team2`, 이소미는 `team3`에서 개발합니다. 각 팀원은 기능 구현과 테스트 후 `develop` 대상으로 Pull Request를 생성하고, 황상진이 검토·병합합니다. 통합 테스트와 오류 수정은 `develop`에서 확인하되 수정은 담당 개발 브랜치에서 진행해 PR로 반영합니다. 안정화 후 황상진이 `develop`에서 `main`으로 PR을 생성하고 병합합니다. `main`과 `develop` 직접 푸시는 금지합니다. 기존 `team4`는 사용하지 않습니다. 권한과 branch protection 설정은 GitHub에서 별도로 확인해야 합니다. 절차는 [GitHub 팀원 협업 가이드](docs/GitHub_팀원_협업가이드.md)를 따릅니다.

역할: 팀원 1은 게임 상태·진행과 조달부터 평가까지 핵심 로직, 저장, 통합을 담당합니다. 팀원 2는 캐릭터·건물·시설·배경 에셋, 마을·지형·타일맵과 월드 표현을 담당합니다. 팀원 3은 HUD·패널·튜토리얼 안내·화면 연출 등 UI/UX를 담당합니다. 상세 파일 경계는 [파트분배](docs/파트분배.md)를 확인하세요.

## 관련 문서

- [CLAUDE.md](CLAUDE.md): 기술 구조와 개발 규칙
- [게임기획서](docs/게임기획서.md): 게임 정책과 범위
- [기능정의서](docs/기능정의서.md): 기능 동작과 완료 조건
- [API명세서](docs/API명세서.md): 상태·명령·이벤트 규칙
- [파트분배](docs/파트분배.md): 담당 기능과 파일 소유권
- [Claude Code 팀원 개발 가이드](docs/Claude_Code_팀원_개발가이드.md)
- [GitHub 팀원 협업 가이드](docs/GitHub_팀원_협업가이드.md)

## 제출 패키지

제출 ZIP은 다음 명령으로 생성합니다.

```powershell
node tools/make-submission.mjs --with-offline
```

오프라인 실행본은 압축 해제 후 `오프라인_실행/index.html`에서 실행합니다. ZIP 파일명에 남은 팀명 자리표시자는 제출 전 확인이 필요합니다. 제출 전 실제 공모전의 파일명·형식·영상·개인정보·공개 범위 규정을 확인하세요. Pages 배포 주소는 <https://TeamIroum.github.io/tycoon/>이며, 실제 배포 여부는 별도로 확인해야 합니다.
