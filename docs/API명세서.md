# API 명세서

> 이 문서의 역할: **팀원 코드끼리 무엇을 주고받는가.** GameState 메서드, 공통 데이터 구조, System 반환 형식, 이벤트 및 화면 명령을 정의한다.
>
> - 현재 코드는 튜토리얼 전체 흐름이 동작하는 상태다. 6장의 시스템과 명령은 현재 구현을 기준으로 작성한다.
> - 기능이 어떻게 동작해야 하는지는 `기능정의서.md`, 기획 의도와 기준은 `게임기획서.md`를 참고한다.
> - 모든 공통 기능은 전역 객체 `TYCOON.core`, 설정은 `TYCOON.config`에 등록한다.
> - 담당: 팀원 1. 관련 기능 담당자가 변경을 제안하고 팀원 1이 공통 명세에 반영한다.
> - 실제 코드와 문서가 다르면 코드를 확인한 뒤 명세를 갱신한다. 미확정 항목은 7장에서 관리한다.
> - 구현된 기능과 구현 예정 기능을 구분한다. 특히 GameState의 직렬화·복원과 브라우저 저장소를 이용한 자동 저장은 별개의 기능이다.

**코드 위치:** `src/core/`  
`GameState.js`, `schema.js`, `results.js`, `events.js`, `EventBus.js`, `sceneUtils.js`, `BrowserSave.js`  
화면 연결: `src/main.js`(`TYCOON.app`), `src/systems/TutorialFlow.js`(`dispatch`, `view`), `src/ui/viewData.js`(`watchView`)

---

## 1. Scene에서 GameState 사용하기

모든 Scene은 동일한 GameState 객체를 사용한다. BootScene에서 한 번 생성하여 `game.registry`에 저장한다.

```js
const { getGameState, listenTo, goTo } = TYCOON.core;
const { EVENTS, RESULT_EVENTS } = TYCOON.core;
const { SCENE_KEYS } = TYCOON.config;

create() {
  const state = getGameState(this);

  listenTo(this, EVENTS.BUDGET_CHANGED, () => this.draw());
  listenTo(this, RESULT_EVENTS.CONTRACT_CREATED, (r) => {
    this.showContract(r.contractId);
  });

  goTo(this, SCENE_KEYS.VILLAGE);
}
```

- `getGameState(scene)`: 현재 Scene에서 공통 GameState를 가져온다(`game.registry`의 `GAME_STATE_KEY`).
- `listenTo(scene, event, callback)`: 이벤트를 구독한다. Scene 종료(`shutdown`) 시 구독이 자동 해제된다.
- `goTo(scene, sceneKey)`: 화면을 전환한다.
- 실패한 명령 중 발생한 이벤트는 전달되지 않는다(2장 "상태 변경 이벤트" 참고). 실패 안내는 `dispatch()` 반환값의 `reason`·`error`로 처리한다(6-3).

### 화면과 상태 연결

현재 화면은 다음 방식으로 상태를 읽고 변경한다. `TYCOON.app`은 `src/main.js`에서 만든다.

- 읽기: `TYCOON.app.store.getState()` — `flow.view()`의 결과(6-4)
- 변경: `TYCOON.app.store.dispatch(type, payload)` — 반환 형식은 6-3
- 명령 결과 알림: `TYCOON.app.store.subscribe((view, events) => ...)` — 구독 해제 함수를 반환한다. Scene에서는 `shutdown` 때 직접 해제한다(`UIScene` 참고).
- 값 변화에 따른 다시 그리기: `TYCOON.ui.watchView(scene, pick, redraw)`

| 수단 | 호출 시점 | 전달값 | 용도 |
|---|---|---|---|
| `store.subscribe(fn)` | 성공한 `dispatch()` 뒤, `newGame()` 뒤, 롤백 실패(fatal) 직후 각 1회 | `fn(view, events)`. `events`는 화면 알림 배열(6-3), fatal 때는 `[]` | 안내 대화, 팝업 전환 |
| `watchView(scene, pick, redraw)` | 등록 즉시 1회, 이후 `EVENTS.STATE_CHANGED`마다 `pick(view)`의 JSON이 바뀐 경우만 | `redraw(view)` | 월드·시설 표현 갱신 |

- `watchView`는 `listenTo(scene, EVENTS.STATE_CHANGED, ...)`로 등록되므로 Scene 종료 시 자동 해제된다. 매번 `TYCOON.app.flow.view()`를 새로 계산한다.
- `watchView`는 GameState 변경에만 반응한다. meta(`hintsOn`, `seenDialogs`)와 `fatal`은 GameState가 아니므로 `STATE_CHANGED`를 발생시키지 않는다. 이 값들은 `store.subscribe`로 받는다.
- `dispatch()` 중 GameState 이벤트는 모아 두었다가 성공 시 한꺼번에 발생한다. 따라서 `watchView`의 `redraw`가 먼저 실행되고 그 뒤 `store.subscribe` 콜백이 실행된다. 이 시점에 `getState()`는 이미 명령 완료 후 값이다.
- `newGame()`은 트랜잭션 없이 실행되어 `STATE_CHANGED`가 단계마다 즉시 발생한다. 중간 상태로 `pick`이 바뀌면 `redraw`가 여러 번 호출될 수 있다.

**`TYCOON.app`의 다른 공개 값**

| 이름 | 의미 | 사용처 |
|---|---|---|
| `flow` | `TutorialFlow` 인스턴스. 화면은 아래 직접 호출 함수와 `view()`만 사용한다 | Title·UI Scene, `viewData` |
| `autoSave`, `saveStatus` | F-18 저장 상태(2장) | `UIScene` |
| `resumeOnLoad` | 시작 시 저장 복원 성공 여부(END 저장 포함). `PreloadScene`이 확인 후 `false`로 바꾸고, `view().phase !== 'END'`이면 관청 화면으로 바로 진입, END면 타이틀로 보낸다 | `PreloadScene` |
| `pendingEvents` | 다음 `UIScene.create()`에서 재생할 화면 알림 배열. 새 게임 시작 시 `['GAME_STARTED']` | Title·Preload·UI Scene |
| `debugTargets` | 자동 테스트용 버튼 좌표. 게임 규칙에 쓰지 않는다 | Scene, 브라우저 테스트 |
| `game` | Phaser.Game 인스턴스 | - |

**`flow` 직접 호출 (dispatch를 거치지 않는 함수)**

| 호출 | 반환 | 상태 변경 | 현재 사용처 |
|---|---|---|---|
| `TYCOON.app.flow.newGame()` | 없음 | 있음. fatal 초기화, GameState `reset()`, 1월차 `PLAN`, 튜토리얼 사업 등록, 강당 `BEFORE`, `seenDialogs` 초기화(`hintsOn` 유지) 후 구독자에 `['GAME_STARTED']` 전달. 이때 자동 저장 슬롯이 교체된다 | `TitleScene` 시작 버튼, `UIScene` fatal 화면 |
| `TYCOON.app.flow.planReady()` | `{ ready: boolean, reason: string }` (`ProgressSystem.canAdvance()`) | 없음 | `UIScene` 월 진행 버튼 |
| `TYCOON.app.flow.requestComplete()` | boolean. 주민·사용자 규격·재고 수량 확인을 모두 했는지 | 없음 | `UIScene` |
| `TYCOON.app.flow.compareSuppliers()` | `{ rows, winnerId }` (6-1) | 없음 | `TYCOON.ui.proposalRows()` |
| `TYCOON.app.flow.view()` | `store.getState()`와 같음 | 없음 | `watchView` |

`newGame()`은 트랜잭션·롤백·busy 검사를 거치지 않으며 `store`에는 노출되어 있지 않다. 조회 함수 3개는 GameState를 바꾸지 않는다.

Scene 작성 규칙:
- Scene에서 `state.on()`을 직접 사용하지 않는다. `listenTo()`를 사용한다.
- 진행 값을 Scene 내부에 별도로 복사해 보관하지 않는다. 필요한 시점에 getter로 읽는다.
- Scene과 UI는 GameState setter를 직접 호출하지 않는다. 상태 변경은 System을 통해 처리한다.
- setter가 공개되어 있으므로 직접 호출 여부는 코드 리뷰에서 확인한다.

---

## 2. GameState 메서드

코드 위치: `src/core/GameState.js`

