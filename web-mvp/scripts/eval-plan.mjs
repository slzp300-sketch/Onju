import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'

export const EVAL_SUITES = {
  default: 'onju-agent-v2-cases.json', adaptive: 'onju-agent-adaptive.json',
  english: 'onju-agent-en-US.json', usability: 'onju-agent-usability.json',
  regressions: 'onju-agent-regressions.json',
}

export function evalOptions(args) {
  const { values } = parseArgs({ args, options: {
    all: { type: 'boolean' }, name: { type: 'string' },
    adaptive: { type: 'boolean' }, english: { type: 'boolean' },
    usability: { type: 'boolean' }, regressions: { type: 'boolean' },
    live: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
    'max-turns': { type: 'string' },
  } })
  const suites = Object.keys(EVAL_SUITES).filter(key => values[key])
  if (suites.length > 1) throw new Error('select_one_eval_suite')
  if (values.live && values['dry-run']) throw new Error('live_and_dry_run_conflict')
  if (values['max-turns'] !== undefined && (!/^[1-9]\d*$/.test(values['max-turns']) || Number(values['max-turns']) > 1000)) throw new Error('invalid_max_turns')
  if (values.name !== undefined && !values.name.trim()) throw new Error('empty_eval_name')
  return { ...values, suite: suites[0] ?? 'default' }
}

export function prepareEvalPlan(cases, options) {
  if (!Array.isArray(cases) || !cases.length) throw new Error('empty_eval_suite')
  const names = new Set()
  for (const entry of cases) {
    if (!entry || typeof entry.name !== 'string' || !entry.name.trim() || names.has(entry.name)) throw new Error('invalid_or_duplicate_eval_name')
    names.add(entry.name)
    if (!Array.isArray(entry.turns) || !entry.turns.length || entry.turns.some(turn => typeof turn !== 'string' || !turn.trim())) throw new Error('invalid_eval_turns')
    if (entry.turnExpect !== undefined && (!Array.isArray(entry.turnExpect) || entry.turnExpect.length > entry.turns.length)) throw new Error('invalid_turn_expectations')
  }
  const selected = options.name ? cases.filter(entry => entry.name.includes(options.name)) : options.all ? cases : cases.slice(0, 5)
  if (!selected.length) throw new Error('no_matching_eval_cases')
  const turns = selected.reduce((n, entry) => n + entry.turns.length, 0)
  const manifest = {
    mode: options.live ? 'live_requested' : 'offline_plan_only', suite: options.suite,
    fixtureHash: createHash('sha256').update(JSON.stringify(selected)).digest('hex'),
    caseCount: selected.length, userTurns: turns,
    cases: selected.map(entry => ({ name: entry.name, turns: entry.turns.length, locale: entry.regionalContext?.locale ?? 'ko-KR' })),
    liveQualityValidated: false,
    costNote: '계획 출력 비용은 $0입니다. 실제 실행의 모델 호출 수·비용은 사용자 턴 수와 다르며 재시도·도구 호출에 따라 달라집니다.',
  }
  return { selected, manifest }
}

export function assertLiveEvalAllowed(options, manifest, env = process.env) {
  if (env.ONJU_OFFLINE === '1') throw new Error('offline_mode_blocks_paid_evaluation')
  if (!options.live || env.ONJU_ALLOW_PAID_EVALS !== '1') throw new Error('paid_evaluation_requires_live_flag_and_ONJU_ALLOW_PAID_EVALS_1')
  if (!options['max-turns'] || manifest.userTurns > Number(options['max-turns'])) throw new Error('selected_eval_exceeds_max_turns')
}
