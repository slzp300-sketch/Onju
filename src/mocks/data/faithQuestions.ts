export const identityQuestions = [
  "오늘 동료를 위해 어떤 선택을 했나요?",
  "업무 중 정직함을 지킨 순간이 있었나요?",
  "오늘 말 한마디로 누군가를 격려했나요?",
  "어려운 상황에서 하나님을 의지한 순간이 있었나요?",
  "오늘 감사한 것 중 직장에서 찾은 것은?",
  "동료와의 갈등을 어떻게 처리했나요?",
  "오늘 하나님의 임재를 느낀 순간이 있었나요?",
  "내 말과 행동이 빛과 소금의 역할을 했나요?",
  "오늘 내 실수나 부족함을 인정한 순간이 있었나요?",
  "하나님이 기뻐하실 선택을 했다고 생각하나요?",
];

export function getDailyQuestions(date: string): [string, string] {
  const seed = parseInt(date.replace(/-/g, ''));
  const idx1 = seed % identityQuestions.length;
  const idx2 = (seed + 3) % identityQuestions.length;
  return [identityQuestions[idx1], identityQuestions[idx2]];
}