getter는 상태의 복사본을 반환한다. setter는 `schema.js`를 통해 데이터 구조를 검사하며, 잘못된 데이터가 전달되면 예외를 발생시킨다.

| 메서드 | 설명 | 발생 이벤트 |
|---|---|---|
| `getBudget()` | 남은 예산(정수) 조회 | - |
| `spendBudget(amount)` | 양의 정수만 차감. 성공 `{ ok: true, budget }`, 실패 `{ ok: false, reason, budget }` | 성공 시 `BUDGET_CHANGED { budget, delta }` |
| `getCurrentDate()` / `setCurrentDate(date)` | 현재 날짜 조회 및 변경. `{ month, phase }` | `DATE_CHANGED` |
| `getCurrentProject()` / `setCurrentProject(project)` | 현재 사업 조회 및 변경. `status`가 없으면 `REQUESTED`로 설정. `null` 허용 | `PROJECT_CHANGED` |
| `getProjectStatus()` / `setProjectStatus(next)` | 사업 단계 조회 및 변경. 다음 단계로만 이동 | `PROJECT_STATUS_CHANGED { from, to }` |
| `getSuppliers()` / `setSuppliers(list)` | 업체 및 제안 목록 조회·변경 | `SUPPLIERS_CHANGED` |
| `getContract()` / `setContract(contract)` | 계약 정보 조회·변경. `null` 허용 | `CONTRACT_CHANGED` |
| `getDelivery()` / `setDelivery(delivery)` | 납품 정보 조회·변경. `null` 허용 | `DELIVERY_CHANGED` |
| `getFacilities()` / `getFacilityState(id)` / `setFacilityState(id, state)` | 시설 전체 또는 개별 상태 조회·변경 | `FACILITY_CHANGED { facilityId, state }` |
| `getEvaluation()` / `setEvaluation(evaluation)` | 평가 정보 조회·변경. `null` 허용 | `EVALUATION_CHANGED` |
| `getStaff()` / `setStaff(staff)` | 관청 인원 조회·변경 | `STAFF_CHANGED` |
| `getCandidates()` / `setCandidates(list or null)` | 공개된 후보 조회·변경. 후보가 없으면 `null` | `CANDIDATES_CHANGED` |
| `notify(event, payload)` | 등록된 `RESULT_EVENTS`만 전달 가능 | 지정한 결과 이벤트 |
| `getSnapshot()` | 전체 상태의 복사본 반환 | - |
| `beginTransaction()` / `finishTransaction(commit)` | `TutorialFlow.dispatch()` 전용. 시작 후 발생한 이벤트를 모아 두고, `commit`이 true면 순서대로 발생, false면 버린다. 중첩 시작은 예외 | 보류된 이벤트 |
| `reset()` | 초기 상태 복원. 이벤트 구독은 유지 | `STATE_RESET`, `STATE_CHANGED { key: '*' }` |
| `toJSON()` | 버전 정보와 전체 상태를 포함한 저장 데이터 반환 | - |
| `load(saved)` | 저장 데이터 검증 및 복원 | 성공 시 `STATE_RESET`, `STATE_CHANGED { key: '*' }` |
| `on(event, handler)` | 이벤트 구독. 구독 해제 함수 반환 | - |
| `listenerCount(event)` | 해당 이벤트의 리스너 수 반환 | - |

### 예산 차감 결과

`spendBudget(amount)`은 다음 결과를 반환한다.

| 상황 | 반환값 | 상태 변경 |
|---|---|---|
| 정상 차감 | `{ ok: true, budget }` | 예산 차감 및 이벤트 발생 |
| 양의 정수가 아닌 금액 | `{ ok: false, reason: 'INVALID_AMOUNT', budget }` | 없음 |
| 예산 부족 | `{ ok: false, reason: 'INSUFFICIENT_BUDGET', budget }` | 없음 |

예산 차감은 GameState가 담당하지만, 중복 계약 방지 등 업무 규칙은 호출하는 System이 담당한다.

### 사업 단계 변경

`setProjectStatus(next)`는 `PROJECT_TRANSITIONS`에 정의된 다음 단계로만 이동할 수 있다.

- 현재 사업이 없으면 실패한다.
- 단계를 건너뛰거나 되돌릴 수 없다.
- 이미 처리한 단계를 다시 진행할 수 없다.
- 실패 시 `{ ok: false, reason: 'INVALID_STATE' }`를 반환한다.
- 성공 시 `{ ok: true, status }`를 반환한다.

### 저장 데이터와 브라우저 저장

GameState의 저장 관련 메서드는 데이터 직렬화와 복원을 담당한다.

| 기능 | 담당 | 상태 |
|---|---|---|
| `getSnapshot()` | GameState | 구현 |
| `toJSON()` | GameState | 구현 |
| `load(saved)` | GameState | 구현 |
| 브라우저 저장소에 기록 | `BrowserSave.save()` | 구현, 단일 자동 저장 슬롯 |
| 브라우저 저장소에서 읽기 | `BrowserSave.restore()` | 구현, 성공 시 새로고침 후 자동 재개 |
| 성공 명령 후 자동 저장 | `BrowserSave.attach()` | 구현, 실패·롤백·fatal은 저장하지 않음 |

`toJSON()`은 저장할 데이터를 반환할 뿐, 브라우저 저장소에 직접 기록하지 않는다. `load()` 역시 전달받은 저장 데이터를 복원하는 기능이다. `BrowserSave`는 버전이 있는 단일 localStorage 슬롯에 GameState JSON과 TutorialFlow meta(힌트 설정·대화 이력)를 함께 기록하고, 시작 시 검증 후 복원한다.

**저장 시점과 복원 정책 (F-18 확정)**

- `attach(flow, onStatus)`는 `TutorialFlow.subscribe()`로 등록된다. `TutorialFlow`는 성공한 명령과 `newGame()` 뒤에만 구독자를 호출하므로, 실패·롤백된 명령은 저장되지 않는다.
- `GAME_STARTED`(새 게임)이면 `reset()`으로 기존 슬롯을 지우고 새 게임 상태를 기록한다. 그 밖의 성공 명령(`SET_HINTS`, `MARK_DIALOG_SEEN` 포함)은 `save()`로 현재 상태를 덮어쓴다.
- 저장은 성공한 공개 명령 하나당 1회다. `CONFIRM_INSPECTION`처럼 한 명령 안에서 검사·평가·시설 개선이 함께 실행되어도 명령이 끝난 뒤 1회만 저장하며 중간 상태는 기록하지 않는다. 실패한 명령은 저장하지 않는다(0회).
- 복원 검증은 `seenDialogs`에 문자열이 아닌 값이 있으면 기록 전체를 손상으로 폐기한다. 이를 막기 위해 `MARK_DIALOG_SEEN`은 비어 있지 않은 문자열 `id`만 받는다(6-3 명령 표).
- `flow.fatal`이 있으면 기록하지 않고 상태를 `FATAL`로 둔다.
- 시작 시 `restore(flow)`는 저장된 상태를 `GameState.load()`로 불러오고 meta를 교체할 뿐 명령을 다시 실행하지 않는다. 따라서 마지막 성공 명령 이후의 상태(월중 포함)로 복원되며, 계약 예산·평가·채용 결과가 중복 적용되지 않는다. 같은 기록을 여러 번 복원해도 결과가 같다.
- 손상(`CORRUPTED`)·버전 불일치(`VERSION_MISMATCH`) 기록은 폐기하고 초기 상태로 시작한다. 바깥 기록의 `version`이 1이 아니거나 없을 때, 안쪽 GameState의 `version`이 맞지 않을 때 모두 `VERSION_MISMATCH`이며 마이그레이션은 없다.
- 빈 문자열 기록은 저장 없음과 같이 `EMPTY`로 처리하고 즉시 삭제하지 않는다. 다음 새 게임 저장이 덮어쓴다.
- 제한: 복원 검증은 필드별 형식만 확인한다. 형식은 유효하지만 단계 간 정합성이 맞지 않는 기록(예: 진행 단계와 사업 상태 불일치, 계약이 있는데 예산이 차감 전 값)은 걸러지지 않고 그대로 복원된다. 정상 플레이로는 만들어지지 않고 저장 데이터를 직접 고친 경우에만 생긴다.

