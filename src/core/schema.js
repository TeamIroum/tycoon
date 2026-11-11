/**
 * 공통 데이터 구조. (담당: 팀원 1)
 *
 * 팀원 2·3·4가 같은 객체를 서로 다른 모양으로 만들지 않도록 필수 필드만 정한다.
 * - 여기서 검사하는 필드는 '모양'이다. 값의 기준(점수 공식, 등급 경계, 가중치,
 *   품질 척도)은 정하지 않는다(기능정의서 9장 미정 항목).
 * - 필수 필드 외의 필드는 자유롭게 더해도 된다. 더한 필드가 여러 사람에게
 *   필요해지면 이 파일에 올리고 팀원 1과 협의한다.
 * - 상태: 초안. 2일차 팀 회의에서 확정한다(docs/API.md).
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const CORE_NS = (TYCOON.core = TYCOON.core || {});

  /** 사업 진행 단계. 순서대로만 넘어간다. */
  const PROJECT_STATUS = Object.freeze({
    REQUESTED: 'REQUESTED',     // 의뢰 접수
    REVIEWING: 'REVIEWING',     // 요구사항 검토·업체 비교
    CONTRACTED: 'CONTRACTED',   // 계약 체결
    DELIVERING: 'DELIVERING',   // 납품 진행
    INSPECTING: 'INSPECTING',   // 현장 검사
    EVALUATED: 'EVALUATED',     // S~D 평가 완료
    COMPLETED: 'COMPLETED'      // 시설 개선 반영
  });

  const PROJECT_TRANSITIONS = Object.freeze({
    REQUESTED: ['REVIEWING'],
    REVIEWING: ['CONTRACTED'],
    CONTRACTED: ['DELIVERING'],
    DELIVERING: ['INSPECTING'],
    INSPECTING: ['EVALUATED'],
    EVALUATED: ['COMPLETED'],
    COMPLETED: []
  });

  const DELIVERY_STATUS = Object.freeze({
    NOT_STARTED: 'NOT_STARTED',
    IN_PROGRESS: 'IN_PROGRESS',
    DELIVERED: 'DELIVERED',     // 도착. 누락이 있을 수 있음
    INSPECTED: 'INSPECTED'
  });

  /** 납품 문제 종류. 튜토리얼 사건은 MISSING_QUANTITY(일부 누락). */
  const ISSUE_TYPE = Object.freeze({
    MISSING_QUANTITY: 'MISSING_QUANTITY'
  });

  const GRADES = Object.freeze(['S', 'A', 'B', 'C', 'D']);

  /** 한 달의 단계 (기획서 v0.8 3장: 월초 계획 → 진행 → 월말 보고) */
  const DATE_PHASE = Object.freeze({
    PLAN: 'PLAN',       // 월초 계획
    RUN: 'RUN',         // 진행 (사건이 생기면 멈춰서 플레이어에게 묻는다)
    REPORT: 'REPORT'    // 월말 보고·평가
  });

  /** 후보 숙련도 표시 (기획서 v0.8 4장 예시) */
  const CANDIDATE_LEVELS = Object.freeze(['입문', '실무', '숙련']);

  /** 직원 능력 4종 (기획서 v0.8 4장). 수치 척도는 미정 */
  const ABILITY_KEYS = Object.freeze(['review', 'tech', 'coordinate', 'manage']);

  /** 시설 단계. 단계 이름과 개수는 시설 담당(팀원 3)과 확정한다. */
  const FACILITY_STAGE = Object.freeze({
    BEFORE: 'BEFORE',
    IN_PROGRESS: 'IN_PROGRESS',
    IMPROVED: 'IMPROVED'
  });

  // ---------- 검사 도구 ----------
  const isStr = (v) => typeof v === 'string' && v.length > 0;
  const isInt = (v, min = 0) => Number.isInteger(v) && v >= min;
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  function check(errors, cond, message) { if (!cond) errors.push(message); }
  const hasKey = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  function checkItems(errors, items, where, minQty) {
    check(errors, Array.isArray(items) && items.length > 0, `${where}.items는 비어 있지 않은 배열이어야 합니다`);
    if (!Array.isArray(items)) return;
    items.forEach((it, i) => {
      check(errors, isObj(it) && isStr(it.itemId), `${where}.items[${i}].itemId가 필요합니다`);
      check(errors, isObj(it) && isInt(it.quantity, minQty), `${where}.items[${i}].quantity는 ${minQty} 이상의 정수여야 합니다`);
    });
  }

  /**
   * 사업
   * @typedef {Object} Project
   * @property {string} id
   * @property {string} title
   * @property {string} requester         요청 기관
   * @property {string} facilityId        개선 대상 시설
   * @property {number} budgetLimit       사업 예산 한도(정수)
   * @property {{itemId:string, name?:string, quantity:number}[]} items  필요한 물품과 수량
   * @property {string[]} requiredSpecs   필수 규격 id 목록
   * @property {object} [dueDate]         납기. 날짜 형식은 currentDate와 같다
   * @property {string} [status]          PROJECT_STATUS. 없으면 REQUESTED
   */
  function validateProject(p) {
    const e = [];
    if (!isObj(p)) return ['project는 객체여야 합니다'];
    check(e, isStr(p.id), 'project.id가 필요합니다');
    check(e, isStr(p.title), 'project.title이 필요합니다');
    check(e, isStr(p.requester), 'project.requester가 필요합니다');
    check(e, isStr(p.facilityId), 'project.facilityId가 필요합니다');
    check(e, isInt(p.budgetLimit, 1), 'project.budgetLimit은 1 이상의 정수여야 합니다');
    checkItems(e, p.items, 'project', 1);
    check(e, Array.isArray(p.requiredSpecs) && p.requiredSpecs.every(isStr), 'project.requiredSpecs는 문자열 배열이어야 합니다');
    check(e, p.status === undefined || hasKey(PROJECT_STATUS, p.status), 'project.status 값이 올바르지 않습니다');
    return e;
  }

  /**
   * 업체와 제안 (튜토리얼은 고정 3곳)
   * @typedef {Object} Supplier
   * @property {string} id
   * @property {string} name
   * @property {string[]} specs            충족하는 규격 id 목록
   * @property {number} price              제안 총액(정수)
   * @property {number} quality            품질 값. 척도는 미정(TODO: 기획 확정)
   * @property {number} deliveryDays       계약 후 납품까지 일수(정수)
   * @property {Object<string, number>} [capacity]  물품별 공급 가능 수량
   */
  function validateSupplier(s) {
    const e = [];
    if (!isObj(s)) return ['supplier는 객체여야 합니다'];
    check(e, isStr(s.id), 'supplier.id가 필요합니다');
    check(e, isStr(s.name), 'supplier.name이 필요합니다');
    check(e, Array.isArray(s.specs) && s.specs.every(isStr), 'supplier.specs는 문자열 배열이어야 합니다');
    check(e, isInt(s.price, 0), 'supplier.price는 0 이상의 정수여야 합니다');
    check(e, typeof s.quality === 'number' && Number.isFinite(s.quality), 'supplier.quality는 숫자여야 합니다');
    check(e, isInt(s.deliveryDays, 1), 'supplier.deliveryDays는 1 이상의 정수여야 합니다');
    return e;
  }

  /**
   * 계약
   * @typedef {Object} Contract
   * @property {string} id
   * @property {string} projectId
   * @property {string} supplierId
   * @property {{itemId:string, quantity:number}[]} items  계약 수량
   * @property {number} amount            계약 금액. 체결 시 한 번만 차감
   * @property {object} [signedDate]
   * @property {object} [dueDate]
   */
  function validateContract(c) {
    const e = [];
    if (!isObj(c)) return ['contract는 객체여야 합니다'];
    check(e, isStr(c.id), 'contract.id가 필요합니다');
    check(e, isStr(c.projectId), 'contract.projectId가 필요합니다');
    check(e, isStr(c.supplierId), 'contract.supplierId가 필요합니다');
    checkItems(e, c.items, 'contract', 1);
    check(e, isInt(c.amount, 1), 'contract.amount는 1 이상의 정수여야 합니다');
    check(e, Array.isArray(c.specs) && c.specs.every(isStr), 'contract.specs는 문자열 배열이어야 합니다');
    return e;
  }

  /**
   * 납품
   * @typedef {Object} Delivery
   * @property {string} contractId
   * @property {string} status             DELIVERY_STATUS
   * @property {{itemId:string, quantity:number}[]} delivered  실제 납품 수량(0 가능)
   * @property {{type:string, itemId:string, expected:number, actual:number, resolved:boolean}[]} issues
   */
  function validateDelivery(d) {
    const e = [];
    if (!isObj(d)) return ['delivery는 객체여야 합니다'];
    check(e, isStr(d.contractId), 'delivery.contractId가 필요합니다');
    check(e, hasKey(DELIVERY_STATUS, d.status), 'delivery.status 값이 올바르지 않습니다');
    check(e, Array.isArray(d.delivered), 'delivery.delivered는 배열이어야 합니다');
    (d.delivered || []).forEach((it, i) => {
      check(e, isObj(it) && isStr(it.itemId) && isInt(it.quantity, 0), `delivery.delivered[${i}]는 { itemId, quantity(0 이상 정수) }여야 합니다`);
    });
    check(e, Array.isArray(d.issues), 'delivery.issues는 배열이어야 합니다');
    if (d.supplement !== undefined && d.supplement !== null) {
      check(e, isObj(d.supplement) && isInt(d.supplement.mattress, 0) && isInt(d.supplement.bedding, 0) && isInt(d.supplement.amount, 0) && d.supplement.temp === true, 'delivery.supplement는 TEMP 보완 수량·비용이어야 합니다');
    }
    if (d.inspection !== undefined) check(e, isObj(d.inspection) && typeof d.inspection.passed === 'boolean' && typeof d.inspection.quantityPassed === 'boolean' && typeof d.inspection.specsPassed === 'boolean', 'delivery.inspection 결과는 boolean 판정이어야 합니다');
    if (d.findings !== undefined) check(e, Array.isArray(d.findings) && d.findings.every(isStr), 'delivery.findings는 문자열 배열이어야 합니다');
    (d.issues || []).forEach((is, i) => {
      check(e, isObj(is) && hasKey(ISSUE_TYPE, is.type), `delivery.issues[${i}].type 값이 올바르지 않습니다`);
      check(e, isObj(is) && typeof is.resolved === 'boolean', `delivery.issues[${i}].resolved는 true/false여야 합니다`);
    });
    return e;
  }

  /**
   * 평가 (S~D만. 신뢰도 지표와 섞지 않는다)
   * @typedef {Object} Evaluation
   * @property {string} projectId
   * @property {string} grade              'S' | 'A' | 'B' | 'C' | 'D'
   * @property {string} reason             핵심 이유 한 문장
   * @property {Object<string, *>} [criteria]  항목별 결과. 항목과 공식은 미정
   */
  function validateEvaluation(v) {
    const e = [];
    if (!isObj(v)) return ['evaluation은 객체여야 합니다'];
    check(e, isStr(v.projectId), 'evaluation.projectId가 필요합니다');
    check(e, GRADES.includes(v.grade), 'evaluation.grade는 S, A, B, C, D 중 하나여야 합니다');
    check(e, isStr(v.reason), 'evaluation.reason이 필요합니다');
    check(e, typeof v.passed === 'boolean', 'evaluation.passed는 boolean이어야 합니다');
    if (typeof v.passed === 'boolean' && GRADES.includes(v.grade)) check(e, v.passed === (v.grade !== 'D'), 'evaluation.passed는 등급 정책과 일치해야 합니다');
    return e;
  }

  /**
   * 날짜
   * @typedef {Object} GameDate
   * @property {number} month   1부터. 튜토리얼은 2개월
   * @property {string} phase   DATE_PHASE
   */
  function validateDate(d) {
    const e = [];
    if (!isObj(d)) return ['date는 객체여야 합니다'];
    check(e, isInt(d.month, 1), 'date.month는 1 이상의 정수여야 합니다');
    check(e, hasKey(DATE_PHASE, d.phase), 'date.phase는 PLAN, RUN, REPORT 중 하나여야 합니다');
    return e;
  }

  /**
   * 직원 후보 (첫 성과평가 후 3명 공개, 1명 선발)
   * @typedef {Object} Candidate
   * @property {string} id
   * @property {string} name
   * @property {string} level               '입문' | '실무' | '숙련'
   * @property {{review:number, tech:number, coordinate:number, manage:number}} abilities  검토·기술·조정·관리
   * @property {string} specialty           전문 분야
   * @property {string} trait               고유 특성
   */
  function validateCandidate(c) {
    const e = [];
    if (!isObj(c)) return ['candidate는 객체여야 합니다'];
    check(e, isStr(c.id), 'candidate.id가 필요합니다');
    check(e, isStr(c.name), 'candidate.name이 필요합니다');
    check(e, CANDIDATE_LEVELS.includes(c.level), 'candidate.level은 입문, 실무, 숙련 중 하나여야 합니다');
    check(e, isObj(c.abilities) && ABILITY_KEYS.every((k) => isInt(c.abilities[k], 0)), 'candidate.abilities에 review, tech, coordinate, manage 정수가 필요합니다');
    check(e, isStr(c.specialty), 'candidate.specialty가 필요합니다');
    check(e, isStr(c.trait), 'candidate.trait이 필요합니다');
    return e;
  }

  /**
   * 관청 인원. 플레이어 혼자(정원 1, 업무석 1)로 시작한다.
   * @typedef {Object} Staff
   * @property {number} headcount           정원 (플레이어 포함)
   * @property {number} seats               사용 가능한 업무석
   * @property {Candidate[]} hired          선발한 동료
   */
  function validateStaff(s) {
    const e = [];
    if (!isObj(s)) return ['staff는 객체여야 합니다'];
    check(e, isInt(s.headcount, 1), 'staff.headcount는 1 이상의 정수여야 합니다');
    check(e, isInt(s.seats, 1), 'staff.seats는 1 이상의 정수여야 합니다');
    check(e, Array.isArray(s.hired), 'staff.hired는 배열이어야 합니다');
    (s.hired || []).forEach((c, i) => validateCandidate(c).forEach((m) => e.push(`staff.hired[${i}] ${m}`)));
    if (Array.isArray(s.hired)) check(e, new Set(s.hired.map((c) => c && c.id)).size === s.hired.length, 'staff.hired에 중복 ID가 있습니다');
    check(e, !Array.isArray(s.hired) || 1 + s.hired.length <= s.headcount, '선발 인원이 정원을 넘습니다');
    return e;
  }

  /**
   * 시설 상태 (시설 정의 데이터는 src/data/facilities.js, 팀원 3)
   * @typedef {Object} FacilityState
   * @property {string} stage              FACILITY_STAGE
   */
  function validateFacilityState(f) {
    if (!isObj(f)) return ['facility state는 객체여야 합니다'];
    return hasKey(FACILITY_STAGE, f.stage) ? [] : ['facility.stage 값이 올바르지 않습니다'];
  }

  Object.assign(CORE_NS, { PROJECT_STATUS, PROJECT_TRANSITIONS, DELIVERY_STATUS, ISSUE_TYPE, GRADES, DATE_PHASE, CANDIDATE_LEVELS, ABILITY_KEYS, FACILITY_STAGE, validateProject, validateSupplier, validateContract, validateDelivery, validateEvaluation, validateDate, validateCandidate, validateStaff, validateFacilityState });
})();
