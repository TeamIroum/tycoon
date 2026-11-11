/**
 * 공통 데이터 구조 예시 (src/core/schema.js 형식).
 * 테스트용이며 실제 게임 데이터가 아니다. 이름과 수치는 모두 임시값이다.
 * 실제 데이터는 팀원 2(projects.js, suppliers.js)와 팀원 3(facilities.js)이 만든다.
 */
export const sampleProject = {
  id: 'P01',
  title: '학당 강당 잠자리 마련',
  requester: '학당 운영위원회',
  facilityId: 'hall',
  budgetLimit: 300,
  items: [
    { itemId: 'mattress', name: '매트', quantity: 14 },
    { itemId: 'bedding', name: '침구', quantity: 8 }
  ],
  requiredSpecs: ['standardSize', 'antiSlip'],
  dueDate: { month: 2, phase: 'REPORT' }
};

export const sampleSuppliers = [
  { id: 'S1', name: '공급업체 가', specs: ['standardSize', 'antiSlip'], price: 182, quality: 4, deliveryDays: 42 },
  { id: 'S2', name: '공급업체 나', specs: ['standardSize'], price: 146, quality: 3, deliveryDays: 35 },
  { id: 'S3', name: '공급업체 다', specs: ['standardSize', 'antiSlip'], price: 226, quality: 5, deliveryDays: 35 }
];

export const sampleContract = {
  id: 'C01', projectId: 'P01', supplierId: 'S1',
  items: [{ itemId: 'mattress', quantity: 14 }, { itemId: 'bedding', quantity: 8 }],
  specs: ['standardSize', 'antiSlip'],
  amount: 182, signedDate: { month: 1, phase: 'RUN' }, dueDate: { month: 2, phase: 'REPORT' }
};

export const sampleDelivery = {
  contractId: 'C01',
  status: 'DELIVERED',
  delivered: [{ itemId: 'mattress', quantity: 14 }, { itemId: 'bedding', quantity: 5 }],
  issues: [{ type: 'MISSING_QUANTITY', itemId: 'bedding', expected: 8, actual: 5, resolved: false }]
};

export const sampleEvaluation = {
  projectId: 'P01', grade: 'A', reason: '필요한 수량을 기한 안에 공급했습니다.', passed: true,
  criteria: { note: '항목과 공식은 미정' }
};

/** 기획서 v0.8 4장의 후보 예시 3명 (능력 수치는 예시 척도) */
export const sampleCandidates = [
  { id: 'C01', name: '김도윤', level: '입문', abilities: { review: 4, tech: 2, coordinate: 5, manage: 3 }, specialty: '생활물자', trait: '현장 소통' },
  { id: 'C02', name: '서하린', level: '숙련', abilities: { review: 3, tech: 5, coordinate: 2, manage: 3 }, specialty: '의료장비', trait: '시험 결과 분석' },
  { id: 'C03', name: '윤가람', level: '실무', abilities: { review: 4, tech: 3, coordinate: 3, manage: 5 }, specialty: '시설·토목', trait: '협업 일정 정리' }
];