**저장 상태 (`TYCOON.app.saveStatus`)**

- `TYCOON.app.autoSave`는 `BrowserSave` 인스턴스이며, `autoSave.lastResult`는 마지막 `restore`/`save`/`reset` 결과다.
- `TYCOON.app.saveStatus`는 시작 시 `restore()` 결과로 설정되고, 이후 `attach()`의 `onStatus` 콜백으로 매 저장 시도 뒤 `lastResult`와 같은 값으로 갱신된다.
- 형식: 성공 `{ ok: true }`, 실패 `{ ok: false, reason, error?, cleared? }`.

| reason | 발생 시점 | 의미 |
|---|---|---|
| `EMPTY` | 복원 | 저장 기록 없음(실패가 아님) |
| `CORRUPTED`, `VERSION_MISMATCH` | 복원 | 기록을 폐기함. `cleared`는 삭제 성공 여부 |
| `STORAGE_UNAVAILABLE` | 복원·저장 | `localStorage`에 접근할 수 없음 |
| `READ_FAILED` | 복원 | 읽기 예외 |
| `WRITE_FAILED` | 저장 | 쓰기 예외(용량 초과 등). 게임은 계속되고 다음 성공 명령에서 다시 저장을 시도함 |
| `CLEAR_FAILED` | 삭제 | `remove()`의 삭제 예외. `reset()`·폐기 처리에서는 이어지는 저장 결과 또는 `cleared: false`로 대체되어 보통 `saveStatus`에 남지 않음 |
| `FATAL` | 저장 | fatal 상태라 기록하지 않음 |

UI는 `saveStatus`를 읽어 표시만 하며 `localStorage`를 직접 다루지 않는다.

`load()`는 사업·업체·계약(필수 `specs` 포함)·납품·평가(`passed` 필수 boolean)·시설·직원·후보를 검증한다. 잘못된 저장은 `CORRUPTED`를 반환하며 기존 상태와 이벤트를 변경하지 않는다. 채용된 후보 ID는 후보 목록이 비어 있지 않아 참조 근거가 있을 때 검사한다. `null`/빈 후보 목록은 유효하다. `staff.hired`의 중복 ID와 알려진 후보 집합에 없는 ID는 거부한다.

### 후보 데이터의 저장 및 복원

첫 버전에서는 후보 목록을 한 번 생성한 뒤 유지한다.

- 후보 목록은 `GameState.candidates`에 보관한다.
- `toJSON()`으로 생성한 저장 데이터에 후보 목록을 포함한다.
- `load(saved)`로 복원한 뒤에는 저장된 후보 목록을 사용한다.
- 불러오기 과정에서 후보를 임의로 다시 생성하지 않는다.
- 후보가 아직 생성되지 않았다면 `null` 상태를 유지하고, 모집 단계에서 `ensureCandidates()`가 생성 여부를 확인한다.

GameState 직렬화 왕복 테스트는 후보 생성 및 채용 상태를 포함한다. 브라우저 CDP 테스트는 계약 후, 2월차 일부 납품 대응 중, 평가 후 새로고침 복원, 채용 후(END)·엔딩 장면 중 새로고침 시 타이틀 표시와 END 저장 유지, END 이후 새 게임의 저장 교체와 그 뒤 새로고침 복원, 손상 데이터 폐기, 저장소 쓰기 실패 시 게임 지속을 검증한다.

### 상태 변경 이벤트

상태가 변경되면 해당 이벤트를 먼저 발생시킨 후 공통 이벤트 `STATE_CHANGED { key }`를 발생시킨다.

단, 실패한 예산 차감이나 사업 단계 변경은 상태를 바꾸지 않으므로 이벤트도 발생하지 않는다.

`dispatch()` 실행 중에는 상태 변경 이벤트와 결과 이벤트가 모두 보류된다. 명령이 성공하면 발생 순서대로 전달되고, 실패하면 버려진 뒤 명령 직전 상태로 복원된다. 복원 자체(`load`)의 `STATE_RESET`도 보류 중에 일어나므로 함께 버려진다. 따라서 실패한 명령에서는 어떤 GameState 이벤트도 구독자에게 전달되지 않는다. `newGame()`과 시작 시 `restore()`는 트랜잭션 밖에서 실행되어 이벤트가 즉시 발생한다.

---

## 3. 공통 데이터 구조

코드 위치: `src/core/schema.js`

필수 필드와 자료형은 실제 검증 코드에 맞춘다. 필수 필드 외의 추가 필드는 기능 담당자가 필요에 따라 확장할 수 있다.

예시 데이터: `tests/fixtures/sampleData.mjs`

**점수 공식, 비교 가중치, 등급 경계, 품질 척도 및 능력치 범위는 이 문서에서 임의로 결정하지 않는다.**

| 객체 | 필수 필드 | 담당 |
|---|---|---|
| Project | `id, title, requester, facilityId, budgetLimit, items[{itemId, quantity}], requiredSpecs[]` | 팀원 1 |
| Supplier | `id, name, specs[], price, quality, deliveryDays` | 팀원 1 |
| Contract | `id, projectId, supplierId, items[{itemId, quantity}], specs[], amount` | 팀원 1 |
| Delivery | `contractId, status, delivered[{itemId, quantity}], issues[{type, itemId, expected, actual, resolved}]` | 팀원 1 |
| Evaluation | `projectId, grade(S~D), reason, passed(boolean)` | 팀원 1 |
| FacilityState | `stage` (`BEFORE`, `IN_PROGRESS`, `IMPROVED`) | 팀원 1 |
| GameDate | `month` (1 이상), `phase` (`PLAN`, `RUN`, `REPORT`) | 팀원 1 |
| Candidate | `id, name, level(입문·실무·숙련), abilities{review, tech, coordinate, manage}, specialty, trait` | 팀원 1 |
| Staff | `headcount, seats, hired[]` | 팀원 1 |

※ 실제 필수 여부와 자료형 검증은 `schema.js`를 기준으로 한다. 미확정인 품질 및 능력치 범위를 임의로 제한하지 않는다.

### 3-1. 재고 및 사용 가능 수량

첫 버전에서는 요청 수량과 사용 가능한 재고를 비교해 부족 수량을 계산한다.

- 전체 재고: 보유 중인 전체 수량
- 사용 불가 재고: 젖거나 손상되어 사용할 수 없는 수량
- 사용 가능 재고: 전체 재고에서 사용 불가 재고를 제외한 수량
- 부족 수량: 요청 수량에서 사용 가능 재고를 제외한 수량. 부족 수량은 0보다 작아지지 않는다.

계산 기준:

```js
availableQuantity = totalQuantity - unusableQuantity;
shortageQuantity = Math.max(0, requiredQuantity - availableQuantity);
```

매트 재고의 경우 전체 재고는 8개이며, 젖은 매트 수량은 기획 및 밸런스 확정 후 반영한다.

※ 위 계산은 업무 규칙이다. 실제 재고 데이터의 필드명과 저장 위치는 `schema.js` 및 `ProcurementSystem` 구현을 확인해 확정한다. 기존 데이터 구조에 없는 필드를 임의로 추가하지 않는다.

### 3-2. 사업 단계

```text
REQUESTED
    ↓
REVIEWING
    ↓
CONTRACTED
    ↓
DELIVERING
    ↓
INSPECTING
    ↓
EVALUATED
    ↓
COMPLETED
```

| 전환 | 담당 | 처리 시점 |
|---|---|---|
| `REQUESTED → REVIEWING` | 팀원 1 | 플레이어가 요구사항 검토를 시작할 때 |
| `REVIEWING → CONTRACTED` | 팀원 1 | `createContract()`에서 예산 차감 및 계약 저장과 함께 |
| `CONTRACTED → DELIVERING` | 팀원 1 | 시간 진행으로 납품이 시작될 때 |
| `DELIVERING → INSPECTING` | 팀원 1 | 납품이 도착했을 때 |
| `INSPECTING → EVALUATED` | 팀원 1 | `calculateGrade()` 실행 후 |
| `EVALUATED → COMPLETED` | 팀원 1 | `improveFacility()` 실행 후 |

실제 단계 변경은 System에서 처리한다. Scene과 UI에서 `setProjectStatus()`를 직접 호출하지 않는다.

---

## 4. System 함수의 반환 형식

