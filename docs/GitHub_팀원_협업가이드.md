# 조달청 타이쿤 — GitHub 팀원 협업 가이드

이 문서는 모든 팀원이 자신의 개발 브랜치에서 작업해 `develop` 대상 Pull Request(PR)를 만들고, 팀원 1이 통합·테스트한 뒤 안정화된 내용을 `main`으로 승격하는 절차를 정의한다. 프로젝트 파일 소유권과 게임 기획 정책은 `docs/파트분배.md`, 기능 동작은 `docs/기능정의서.md`를 따른다.

## 1. 저장소 및 브랜치 전략

- `main`: 황상진 담당. 안정화된 최종 버전 및 공모전 제출 브랜치. 직접 커밋·푸시는 금지한다.
- `develop`: 황상진 담당. 팀별 작업 통합 및 테스트 브랜치. 직접 커밋·푸시는 금지하며 PR 병합은 팀원 1이 수행한다.
- `team1`: 황상진(팀원 1) 개발 브랜치
- `team2`: 이현우(팀원 2) 개발 브랜치
- `team3`: 이소미(팀원 3) 개발 브랜치
- 모든 팀원은 자신의 브랜치에서 개발하고 `develop` 대상 PR을 생성한다. 팀원 1도 `team1`에서 개발한 뒤 PR로 `develop`에 통합한다. 이소미는 `team3`를 사용하며 `team4`는 사용하지 않는다.
- 팀원 1이 PR을 검토·병합하고 `develop`에서 통합 테스트와 오류 수정을 관리한다. 수정은 담당 개발 브랜치에서 진행해 PR로 반영한다.
- 안정화가 완료되면 팀원 1이 `develop`에서 `main`으로 PR을 만들고 검토·병합한다.
- 최종 흐름: `team1 / team2 / team3 → develop → main`.
- 작업 PR의 base는 `develop`, compare는 본인 작업 브랜치로 설정한다. 안정화 PR의 base는 `main`, compare는 `develop`이다.
- 한 브랜치에는 하나의 담당 작업을 담고, 다른 팀원 브랜치에 커밋하거나 그 브랜치를 수정·삭제하지 않는다.
- 확인된 저장소 주소는 `https://github.com/TeamIroum/tycoon.git`이다.

```text
https://github.com/TeamIroum/tycoon.git
```

## 2. 권한 및 인증 준비

작업 전에 GitHub 계정이 대상 저장소에 초대되어 있고, 본인 브랜치에 push하고 PR을 열 수 있는 권한이 있는지 확인한다. 팀원 1 또는 저장소 관리자가 팀원별 권한을 부여한다.

인증은 조직에서 허용한 GitHub CLI 로그인, SSH 키 또는 Git Credential Manager를 사용한다. HTTPS 주소에 개인 액세스 토큰이나 비밀번호를 직접 붙이지 않는다. 토큰, 비밀번호, 개인 키, 인증 파일은 소스·설정·로그에 넣거나 커밋하지 않는다.

확인 예시:

```bash
gh auth status
git ls-remote --heads https://github.com/TeamIroum/tycoon.git main develop
```

`gh`가 없는 환경에서는 브라우저 로그인 또는 조직이 허용한 Git 인증 도구를 사용한다. 인증 또는 저장소 접근에 실패하면 권한 우회, 타인 자격 증명 사용, 임의 remote 생성 없이 중단하고 오류를 팀원 1에게 보고한다.

다음 설정은 실제 적용 여부를 별도로 확인해야 한다. 팀원 1/저장소 관리자가 GitHub 저장소 설정에서 별도로 점검해야 한다.

- 현재 팀 구성원(황상진·이현우·이소미)의 저장소 권한 및 개인 브랜치 push/PR 생성 권한
- `main` 및 `develop` branch protection 또는 ruleset
- `main` 및 `develop` 직접 push 제한, develop PR 병합 및 main 최종 병합 권한을 팀원 1로 제한
- PR 승인 수, 필수 상태 검사, force push 제한

## 3. Claude Code로 클론 및 작업 브랜치 준비

프로젝트를 둘 상위 폴더에서 Claude Code를 시작하고, 담당 팀원 시작 프롬프트에 저장소 주소를 입력한다. 인증이 이미 완료됐는지 확인한 다음 저장소를 클론한다.

```bash
git clone https://github.com/TeamIroum/tycoon.git tycoon
cd tycoon
git fetch origin
git switch develop
git pull --ff-only origin develop
```

팀원별 개인 작업 브랜치를 만든다.

