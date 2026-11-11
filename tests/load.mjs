/**
 * 테스트용 로더. 게임 코드는 일반 스크립트라서 index.html과 같은 순서로 불러온다.
 * Phaser를 쓰는 화면 파일(scenes, ui)은 불러오지 않는다. 규칙 코드만 테스트한다.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

for (const file of [
  '../src/config/gameConfig.js',
  '../src/config/balance.js',
  '../src/core/EventBus.js',
  '../src/core/events.js',
  '../src/core/results.js',
  '../src/core/schema.js',
  '../src/core/GameState.js',
  '../src/data/projects.js',
  '../src/data/suppliers.js',
  '../src/data/facilities.js',
  '../src/data/dialogs.js',
  '../src/systems/ProcurementSystem.js',
  '../src/systems/ProgressSystem.js',
  '../src/systems/DeliverySystem.js',
  '../src/systems/EvaluationSystem.js',
  '../src/systems/FacilitySystem.js',
  '../src/systems/RecruitSystem.js',
  '../src/systems/TutorialFlow.js',
  '../src/core/BrowserSave.js'
]) require(file);

export const TYCOON = globalThis.TYCOON;