코드 위치: `src/core/results.js`

System 함수는 일반적인 업무 실패를 예외 대신 결과 객체로 반환한다.

```js
const { ok, fail, REASON } = TYCOON.core;

return ok({ contractId: 'C01' });
// { ok: true, contractId: 'C01' }

return fail(REASON.NOT_ELIGIBLE, { specs });
// { ok: false, reason: 'NOT_ELIGIBLE', detail: { ... } }
```

### 반환 형식 구분

| 함수 유형 | 반환 형식 |
|---|---|
| 업무 처리 | `{ ok: true, ... }` 또는 `{ ok: false, reason, ... }` |
| 조회 및 비교 | 업무에 필요한 데이터 객체 |
| 조건 검사 | 조건 검사 결과 객체 |

모든 System 함수가 동일한 `{ ok, reason }` 구조를 사용하는 것은 아니다. 구체적인 반환 필드는 6장의 함수별 명세와 실제 구현을 기준으로 한다.

### REASON 목록

| REASON | 의미 |
|---|---|
| `INVALID_AMOUNT` | 금액이 양의 정수가 아님 |
| `INSUFFICIENT_BUDGET` | 예산 부족 |
| `NOT_FOUND` | 존재하지 않는 ID |
| `NOT_ELIGIBLE` | 필수 요구조건을 충족하지 못한 업체 |
| `ALREADY_DONE` | 이미 처리된 작업 |
| `INVALID_STATE` | 현재 단계에서 수행할 수 없는 작업 |
| `INSPECTION_FAILED` | 정식 검사 실패. `TutorialFlow`의 `CONFIRM_INSPECTION`만 사용한다(System은 `NOT_ELIGIBLE`을 반환하고 `TutorialFlow`가 이 값으로 바꾼다) |

### `FLOW_REASON` 목록 (`dispatch()` 전용)

System 밖에서 생기는 `dispatch()` 실패 이유다. `TYCOON.core.FLOW_REASON`에 정의하며 `REASON`·저장 reason과 이름이 겹치지 않는다.

| FLOW_REASON | 의미 |
|---|---|
| `ROLLBACK_FAILED` | 롤백 실패 또는 fatal 상태 중 명령. `code`와 같은 값 |
| `COMMAND_BUSY` | 이전 명령을 처리하는 중에 다시 호출됨 |
| `UNKNOWN_COMMAND` | 등록되지 않은 명령 |
| `COMMAND_FAILED` | 처리 중 예외(코드 오류) 또는 `reason` 없이 실패한 결과 |

`dispatch()` 실패 반환의 `reason`은 System 결과의 `REASON` 값을 그대로 쓰거나(`INSPECTION_FAILED`는 `TutorialFlow`가 지정) 위 `FLOW_REASON` 값을 쓴다. `error`에는 `TutorialFlow`의 `REASON_TEXT` 등으로 만든 기본 안내 문구가 함께 들어간다(6-3). 저장 결과의 reason(`EMPTY`, `CORRUPTED` 등)은 `REASON`과 별개다(2장).

---

## 5. 이벤트

이벤트는 상태 변경 이벤트와 결과 이벤트로 구분한다.

### 5-1. 상태 변경 이벤트 (`EVENTS`)

코드 위치: `src/core/events.js`

| 이벤트 | 발생 조건 | payload |
|---|---|---|
| `BUDGET_CHANGED` | 예산 변경 | `{ budget, delta }` |
| `DATE_CHANGED` | 현재 날짜 변경 | 변경된 날짜 객체 `{ month, phase }` |
| `PROJECT_CHANGED` | 현재 사업 변경 | 변경된 사업 객체 또는 `null` |
| `PROJECT_STATUS_CHANGED` | 사업 단계 변경 | `{ from, to }` |
| `SUPPLIERS_CHANGED` | 업체 목록 변경 | 변경된 업체 배열 |
| `CONTRACT_CHANGED` | 계약 정보 변경 | 변경된 계약 객체 또는 `null` |
| `DELIVERY_CHANGED` | 납품 정보 변경 | 변경된 납품 객체 또는 `null` |
| `FACILITY_CHANGED` | 시설 상태 변경 | `{ facilityId, state }` |
| `EVALUATION_CHANGED` | 평가 변경 | 변경된 평가 객체 또는 `null` |
| `STAFF_CHANGED` | 관청 인원 변경 | 변경된 인원 객체 |
| `CANDIDATES_CHANGED` | 후보 목록 변경 | 후보 배열 또는 `null` |
| `STATE_CHANGED` | 상태 변경 후 공통 알림 | `{ key }` |
| `STATE_RESET` | 상태 초기화 또는 저장 데이터 복원 | 전체 상태 스냅샷 |

`STATE_CHANGED`의 `key`는 변경된 상태의 이름이다. 전체 초기화 또는 복원 시에는 `'*'`를 전달한다.

### 5-2. 결과 이벤트 (`RESULT_EVENTS`)

상태 변경 이벤트는 값이 바뀌었다는 사실만 전달한다.

안내 대사, 효과음, 튜토리얼 진행처럼 업무에서 발생한 사건을 전달할 때는 결과 이벤트를 사용한다.

System에서 `gameState.notify()`를 호출하여 발생시킨다.

| 이벤트 | 발생 주체 | payload | 실제 전달 |
|---|---|---|---|
| `CONTRACT_CREATED` | 팀원 1 | `{ contractId, supplierId, amount }` | `SIGN_CONTRACT` 성공 |
| `CONTRACT_REJECTED` | 팀원 1 | `{ supplierId, reason }` | **`dispatch()` 경로에서는 발생하지 않음.** `ProcurementSystem.createContract()`를 직접 호출해 예산 초과 업체를 지정할 때만 발생 |
| `TIME_ADVANCED` | 팀원 1 | `{ date }` (`{ month, phase: 'RUN', pending }`) | `ADVANCE_MONTH` 성공 |
| `DELIVERY_ARRIVED` | 팀원 1 | `{ contractId }` | 2월차 `ADVANCE_MONTH` |
| `DELIVERY_ISSUE_FOUND` | 팀원 1 | `{ issue }` | 2월차 `ADVANCE_MONTH` |
| `DELIVERY_ISSUE_RESOLVED` | 팀원 1 | `{ issue }` | 두 번째 대응 명령에서 미해결 문제마다 |
| `INSPECTION_COMPLETED` | 팀원 1 | `{ passed, findings }` | **`passed: true`만 전달.** 검사 실패 시 명령이 롤백되어 버려진다 |
| `GRADE_CALCULATED` | 팀원 1 | `{ grade, reason }` | `CONFIRM_INSPECTION` 성공(D 포함) |
| `FACILITY_IMPROVED` | 팀원 1 | `{ facilityId, stage }` | 통과 등급의 `CONFIRM_INSPECTION` |
| `HEADCOUNT_APPROVED` | 팀원 1 | `{ headcount }` | 2월차 통과 후 `CLOSE_REPORT` |
| `CANDIDATE_HIRED` | 팀원 1 | `{ candidateId }` | `HIRE` 성공 |
| `TUTORIAL_STEP` | 팀원 3 | `{ stepId }` | 이름만 정의. 현재 발생 위치 없음 |

결과 이벤트는 GameState 이벤트(`gameState.on`/`listenTo`)이며 6-3의 화면 알림과 다르다. 현재 화면 코드는 결과 이벤트를 구독하지 않고 화면 알림만 사용한다.

**실패 이벤트 정책: System 직접 호출과 `dispatch()` 경로의 차이**

| 구분 | System 직접 호출 (테스트·내부) | `TutorialFlow.dispatch()` (화면) |
|---|---|---|
| 이벤트 발생 시점 | `notify()`·setter 호출 즉시 | 명령 성공 후 한꺼번에(커밋) |
| 실패 시 상태 | System이 변경 전 검사로 상태를 바꾸지 않음. 검사 단계 등 부분 변경은 남을 수 있음 | 명령 직전 snapshot으로 전체 복원 |
| 실패 시 결과 이벤트 | 발생함(`CONTRACT_REJECTED`, `INSPECTION_COMPLETED { passed: false }`) | 전달되지 않음(롤백과 함께 폐기) |
| `CONTRACT_REJECTED` | 예산 초과 업체를 직접 지정하면 발생 | 1순위 업체만 계약하므로 발생 지점에 도달하지 않음 |
| 미통과 `INSPECTION_COMPLETED` | 발생 | 폐기. 실패는 `reason: 'INSPECTION_FAILED'`로 반환 |
| 실패 정보 전달 | 반환값 `{ ok: false, reason, detail? }` | 반환값 `{ ok: false, error, reason }` |