```bash
# 황상진 (팀원 1)
git switch -c team1 origin/develop

# 이현우 (팀원 2)
git switch -c team2 origin/develop

# 이소미 (팀원 3)
git switch -c team3 origin/develop

```

이미 본인 브랜치가 존재하면 새로 만들지 말고 그 브랜치로 전환한다. 다른 팀원의 브랜치로 작업하거나 기존 원격 브랜치를 삭제하지 않는다. 신규 팀 브랜치는 `origin/develop`에서 분기한다.

이미 존재하는 로컬 브랜치로 전환:

```bash
git switch team1
git switch team2
git switch team3
```

원격에만 있는 본인 브랜치를 로컬에서 추적:

```bash
git switch --track origin/team1
git switch --track origin/team2
git switch --track origin/team3
```

## 4. 문서 확인 및 담당 파일 경계

작업 전 아래 문서를 읽는다.

- `CLAUDE.md`
- `README.md`
- `docs/게임기획서.md`
- `docs/기능정의서.md`
- `docs/API명세서.md`
- `docs/파트분배.md`
- `docs/Claude_Code_팀원_개발가이드.md`
- `docs/GitHub_팀원_협업가이드.md`

담당 기능과 파일 경계는 `docs/파트분배.md`를 기준으로 한다. 담당 외 파일을 수정해야 한다면 해당 소유자와 먼저 협의하고 승인받는다.

역할과 파일 소유권은 다음과 같다. 신규 아트 경로는 실제 추가 전까지 예정 항목으로 본다.

| 파일/영역 | 담당 | 협의 사항 |
|---|---|---|
| `src/core/*`, `src/main.js`, `src/systems/*`, `src/config/*`(`assets.js` 제외), 규칙 데이터(`projects.js`, `suppliers.js`, `facilities.js`), 공통 시작 Scene, `tools/*`, `submission/*` | 팀원 1(황상진) | 공통 API·상태·명령 변경 전 소비자와 협의 |
| `src/config/assets.js`, `src/ui/art.js`, `src/scenes/VillageScene.js`, `src/scenes/HallScene.js`, `src/assets/**` | 팀원 2(이현우) | 에셋 등록·경로·리소스 설정 포함. 공통 API 계약 변경이 필요할 때 팀원 1과 협의 |
| `src/scenes/OfficeScene.js`, `src/scenes/UIScene.js`, `src/scenes/EndingScene.js`, `src/ui/widgets.js`, `src/ui/viewData.js`, `src/ui/MascotDialog.js`, `src/data/dialogs.js` | 팀원 3(이소미) | OfficeScene 전체 단독 소유: 관청 화면, 입력, 화면 내 동작 및 파일 내 관련 상태 변경 코드. 공통 GameState는 기존 API 계약으로 연동 |

각 파일은 위 한 담당자가 소유하며 공동 소유하지 않는다. `OfficeScene.js`는 팀원 3 단독, `src/config/assets.js`와 `src/assets/**`는 팀원 2 단독 소유다. 에셋 등록 및 리소스 설정은 팀원 2의 담당 범위이며 팀원 1의 별도 승인을 요구하지 않는다. 후보 생성·채용 규칙과 후보 데이터는 팀원 1, 선발 팝업은 팀원 3이 맡는다.
## 5. 개발 중 변경 확인 및 테스트

작업 전후 `git status`와 `git diff`로 변경 파일을 확인한다. 본인 브랜치에 담당 변경만 포함하고, 인증 정보·생성 산출물·불필요한 파일이 들어가지 않았는지 검토한다.

Windows PowerShell에서 프로젝트 루트 기준으로 테스트한다.

```powershell
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe' tests/all.mjs
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe' tests/browser/chromium-cdp.mjs
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe' tests/browser/play-walkthrough-cdp.mjs
```

테스트는 실제 결과를 기록한다. 실패하거나 실행하지 못한 테스트가 있으면 이유와 결과를 PR 설명에 적고, 전체 검증이 끝난 것처럼 보고하지 않는다. UI 변경은 해당 브라우저 경로도 실행하고 자동 dispatch 테스트와 실제 UI 입력 테스트를 구분한다.

## 6. 커밋 및 본인 브랜치 push

테스트와 diff 검토 후 작업 단위가 명확한 커밋 메시지를 작성한다.

```bash
git add <담당 변경 파일>
git diff --cached
git commit -m "feat: 조달 제안 검증 개선"
git push -u origin <본인 브랜치>
```

이미 upstream이 설정된 본인 브랜치의 후속 push는 `git push`를 사용한다. `--force`, `--force-with-lease`를 포함한 force push는 금지한다. 잘못된 이력이나 커밋을 복구해야 하면 직접 이력을 덮지 말고 팀원 1과 협의한다.

