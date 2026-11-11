/**
 * 마스코트 대사와 주민 후기 (담당: 팀원 4)
 * 값과 문구는 TEMP다. 기획에서 정하면 고친다(기능정의서 9장).
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const DATA = (TYCOON.data = TYCOON.data || {});

  /** 마스코트 대사 (F-15). 게임용 설정이며 조달청 공식 설정이 아니다. 문구는 TEMP */
  const DIALOGS = Object.freeze({
      intro: { title: '거점 재개설', speaker: '나르미', lines: [
        '다시 문을 연 지방조달청 현장 거점에 오신 걸 환영해요.',
        '우리는 시설을 직접 짓지 않아요. 요청기관이 필요한 물자를 제대로 조달하도록 돕는 곳이에요.',
        '학당 강당에서 첫 요청이 왔어요. 오른쪽 조달 요청서에서 요청서를 열어 보세요.'
      ] },
      request: { title: '요청서 확인', speaker: '달이', lines: [
        '요청서에 아직 확인하지 않은 항목이 있어요.',
        '주민 수와 연령 구성, 사용자 규격을 확인하고 남은 재고도 세어 봐요.'
      ] },
      hint_wet: { title: '매트 상태 힌트', speaker: '달이', kind: 'hint', lines: [
        '잠깐요, 매트 상태는 점검했나요?',
        '젖은 매트는 쓸 수 없어요. 점검하지 않으면 부족 수량이 틀릴 수 있어요.'
      ] },
      proposal: { title: '제안 검토', speaker: '나르미', lines: [
        '공고한 조건에 세 곳이 제안했어요.',
        '필수 조건을 하나라도 못 맞추면 부적격이고, 적격 제안은 공개된 기준으로 비교해요.',
        '업체를 마음대로 고를 수는 없어요. 결과와 판단 근거를 확인하고 계약을 확정하세요.'
      ] },
      contract: { title: '계약 확정', speaker: '달이', lines: [
        '계약을 확정했어요. 사업예산에서 계약 금액이 한 번 빠져나갔어요.',
        '납품은 다음 달이에요. 월말 보고를 확인해 주세요.'
      ] },
      month2: { title: '2월차 계획', speaker: '달이', lines: [
        '2월차예요. 이번 달에 납품이 들어와요.',
        '준비가 되면 오른쪽의 2월차 진행을 눌러 주세요.'
      ] },
      partial: { title: '일부 납품', speaker: '달이', lines: [
        '공방의 완제품 침구가 조금 모자라 일부만 먼저 왔어요.',
        '실패가 아니에요. 공방과 남은 일정을 협의하고, 지급 순서는 요청기관에 확인해요.'
      ] },
      inspection: { title: '검사·검수', speaker: '나르미', lines: [
        '검사·검수는 요청기관이 맡아요. 우리는 그 결과를 확인하고 사업을 마무리해요.',
        '물품이 학당에 도착하면 학당 위 표식을 눌러 결과를 확인하세요.'
      ] },
      use_started: { title: '사용 개시', speaker: '나르미', lines: [
        '강당에 매트와 침구가 깔렸어요. 오늘 밤은 맨바닥에서 자는 주민이 없어요.'
      ] },
      evaluation: { title: '첫 성과평가', speaker: '나르미', lines: [
        '첫 성과평가 결과예요. 품질, 기한, 절차를 각각 보고 종합 등급을 매겨요.',
        '보완해서 바로잡은 과정도 함께 기록돼요.'
      ] },
      recruit: { title: '첫 동료 모집', speaker: '달이', lines: [
        '추가 정원 1명이 승인됐어요.',
        '후보 세 명의 능력, 전문 분야, 특성이 모두 공개돼 있어요.',
        '숙련도가 높다고 늘 유리한 건 아니에요. 다음 과제를 떠올리며 골라 보세요.'
      ] },
      ending: { title: '다음 과제 예고', speaker: '나르미', lines: [
        '첫 동료와 함께라면 더 큰 일도 할 수 있어요.',
        '강 건너 길이 끊겨 침구 공방의 원단도 멈춰 있어요.',
        '다음 과제는 다리 복구 준비예요.'
      ] }
  });

  /** 일어난 일 → 띄울 대사 */
  const DIALOG_TRIGGERS = Object.freeze({
    GAME_STARTED: 'intro', REQUEST_OPENED: 'request', HINT_WET: 'hint_wet', PROPOSAL_REVIEW: 'proposal',
    CONTRACT_SIGNED: 'contract', MONTH_PLAN: 'month2', PARTIAL_DELIVERY: 'partial', INSPECTION_READY: 'inspection',
    USE_STARTED: 'use_started', EVALUATED: 'evaluation', RECRUIT_OPENED: 'recruit', ENDING: 'ending'
  });

  /** 마무리 장면 주민 후기 (F-16). TEMP */
  const RESIDENT_REVIEWS = Object.freeze([
    '바닥 냉기가 올라오지 않으니 아이들이 푹 자요.',
    '미끄러지지 않는 매트라 밤에 일어날 때도 안심이에요.'
  ]);

  Object.assign(DATA, { DIALOGS, DIALOG_TRIGGERS, RESIDENT_REVIEWS });
})();