- 실패한 명령은 롤백되며 결과 이벤트를 외부로 전달하지 않는다. 롤백 이후에 실패 이벤트를 따로 발생시키지 않는다.
- 화면은 실패를 결과 이벤트가 아니라 `dispatch()` 반환값으로 처리한다. 결과 이벤트는 성공한 명령에서만 받는다.
- 이 정책은 `tests/contract.test.mjs`의 "정책:" 테스트가 검증한다. `tests/flow.test.mjs`의 `CONTRACT_REJECTED` 테스트는 System 직접 호출 경로를 검증한다.

종합 평가는 S~D와 평가 이유 한 문장으로 표시한다. `passingGrades`는 S, A, B, C이며 D는 미통과다. D에서는 시설 개선과 동료 모집을 막는다. 상세 점수, 등급 경계와 D 도달 조건은 TEMP로 유지한다. 첫 튜토리얼의 정상 플레이에서 `GRADE_CALCULATED`의 `grade`는 S(매트 점검) 또는 C(점검 생략 후 보완)만 나온다. 화면은 A·B·D도 처리할 수 있어야 하며, D 경로는 상태 주입 테스트로 검증한다(기능정의서 F-12).

결과 이벤트는 `RESULT_EVENTS`에 등록된 이름만 `notify()`로 전달할 수 있다.

이벤트 payload를 변경할 때는 발신자와 구독자를 함께 수정한다.

---

## 6. 시스템과 흐름 API

모든 시스템은 생성할 때 GameState를 전달받는다.

```js
new XSystem(gameState, ...);
```

System 함수의 반환 형식은 역할에 따라 다르다.

- 업무 처리 함수: `{ ok: true, ... }` 또는 `{ ok: false, reason, ... }`
- 조회 및 비교 함수: 해당 기능에 필요한 데이터 객체
- 조건 검사 함수: 조건 검사 결과 객체

`TutorialFlow`가 시스템들을 생성하고 명령에 따라 호출한다. 각 명령 직전 GameState·meta snapshot을 확보하고 하위 결과 `ok`를 확인한다. 실패하면 명령 중 발생한 이벤트를 버리고 해당 명령 직전 snapshot으로 복원한 뒤 원래 오류를 반환한다. 정식 검사 실패 전 상태가 `INSPECTING`이면 복원 후에도 `INSPECTING`을 유지한다. 실제 복원 실패는 `ROLLBACK_FAILED` fatal 상태로 기록하고 추가 명령을 차단한다. `newGame()`이 fatal 상태를 초기화한다. 화면은 시스템을 직접 호출하지 않는다.

정식 검사 수량 조건은 품목별 `최종 실제 납품 수량 >= max(계약 수량, 실제 필요 수량)`이다. 계약 수량, 실제 필요 수량, TEMP 보완 수량 및 최종 실제 납품 수량은 별도로 유지한다. TEMP 보완은 실제 납품 수량과 별도 보완 비용만 증가시키며 계약 수량이나 검사 목표에 보완 수량을 다시 더하지 않는다.

### 6-1. 시스템 함수

| 파트분배 제안 | 실제 함수 및 파일 | 반환 또는 동작 | 담당 |
|---|---|---|---|
| `checkEligibility(supplier, project)` | `ProcurementSystem.checkEligibility(supplier, project)` | `{ eligible, reasons: string[] }`. `reasons`는 표시용 한글 사유 | 팀원 1 |
| `compareSuppliers(suppliers, project)` | `ProcurementSystem.compareSuppliers()` (인자 없음, GameState의 업체·사업 사용) | `{ rows, winnerId }`. `rows`는 업체 필드 + `eligible`, `reasons`, `score`, `scoreParts { price, quality, delivery }`. 부적격 업체는 `score`·`scoreParts`가 `null`. 적격 업체가 없으면 `winnerId: null` | 팀원 1 |
| `createContract(supplierId)` | `ProcurementSystem.createContract(supplierId)` | 1순위 업체만 계약 가능. 예산 1회 차감. 성공 `{ ok: true, contractId }` | 팀원 1 |
| `advanceTime()` | `ProgressSystem.start(pending)`, `endMonth()`, `nextMonth()`, `canAdvance()` | 시간 진행 및 월 마감. `canAdvance()`는 `{ ready, reason }` | 팀원 1 |
| `processDelivery()` | `DeliverySystem.start()`, `respond('supplier' 또는 'requester')` | 납품 시작 및 일부 납품 대응. `respond`는 `{ ok: true, resolved }` | 팀원 1 |
| `inspectDelivery()` | `DeliverySystem.inspect()` | 납품 검사. 통과 `{ ok: true, passed, findings, supplement }`, 미통과 `{ ok: false, reason: 'NOT_ELIGIBLE', detail: { findings, supplement } }`, 보완 비용 부족 `INSUFFICIENT_BUDGET` | 팀원 1 |
| `calculateGrade()` | `EvaluationSystem.calculateGrade()` | 사업 평가. `{ ok: true, grade, passed }` | 팀원 1 |
| `improveFacility(facilityId)` | `FacilitySystem.improveFacility(facilityId)` | 시설 개선 | 팀원 1 |
| - | `RecruitSystem.approveHeadcount()` | 선발 정원 승인 | 팀원 1 |
| - | `RecruitSystem.ensureCandidates()` | 후보 목록 생성 및 유지. `{ ok: true, created }` | 팀원 1 |
| - | `RecruitSystem.hire(candidateId)` | 후보 선발 | 팀원 1 |
| `renderProject()`, `advanceTutorial()` | `UIScene`, `MascotDialog` | 화면 표시 및 튜토리얼 진행 | 팀원 3 |

`src/scenes/OfficeScene.js` 전체는 팀원 3(이소미)의 단독 소유이며 관청 화면, 입력, 화면 내 동작 및 파일 내 관련 상태 처리 코드를 포함한다. 공통 GameState와 게임 규칙은 이 파일과 공동 소유하지 않으며 기존 Store/TutorialFlow API 계약으로 연동한다. 에셋 manifest `src/config/assets.js`와 `src/assets/**`는 팀원 2(이현우) 단독 소유다.

### 6-2. 요청 확인 관련 함수

팀원 1이 담당한다.

- `checkResidents()`
- `checkUserSpec()`
- `countInventory()`
- `inspectMattress()`
- `confirmShortage({ hintsOn })`
- `openProposals()`
- `knownShortage()`
- `trueShortage()`

구체적인 입력값과 반환값은 실제 구현 및 기능정의서를 기준으로 관리한다.

재고 확인과 부족 수량 계산은 다음 기준을 따른다.

- 전체 재고와 사용 불가 재고를 구분한다.
- 사용 가능 재고를 기준으로 부족 수량을 계산한다.
- 매트의 젖은 수량은 기획에서 확정한 값을 사용한다.
- 실제 데이터 구조와 필드명은 `schema.js` 및 `ProcurementSystem` 구현을 기준으로 한다.

### 6-3. 화면 명령 (`TYCOON.app.store.dispatch`)

화면은 직접 System을 호출하지 않고 `dispatch(type, payload)`에 명령을 전달한다. `payload`는 생략하면 `{}`다.

**반환 형식**

| 상황 | 반환값 | 상태·저장 |
|---|---|---|
| 성공 | `{ ok: true, events: string[] }` | 변경 확정, 구독자 호출, 자동 저장 |
| System 업무 실패 | `{ ok: false, error: string, reason: REASON.* }` | 명령 직전 상태·meta로 복원, 이벤트 폐기, 구독자 호출 없음, 저장 없음 |
| 처리 중 예외, `reason` 없는 실패 | `{ ok: false, error: string, reason: 'COMMAND_FAILED' }` | 위와 같음 |
| 롤백 실패 | `{ ok: false, error: '복구 불가능 오류: 새 게임을 시작해 주세요', code: 'ROLLBACK_FAILED', reason: 'ROLLBACK_FAILED' }` | fatal 상태 전환, 구독자에 `[]` 1회 전달, 저장 없음(`FATAL`) |
| fatal 중 명령 | 위와 같은 `ROLLBACK_FAILED` 반환 | 처리하지 않음 |
| 처리 중 재호출 | `{ ok: false, error: '이전 명령을 처리하는 중입니다', reason: 'COMMAND_BUSY' }` | 처리하지 않음 |
| 알 수 없는 명령 | `{ ok: false, error: '알 수 없는 명령: <type>', reason: 'UNKNOWN_COMMAND' }` | 처리하지 않음 |