## 7. Pull Request 생성 및 통합

GitHub에서 새 PR을 만들고 다음을 설정한다.

- base: `develop` (팀 작업 PR)
- compare: 본인 브랜치
- 제목: 기능/수정 내용을 짧고 구체적으로 작성
- 설명: 배경, 변경 파일과 동작, 테스트 명령 및 통과/실패/미실행 결과, 남은 이슈
- 관련 이슈나 스크린샷이 있으면 링크/첨부

안정화 PR은 `base: main`, `compare: develop`으로 설정한다. 해당 PR은 팀원 1이 검토하고 병합한다.

모든 팀원은 자신의 브랜치에서 `develop`을 base로 PR을 생성한다. 팀원 1도 `team1` 작업을 PR로 제출한다. 팀원 1은 PR을 검토해 `develop`에 병합하고, `develop`에서 통합 테스트와 오류 확인을 진행한다. 발견한 문제는 담당 개발 브랜치에서 수정해 `develop` 대상으로 PR을 올린다. 안정화가 끝나면 팀원 1이 `develop`을 compare, `main`을 base로 별도 PR을 생성하고 검토 후 병합한다. 담당 파일 경계, 공통 API·GameState 호환성, 기획/TEMP 정책, 테스트 및 제출 영향을 검토하며 검사 실패 시 수정 후 다시 요청한다.

PR이 열려 있는 동안 본인 브랜치에 추가 수정 후 커밋·push하면 PR에 반영된다. 다른 팀원 브랜치, `develop`, `main`에 직접 변경하지 않는다.

## 8. 충돌 대응 및 최신 develop 반영

작업 중 최신 `develop`을 반영해야 하면 본인 브랜치에서 진행한다.

```bash
git fetch origin
git switch <본인 브랜치>
git merge origin/develop
```

충돌이 발생하면:

1. 충돌 파일과 변경 목적을 확인하고, 무관한 변경을 임의로 버리거나 덮어쓰지 않는다.
2. 담당 파일 내부의 단순 충돌은 관련 diff와 기획/API 계약을 비교해 해결한다.
3. 공통 파일 또는 다른 팀원 소유 파일이 충돌하면 해당 소유자와 팀원 1에게 먼저 알리고 합의 후 해결한다.
4. 해결 후 `git status`, diff, 관련 테스트를 확인하고 본인 브랜치에 일반 커밋으로 기록한다.
5. 해결이 불확실하거나 테스트가 실패하면 중단해 재현 내용과 함께 팀원 1에게 보고한다. force push나 타 브랜치 삭제로 해결하지 않는다.

이미 로컬 개발 브랜치가 있으면 최신 `develop`을 받아 개발 브랜치에 반영한다:

```bash
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch <본인 브랜치>
git merge origin/develop
```

새 작업은 본인의 고정 개발 브랜치(`team1`, `team2`, `team3`)에서 시작한다. `develop` 변경은 본인 브랜치에서 통합하고, `main`은 안정화 PR 외에는 기준 브랜치로 사용하지 않는다. 브랜치 정리는 팀원 1과 확인하고, 다른 팀원의 브랜치는 삭제하지 않는다.

## 9. 팀원별 Claude Code 시작 프롬프트

각 프롬프트의 `https://github.com/TeamIroum/tycoon.git`을 팀원 1/저장소 관리자가 확인해 준 실제 주소로 바꾸고, `<작업 내용>`을 구체적으로 입력한다. 프롬프트는 인증·클론·최신 develop 확인·개인 브랜치 준비와 문서/코드 분석 및 계획 보고까지만 진행하게 한다. 코드 수정을 포함한 개발은 사용자가 계획을 승인한 뒤 시작한다.

### 황상진 (팀원 1) — 공통 구조 및 통합

```text
저는 황상진(팀원 1)입니다. 저장소 주소는 https://github.com/TeamIroum/tycoon.git, 제 개발 브랜치는 team1입니다. 먼저 GitHub 인증 상태와 저장소 접근 권한을 확인하세요. 인증/접근 실패, 주소 미확정, 권한 부족이면 우회하지 말고 중단해 원인을 보고하세요. 접근할 수 있으면 C:\tycoon 바깥의 작업 상위 폴더에서 저장소를 tycoon 폴더로 clone하고, origin/develop과 origin/main을 fetch해 최신 develop을 확인하세요. origin/develop에서 team1 브랜치를 만들거나 기존 team1으로 전환하세요. CLAUDE.md, README.md, docs/게임기획서.md, docs/기능정의서.md, docs/API명세서.md, docs/파트분배.md, docs/Claude_Code_팀원_개발가이드.md와 docs/GitHub_팀원_협업가이드.md를 확인하세요. 요청 작업(<작업 내용>)의 담당 범위와 공통 API·GameState 영향을 분석하되 아직 코드나 문서를 수정하지 말고, 계획·충돌 위험·테스트 계획을 보고한 뒤 사용자 승인을 기다리세요. 승인 전 개발을 시작하지 마세요. 승인 후 team1에서 개발·테스트·커밋·푸시하고 develop 대상 PR을 생성하세요. main과 develop에 직접 커밋하거나 push하지 마세요. 팀원 PR을 develop에 통합하고 통합 테스트를 관리하며, 안정화 시 develop에서 main 대상 PR을 생성·병합합니다.
```

