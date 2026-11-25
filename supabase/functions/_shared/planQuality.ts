export type PlanningStyle = 'repeat' | 'progression' | 'unknown'
export type SequencedPlanItem = {
  sequenceIndex: number
  title: string
  completionEvidence: string
}

const ordinalMarker = /(?:^|\s)(?:제?\s*\d+\s*(?:회차|단계|번째)|첫\s*번째|두\s*번째|세\s*번째|네\s*번째|다섯\s*번째)(?:\s|$)/giu
const punctuation = /[^\p{L}\p{N}\s]/gu
const genericEvidence = /^(?:완료|실행|진행|수행|끝|끝내기|해보기|하기|체크|확인)(?:했음|함|하기)?$/u

export function canonicalPlanText(value: string) {
  return value
    .toLocaleLowerCase('ko-KR')
    .replace(ordinalMarker, ' ')
    .replace(punctuation, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenContainment(left: string, right: string) {
  const a = new Set(canonicalPlanText(left).split(' ').filter(token => token.length > 1))
  const b = new Set(canonicalPlanText(right).split(' ').filter(token => token.length > 1))
  if (!a.size || !b.size) return 0
  const overlap = [...a].filter(token => b.has(token)).length
  return overlap / Math.min(a.size, b.size)
}

export function validatePlanSequence(
  items: SequencedPlanItem[],
  planningStyle: PlanningStyle,
  actionTitle: string,
) {
  const issues: string[] = []
  items.forEach((item, index) => {
    if (item.sequenceIndex !== index + 1) {
      issues.push(actionTitle + ': 실행 순서는 날짜 순서대로 1부터 이어져야 함')
    }
  })
  if (planningStyle !== 'progression' || items.length < 2) return [...new Set(issues)]

  const titles = items.map(item => canonicalPlanText(item.title))
  const evidence = items.map(item => canonicalPlanText(item.completionEvidence))
  if (new Set(titles).size !== titles.length) {
    issues.push(actionTitle + ': 회차 번호만 바꾸지 말고 단계별 행동을 서로 다르게 만들어야 함')
  }
  if (new Set(evidence).size !== evidence.length) {
    issues.push(actionTitle + ': 각 단계가 남길 완료 결과가 서로 달라야 함')
  }
  if (evidence.some(value => value.length < 3 || genericEvidence.test(value))) {
    issues.push(actionTitle + ': 각 단계의 완료 기준은 확인 가능한 결과물이어야 함')
  }
  for (let index = 0; index < items.length; index += 1) {
    for (let other = index + 1; other < items.length; other += 1) {
      if (
        tokenContainment(items[index].title, items[other].title) >= 0.9
        && tokenContainment(items[index].completionEvidence, items[other].completionEvidence) >= 0.75
      ) {
        issues.push(actionTitle + ': 표현만 조금 바꾼 반복 대신 결과가 이어지는 단계가 필요함')
      }
    }
  }
  return [...new Set(issues)]
}