- 모든 실패 반환에 `ok`, `error`, `reason`이 있다. `reason`은 `REASON`(4장) 또는 `FLOW_REASON` 값 중 하나다. 화면은 실패 종류를 `reason`으로 구분하고, 문자열 `error`를 비교해 분기하지 않는다.
- `error`는 기존과 같은 안내 문구이며 다음 순서로 정한다: 하위 결과의 `message` → 예외 메시지 → `REASON_TEXT[reason]` → `reason` 문자열 → `'명령 실패'`. 화면은 `error`를 그대로 표시하거나 `reason`에 따라 자체 문구로 바꿀 수 있다.
- `REASON_TEXT` 문구: `INVALID_AMOUNT` '금액이 올바르지 않습니다', `INSUFFICIENT_BUDGET` '집행 가능액이 부족합니다', `NOT_FOUND` '대상을 찾을 수 없습니다', `NOT_ELIGIBLE` '계약할 수 없는 업체입니다', `ALREADY_DONE` '이미 처리했습니다', `INVALID_STATE` '지금 단계에서 할 수 없습니다', `INSPECTION_FAILED` '정식 검사 실패: 필수 수량 또는 규격을 충족하지 못했습니다'.
- `code`는 `ROLLBACK_FAILED`일 때만 있으며 기존 호환을 위해 유지한다. 이때 `reason`도 같은 값이다. 현재 `UIScene`은 실패 시 `error`를 토스트로 표시한다.
- 성공 반환은 `{ ok, events }`만 있고 `reason`이 없다.
- 예산이 부족한 상태의 `SIGN_CONTRACT`는 `INSUFFICIENT_BUDGET`이 아니라 `NOT_FOUND`('대상을 찾을 수 없습니다')로 실패한다. 예산을 넘는 제안은 비교 단계에서 부적격('예산 초과')이 되어 1순위 업체(`winnerId`)가 없기 때문이다. 일반 플레이에서는 발생하지 않는다.

**`CONFIRM_INSPECTION` 실패 처리 (`INSPECTION_FAILED`)**

- 사전 조건: `pending`이 `INSPECTION`이 아니면 `INVALID_STATE`.
- `DeliverySystem.inspect()`가 `NOT_ELIGIBLE`을 반환하면 `TutorialFlow`가 `reason`을 `INSPECTION_FAILED`로 바꾸고 `message`를 검사 소견(`detail.findings`)을 이어 붙인 문장으로 정한다. 소견이 없으면 `REASON_TEXT.INSPECTION_FAILED`를 사용한다. 화면은 이 문장을 `error`로, `'INSPECTION_FAILED'`를 `reason`으로 받는다.
- 보완 납품 비용을 집행할 수 없으면 `INSUFFICIENT_BUDGET`('집행 가능액이 부족합니다')로 실패한다.
- 실패하면 보완 비용 차감·납품 기록·`INSPECTION_COMPLETED`를 포함한 모든 변경이 취소되고 사업 `INSPECTING`, `pending: 'INSPECTION'` 상태가 유지된다. 평가·시설 개선·월 마감은 실행되지 않는다.

**명령과 화면 알림**

`events` 배열은 아래 순서로 전달된다. 같은 배열이 `store.subscribe` 콜백의 두 번째 인자로 전달된다.

| 명령 | 사전 조건 | 동작 | 화면 알림 (`events`) |
|---|---|---|---|
| `CHECK_RESIDENTS` | 1월차 월초, 부족 수량 확정 전 | 주민 요청 확인 | `RESIDENTS_CHECKED` |
| `CHECK_USER_SPEC` | 같음. 중복 시 `ALREADY_DONE` | 사용자 규격 확인 | `USER_SPEC_CHECKED` |
| `CHECK_INVENTORY_COUNT` | 같음 | 재고 수량 확인 | `INVENTORY_COUNTED` |
| `CHECK_MATTRESS_CONDITION` | 같음. 재고 수량 확인 후 | 매트 상태 확인 | `MATTRESS_CONDITION_CHECKED` |
| `CONFIRM_QUANTITIES` | 주민·규격·재고 확인 완료 | 부족 수량 확정. 점검 생략·힌트 켜짐이면 1회만 멈춤 | `HINT_WET` 또는 `QUANTITIES_CONFIRMED` |
| `ADVANCE_MONTH` | `planReady().ready` | 1월차: 제안 접수 / 2월차: 일부 납품 도착 | 1월차 `MONTH_STARTED`, `PROPOSAL_REVIEW` / 2월차 `MONTH_STARTED`, `PARTIAL_DELIVERY` |
| `SIGN_CONTRACT` | `pending: 'PROPOSAL_REVIEW'` | 1순위 업체와 계약, 1월차 마감 | `CONTRACT_SIGNED`, `MONTH_ENDED` |
| `EVENT_NEGOTIATE_SUPPLIER` | `pending: 'PARTIAL_DELIVERY'` | 공방과 일정 협의 | 미해결: `SUPPLIER_NEGOTIATED` / 두 대응 완료: `SUPPLIER_NEGOTIATED`, `EVENT_RESOLVED`, `INSPECTION_READY` |
| `EVENT_CONFIRM_REQUESTER` | `pending: 'PARTIAL_DELIVERY'` | 요청기관에 지급 순서 확인 | 미해결: `REQUESTER_CONFIRMED` / 두 대응 완료: `REQUESTER_CONFIRMED`, `EVENT_RESOLVED`, `INSPECTION_READY` |
| `CONFIRM_INSPECTION` | `pending: 'INSPECTION'` | 검사 후 평가, 통과 시 시설 개선, 2월차 마감 | 통과: `INSPECTION_DONE`, `USE_STARTED`, `MONTH_ENDED`, `EVALUATED` / D: `INSPECTION_DONE`, `MONTH_ENDED`, `EVALUATED` |
| `CLOSE_REPORT` | `phase: 'REPORT'`. 2월차는 `pending` 없음 | 1월차: 2월차 월초로 / 2월차 통과: 정원 승인·후보 공개 / 2월차 D: 튜토리얼 종료 | `MONTH_PLAN` / `HEADCOUNT_APPROVED`, `RECRUIT_OPENED` / `TUTORIAL_ENDED` |
| `HIRE { candidateId }` | 모집 단계(`phase: 'RECRUIT'`) | 동료 선발 | `HIRED` |
| `SET_HINTS { on }` | 없음 | 안내 표시 설정(meta) | `META_CHANGED` |
| `MARK_DIALOG_SEEN { id }` | `id`는 비어 있지 않은 문자열. 아니면(누락·`null`·숫자·객체·배열·빈 문자열) `NOT_FOUND`로 실패하고 meta·저장 기록을 바꾸지 않음 | 대사 확인 기록(meta). 이미 있으면 변경 없음 | `META_CHANGED` |

`flow.newGame()`은 명령이 아니지만 구독자에 `['GAME_STARTED']`를 전달한다(1장).

**화면 알림 전체 목록**

화면 알림은 payload가 없는 문자열이며, 필요한 값은 콜백의 `view`에서 읽는다. GameState 이벤트(`EVENTS`, `RESULT_EVENTS`)와 구분한다.

`GAME_STARTED`, `RESIDENTS_CHECKED`, `USER_SPEC_CHECKED`, `INVENTORY_COUNTED`, `MATTRESS_CONDITION_CHECKED`, `HINT_WET`, `QUANTITIES_CONFIRMED`, `MONTH_STARTED`, `PROPOSAL_REVIEW`, `PARTIAL_DELIVERY`, `CONTRACT_SIGNED`, `MONTH_ENDED`, `SUPPLIER_NEGOTIATED`, `REQUESTER_CONFIRMED`, `EVENT_RESOLVED`, `INSPECTION_READY`, `INSPECTION_DONE`, `USE_STARTED`, `EVALUATED`, `MONTH_PLAN`, `HEADCOUNT_APPROVED`, `RECRUIT_OPENED`, `TUTORIAL_ENDED`, `HIRED`, `META_CHANGED`