### 이현우(팀원 2) — 에셋 및 월드 표현

```text
저는 이현우(팀원 2)이며 개발 브랜치는 team2입니다. 저장소는 https://github.com/TeamIroum/tycoon.git 입니다. 인증과 접근 권한을 확인하고, 실패하면 우회하지 말고 중단해 보고하세요. 저장소를 clone하고 최신 develop을 확인한 뒤 origin/develop에서 team2를 만들거나 기존 team2로 전환하세요. CLAUDE.md, README.md, docs/게임기획서.md, docs/기능정의서.md, docs/API명세서.md, docs/파트분배.md, docs/Claude_Code_팀원_개발가이드.md, docs/GitHub_팀원_협업가이드를 읽으세요. 담당은 src/config/assets.js 전체, src/ui/art.js, src/scenes/VillageScene.js, src/scenes/HallScene.js 및 src/assets/**입니다. 에셋 등록·경로·리소스 설정과 월드 표현을 맡으며 별도 팀원 1 승인은 필요하지 않습니다. 공통 API 계약 변경이 필요하면 팀원 1과 협의하세요. 작업 요청을 분석해 수정 계획을 보고하고 사용자 승인 후 담당 범위에서 구현·검증해 team2에 커밋·push하고 develop 대상 PR을 작성하세요. 팀원 1 소유의 게임 규칙·상태 파일은 임의 수정하지 마세요.
```
### 이소미(팀원 3) — UI·마스코트·엔딩

```text
저는 이소미(팀원 3)입니다. 저장소 주소는 https://github.com/TeamIroum/tycoon.git, 제 브랜치는 team3입니다. 먼저 GitHub 인증 상태와 저장소 접근 권한을 확인하세요. 인증/접근 실패, 주소 미확정, 권한 부족이면 우회하지 말고 중단해 원인을 보고하세요. 접근할 수 있으면 C:\tycoon 바깥의 작업 상위 폴더에서 저장소를 tycoon 폴더로 clone하고, origin/develop과 origin/main을 fetch한 뒤 최신 develop을 확인하세요. origin/develop에서 team3 브랜치를 만들거나 기존 team3으로 전환하세요. 그 후 CLAUDE.md, README.md, docs/게임기획서.md, docs/기능정의서.md, docs/API명세서.md, docs/파트분배.md, docs/Claude_Code_팀원_개발가이드.md와 docs/GitHub_팀원_협업가이드를 읽으세요. OfficeScene.js 전체는 팀원 3 단독 소유로 관청 화면, 사용자 입력, 화면 내 동작 및 파일 내 관련 상태 변경 코드를 담당합니다. UIScene/EndingScene과 widgets/viewData/MascotDialog/dialogs도 담당합니다. 공통 GameState는 기존 API 계약으로 연동하고 계약 자체 변경은 팀원 1과 협의하세요. 담당 코드와 요청 작업(<작업 내용>)의 수정 계획·협의 사항·테스트 계획을 보고하고 사용자 승인을 받은 뒤 작업하세요. 승인 후 본인 브랜치에서만 수정·테스트·커밋·푸시하고 develop 대상 PR을 생성합니다. src/ui/art.js, src/config/assets.js 및 Village/Hall 장면은 팀원 2 소유입니다.
```

## 10. 문서 간 협업 규칙

모든 팀원은 고정 개발 브랜치 `team1`, `team2`, `team3`에서 작업하고 `develop` 대상 PR을 생성한다. 안정화 PR은 `develop`에서 `main`을 대상으로 만든다. `docs/파트분배.md`에도 동일한 브랜치와 권한 정책을 반영했다. `main`과 `develop` 직접 변경은 금지하고 PR 검토·병합은 팀원 1이 맡는다. 권한이나 정책이 실제로 충돌하면 임의로 진행하지 말고 팀원 1/프로젝트 소유자에게 확인한다.