- 이 중 `UIScene`이 화면 전환에 쓰는 것: `PROPOSAL_REVIEW`, `PARTIAL_DELIVERY`, `CONTRACT_SIGNED`, `RECRUIT_OPENED`, `MONTH_PLAN`(2월차), `INSPECTION_READY`, `USE_STARTED`, `HIRED`.
- 안내 대화 연결은 `src/data/dialogs.js`의 `DIALOG_TRIGGERS`가 정한다(팀원 3 소유). `REQUEST_OPENED`, `ENDING`처럼 화면이 자체로 사용하는 키도 있으며 이는 `dispatch()`가 반환하지 않는다.

### 6-4. 화면 상태 읽기

```js
const view = TYCOON.app.store.getState();
TYCOON.app.store.dispatch('명령', payload);
```

`getState()`는 `TutorialFlow.view()`에서 구성한 화면용 복사본을 반환한다. 호출할 때마다 새로 계산하며, 반환값을 고쳐도 상태는 바뀌지 않는다. 아래 구조는 현재 구현 기준이며 최종 기준은 `src/systems/TutorialFlow.js`의 `view()`다.

| 필드 | 형식 | 의미 |
|---|---|---|
| `fatal` | `null` 또는 `{ originalError, recoveryError }` | 롤백 실패 정보. 값이 있으면 명령이 차단된다 |
| `month` | 정수 | 현재 월차 |
| `phase` | `'PLAN'`, `'PAUSED'`, `'REPORT'`, `'RECRUIT'`, `'END'` | 화면 단계. GameState `phase`(`PLAN`/`RUN`/`REPORT`)를 바꾼 값이며 `RUN`은 `PAUSED`로 표시한다. 내부 `pending`이 `RECRUIT`·`END`이면 그 값이 우선한다 |
| `pending` | `'PROPOSAL_REVIEW'`, `'PARTIAL_DELIVERY'`, `'INSPECTION'`, `null` | 진행 중 멈춘 이유. `RECRUIT`·`END`는 여기 나오지 않고 `phase`로 나온다 |
| `budget` | `{ total, spent }` | `total`은 초기 예산, `spent`는 `total - 현재 잔액`(계약금과 보완 비용 합계). 잔액은 `total - spent` |
| `project.status` | 사업 단계 문자열 또는 `undefined` | 3-2의 단계 |
| `project.checks` | `{ residents, userSpec, inventoryCount, mattressCondition, hintShown }` (boolean) | 요청 확인 진행 여부 |
| `project.requiredSpecs` | 문자열 배열 | 필수 규격 ID |
| `project.quantities` | `{ mattress, bedding }` 또는 `null` | 확정한 부족 수량(제안 가격과 계약 수량의 기준). 확정 전 `null` |
| `project.contract` | `null` 또는 `{ supplierName, quantities: { mattress, bedding }, amount, deliveryWeeks }` | 계약 요약. `deliveryWeeks`는 납기 일수/7 반올림 |
| `project.event` | `{ supplierNegotiated, requesterConfirmed }` (boolean) | 일부 납품 대응 진행 여부 |
| `project.delivered` | `{ mattress, bedding }` | 실제 납품 수량. 납품 전 0. 검사 통과 후에는 보완 수량 포함 |
| `project.inspection` | `null` 또는 `{ passed, quantityPassed, specsPassed, findings: string[] }` | 검사 결과(검사 성공 후에만 존재) |
| `project.supplement` | `null` 또는 `{ mattress, bedding, amount, temp: true }` | TEMP 보완 납품 수량과 비용 |
| `evaluation` | `null` 또는 `{ quality, deadline, procedure, grade, reason, passed }` | 판정 3항목(`'충족'`·`'보완'`·`'미흡'`), 등급 S~D, 이유 한 문장, 통과 여부 |
| `staff` | `{ headcount, hired }` | `hired`는 첫 채용 후보 객체(Candidate) 또는 `null` |
| `region` | `{ hallBedded, hallLit, secondSeat }` (boolean) | 월드 표현용. 앞 둘은 강당 `IMPROVED` 여부, `secondSeat`는 채용 인원 존재 여부 |
| `meta` | `{ candidates, seenDialogs, hintsOn }` | `candidates`는 Candidate 배열 또는 `null`(GameState 값), `seenDialogs`는 확인한 대사 ID 배열, `hintsOn`은 안내 표시 설정 |
| `reports` | `[{ month, lines: string[] }]` | 월말 보고 문장. 계약 후 1월차, 평가 후 2월차 항목이 추가된다 |

화면은 이 필드를 표시에만 사용하고, 같은 값을 규칙 판단을 위해 다시 계산하지 않는다.

### 6-5. Scene 등록·전환과 Scene 간 연결 (현재 구현)

팀원 2(월드·아트)와 팀원 3(UI) 코드가 서로 주고받는 현재 연결이다. 이름이나 형식을 바꾸면 상대 팀과 팀원 1에 알리고 이 절을 갱신한다.

**등록과 시작 순서**

- 스크립트는 `index.html`의 `<script>` 순서로 불러오고, Scene 목록은 `src/main.js`의 `[Boot, Preload, Title, Office, Village, Hall, UI, Ending]`이다. 두 파일은 팀원 1이 관리하며 새 스크립트·Scene은 팀원 1이 함께 등록한다. 제출 오프라인 ZIP 검사(F-19)는 `index.html`이 참조하는 파일과 `ASSETS`의 `url`을 기준으로 한다.
- `BootScene`은 GameState 확인 후 `PreloadScene`으로 넘긴다. `PreloadScene.preload()`가 `src/config/assets.js`의 `ASSETS`를 불러오고, 로딩이 끝난 `PreloadScene.create()` 첫 줄에서 `TYCOON.ui.art.makeTextures()`로 임시 인물·트럭 텍스처를 만든다(아래 "텍스처 로딩 순서와 폴백").
- 시작 화면 분기(`PreloadScene.create()`, 2026-11-13 결정):
  - 저장 없음·손상·버전 불일치 → `TitleScene`.
  - 진행 중 저장 복원 성공(`view().phase !== 'END'`) → `resumeOnLoad`를 `false`로 바꾸고 `pendingEvents = []`, `OfficeScene` 시작과 `UIScene` 실행.
  - 튜토리얼 완료(END) 저장 복원 성공 → `resumeOnLoad`를 `false`로 바꾸고 `TitleScene`. 복원한 END 상태는 메모리에 남고 저장은 지우지 않는다.
  - `TitleScene` '새로 시작' → `flow.newGame()`, `pendingEvents = ['GAME_STARTED']` → `OfficeScene` 시작, `UIScene` 실행. `GAME_STARTED`로 저장이 새 게임 상태로 교체된다.
- 타이틀 진입 정리: `TitleScene.create()`는 실행 중(활성·일시정지·잠듦)인 `OfficeScene`, `VillageScene`, `HallScene`, `UIScene`, `EndingScene`을 멈춘다. 어느 화면에서 타이틀로 와도(엔딩 '처음으로', fatal '새 게임 시작', D 등급 '처음 화면으로') 타이틀만 남고, '새로 시작' 뒤에는 `OfficeScene`과 `UIScene`만 실행된다. 멈춘 Scene의 `listenTo`·`game.events` 구독은 각 Scene의 `shutdown`에서 풀린다. 타이틀로 보내는 쪽은 `scene.start(TITLE)`만 호출해도 된다.

**월드 화면 전환**

- 월드 Scene(`OfficeScene`, `VillageScene`, `HallScene`)은 한 번에 하나만 실행된다. `UIScene.switchView(key)`가 현재 월드 Scene을 멈추고 대상을 실행한 뒤 UI를 맨 위로 올린다.
- 자동 전환: `pending`이 `INSPECTION`이거나 `INSPECTION_READY` 알림이 오면 지역(`VillageScene`), `HIRED` 알림이 오면 관청(`OfficeScene`). 수동 전환: 하단 메뉴(관청·지역 지도·강당)와 지도 영역 클릭.
- 월드 Scene은 `watchView`로만 상태를 읽는다. 현재 사용하는 필드: 지역 `[region.hallLit, pending, phase]`, 강당 `[region.hallBedded, region.hallLit, project.checks.mattressCondition]`, 관청 `[region.secondSeat, staff.hired.id]`.

**Scene 간 신호 (`game.events`, `registry`)**

| 이름 | 보내는 쪽 → 받는 쪽 | 값 | 용도 |
|---|---|---|---|
| `game.events` `'pt:info'` | 지역 → UI | `{ title, lines: string[] }` | 건물 클릭 시 정보 팝업 |
| `game.events` `'pt:inspect'` | 지역 → UI | 없음 | 학당 검사 표식 클릭 시 검사 패널을 연다. **검사 단계로 넘어가는 유일한 화면 경로**이므로 지역 화면을 바꿀 때 반드시 유지한다 |
| `game.events` `'pt:marker'` | 지역 → UI | 없음 | 검사 표식 위치가 바뀌었음을 알려 UI를 다시 그리게 한다 |
| `registry` `'markerPos'` | 지역이 설정, UI가 읽음 | `{ x, y, w, h }` 또는 `null` | 검사 표식 위치. `null`이면 UI는 검사 패널 대신 지역 화면으로 안내한다. 지역 Scene 종료 시 `null` |
| `registry` `'colleagueArrived'` | 관청 내부 | boolean | 동료 입장 연출을 이미 재생했는지. 저장되지 않으므로 새로고침하면 연출이 다시 재생된다 |

**공용 그리기 함수 (`src/ui/art.js`, 팀원 2 소유)**

| 함수 | 반환 | 사용처 |
|---|---|---|
| `makeTextures(scene)` | 없음. 인물 텍스처 `<팔레트 키>_<stand·walk0·walk1·sit·lie>`와 `truck` 생성. 같은 키의 실제 이미지가 이미 있으면 그 키는 바꾸지 않는다(Phaser 3.80.1 `generateTexture` 동작) | `PreloadScene.create()`(팀원 1) |
| `drawRegion(scene, view, { ox, oy })` | `{ objs, hit: [{ def: { id, name, role }, x, y }] }`. `id === 'hall'`인 항목을 검사 표식 위치로 쓴다 | `VillageScene`, `EndingScene` |
| `drawHall(scene, view, opts)` | 표시 객체 배열 | `HallScene`, `EndingScene` |
| `drawOffice(scene, view, { ox, oy })` | `{ objs, seat2, door, ... }`. `seat2`는 두 번째 업무석 좌표 | `OfficeScene`, `EndingScene` |
| `iso`, `Walker`, `regionPaths` | 좌표 변환, 걷는 인물, 지역 경로 | 지역·관청 Scene |

`art.js`는 표시 문구 일부를 `TYCOON.ui.SCENARIO`(팀원 3의 `viewData.js`)에서 읽는다. 위 텍스처 키(`colleague_sit`, `truck`, `<팔레트 키>_<자세>`)는 `OfficeScene`, `EndingScene`, `VillageScene`, `Walker`가 사용한다.

**텍스처 로딩 순서와 폴백**

- 순서: `PreloadScene.preload()`에서 `ASSETS` 이미지 로드 → `PreloadScene.create()`에서 `makeTextures()` → 타이틀 또는 저장 복원 화면.
- 실제 이미지 우선: `ASSETS`에 임시 텍스처와 같은 키(예: `truck`, `colleague_sit`, `resident_a_stand`)로 등록한 이미지가 로드되면 그 이미지를 쓴다. 팀원 2는 기존 텍스처 키를 그대로 쓰면 되고 사용처 코드는 바꾸지 않는다.
- 폴백: 등록하지 않았거나 파일이 없거나 경로가 잘못돼 로드에 실패한 키는 임시 캔버스 텍스처로 채운다. 로드 실패는 `[Preload] 에셋을 불러오지 못했습니다` 콘솔 오류로 남고 게임은 계속 진행된다.
- 근거와 한계: Phaser 3.80.1의 `Graphics.generateTexture()`는 같은 키가 이미 있을 때 캔버스 텍스처만 다시 그리고 이미지 텍스처는 그대로 둔다. 이 동작에 기대므로 Phaser 버전을 바꾸면 `tests/browser/texture-fallback-cdp.mjs`로 다시 확인한다.
- 이력: 2026-11-12 이전에는 `BootScene`이 임시 텍스처를 먼저 만들어, 같은 키의 이미지가 로더에서 오류 없이 제외되는 문제가 있었다(재현 후 같은 날 해결).

---

## 7. 미확정 항목 및 회의 결정 사항

기획 기준은 게임기획서 v0.8을 따른다. 게임기획서에서 정하지 않은 기능 기준은 기능정의서 9장에서 관리한다.

| 항목 | 현재 상태 | 결정 담당 |
|---|---|---|
| 시설 단계 이름 및 개수 | `BEFORE`, `IN_PROGRESS`, `IMPROVED` 구조 사용. 현재 강당은 `BEFORE → IMPROVED`만 사용 | 팀원 1 |
| 초기 예산 | 300 임시값 (`gameConfig.js`의 `INITIAL_STATE`) | 기획·팀원 1 |
| 품질 값의 척도 | 정수 검증. 평가 기준 미확정 | 기획 |
| 능력치 수치 범위 | 실제 검증 범위 확인 및 기획 확정 필요 | 기획 |
| 매트 사용 불가 수량 | 전체 재고 8개. 젖은 매트 수량 및 최종 부족 수량 미확정 | 기획·팀원 1 |
| 재고 데이터 구조 | 전체·사용 불가·사용 가능 수량의 계산 기준 확정. 실제 필드명은 코드 확인 필요 | 팀원 1 |
| 결과 이벤트 목록 및 payload | 현재 목록은 구현 기준 초안. 실패한 명령의 결과 이벤트는 전달하지 않는 정책(5-2) 확정. `CONTRACT_REJECTED`·`TUTORIAL_STEP` 유지 여부 미정 | 팀원 1(규칙 발생), 팀원 3(UI 소비) |
| 화면 계약 | `dispatch()` 실패에 `reason` 추가(기존 `error`·`code` 유지). 기본 안내 문구 소유(TutorialFlow 또는 UI), `newGame()`·조회 함수의 `store` 노출 여부는 협의 대상 | 팀원 1, 팀원 3 |
| 업체 비교 가중치 | 미확정 | 기획 |
| 평가 등급 공식 및 경계 | 첫 버전은 S~D와 이유 한 문장. 상세 점수 및 공식은 후속 개발 | 기획 |
| 브라우저 자동 저장 | GameState 직렬화·복원과 localStorage 자동 저장·새로고침 복원 구현. 저장 실패 시 게임은 계속되며 상태는 `TYCOON.app.saveStatus`로 노출 | 팀원 1 |

### 변경 절차

1. 관련 기능 담당자가 변경 필요성과 영향을 받는 기능을 확인한다.
2. 기획 기준이 필요한 사항은 게임기획서 또는 기능정의서에 먼저 반영한다.
3. 공통 데이터 구조, 메서드, 반환값, 이벤트가 변경되면 API 명세서를 갱신한다.
4. 관련 System, TutorialFlow, 화면 및 테스트를 함께 수정한다.
5. 팀원 1이 공통 API와 문서의 일관성을 확인한다.

미확정 항목을 임의의 숫자나 규칙으로 구현하지 않는다. 임시값이 필요한 경우 `TEMP`로 표시하고 담당자와 확정 여부를 관리한다.

### 문서 간 기준

| 문서 | 담당하는 내용 |
|---|---|
| `게임기획서.md` | 기획 의도, 세계관, 게임 규칙, 첫 버전 범위 |
| `기능정의서.md` | 기능별 동작, 조건, 완료 기준, 미확정 밸런스 |
| `API명세서.md` | 코드 간 데이터 구조, 함수, 반환값, 이벤트, 명령 |
| `파트분배.md` | 담당자와 작업 범위 |
| `CLAUDE.md` | 프로젝트 공통 개발 규칙과 AI 작업 지침 |

기획 내용이 바뀌면 기능정의서와 API 명세서에 영향을 주는지 확인한다. API 구현이 바뀌면 관련 문서와 테스트도 함께 갱신한다.
