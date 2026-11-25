import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadState, runAgentTurn } from '../../supabase/functions/onju-agent-v2/agent.ts'

const call = (name, args, number) => ({
  id: `response-${number}`,
  model: 'gpt-4.1-2025-04-14',
  usage: { input_tokens: 1, output_tokens: 1 },
  output: [{ type: 'function_call', name, arguments: JSON.stringify(args), call_id: `call-${number}` }],
})

const reply = (summary, question, details = []) => ({
  focus: 'goals',
  goal_outcome: '',
  goal_draft: null,
  summary,
  details,
  question,
  choices: [],
})

const goalState = messages => loadState({ stage: 5, messages })

test('a known term is explained from conversation context instead of being pushed back to the user', async () => {
  let requests = 0
  let lookups = 0
  const result = await runAgentTurn(goalState([
    { id: 'u1', role: 'user', text: '크로스핏에서 3개월 뒤 신디 15라운드를 하고 싶어' },
    { id: 'a1', role: 'assistant', text: '신디 목표를 구체화해 볼게요.' },
  ]), '신디가 뭔지 알아?', {
    now: '2026년 9월 7일',
    lookupTerm: async () => { lookups += 1; throw new Error('should_not_lookup') },
    request: async body => {
      requests += 1
      assert.match(body.instructions, /문맥상 뜻이 분명하면 온주가 짧게 설명/)
      assert.match(body.instructions, /신디 15라운드/)
      assert.ok(body.tools.some(tool => tool.name === 'lookup_term'))
      return call('respond', reply(
        '네. 여기서 신디는 **크로스핏 벤치마크 WOD Cindy**를 말해요.',
        '현재 신디 기록은 몇 라운드이고, Rx와 스케일 중 어느 방식으로 하고 있나요?',
        ['**20분** 동안 풀업 5회, 푸시업 10회, 스쿼트 15회를 반복하고 라운드와 추가 횟수를 기록해요.'],
      ), requests)
    },
  })

  assert.equal(requests, 1)
  assert.equal(lookups, 0)
  assert.match(result.assistant_message, /크로스핏 벤치마크 WOD Cindy/)
  assert.match(result.assistant_message, /20분/)
  assert.doesNotMatch(result.assistant_message, /어떤 프로그램.*설명/)
})

test('an uncertain public term can be checked once and returned to the model with sources', async () => {
  let requests = 0
  let lookups = 0
  const result = await runAgentTurn(goalState([]), '루틴 목표에서 모호한 공개 프로그램인 알파플로우가 뭔지 알아?', {
    now: '2026년 9월 7일',
    lookupTerm: async query => {
      lookups += 1
      assert.equal(query, '알파플로우 목표 프로그램')
      return { summary: '알파플로우라는 이름은 여러 공개 서비스가 사용하므로 분야 확인이 필요합니다.', sources: [{ title: '확인 자료', url: 'https://example.com/alpha' }] }
    },
    request: async body => {
      requests += 1
      if (requests === 1) return call('lookup_term', { term: '알파플로우', query: '알파플로우 목표 프로그램' }, requests)
      const output = body.input.find(item => item.type === 'function_call_output')
      assert.match(output.output, /여러 공개 서비스/)
      assert.match(output.output, /https:\/\/example.com\/alpha/)
      return call('respond', reply(
        '확인해 보니 **알파플로우**라는 이름은 여러 공개 서비스에서 사용되고 있어요.',
        '말씀하신 알파플로우는 운동, 생산성, 교육 중 어느 분야인가요?',
        ['지금 정보만으로 하나를 단정하기 어려워 분야만 확인하면 정확히 이어갈 수 있어요. [확인 자료](https://example.com/alpha)'],
      ), requests)
    },
  })

  assert.equal(requests, 2)
  assert.equal(lookups, 1)
  assert.match(result.assistant_message, /여러 공개 서비스/)
  assert.match(result.assistant_message, /\[확인 자료\]\(https:\/\/example.com\/alpha\)/)
  assert.ok(result.events.some(event => event.tool === 'lookup_term' && event.result.ok))
})

test('a second lookup in the same turn is blocked', async () => {
  let requests = 0
  let lookups = 0
  const sequence = [
    ['lookup_term', { term: '첫 용어', query: '첫 공개 용어' }],
    ['lookup_term', { term: '둘째 용어', query: '둘째 공개 용어' }],
    ['respond', reply('공개 정보만으로는 정확히 구분하기 어려워요.', '그 표현을 어디에서 보셨는지 한 문장으로 알려주실래요?')],
  ]
  const result = await runAgentTurn(goalState([]), '두 표현을 확인해 줘', {
    now: '2026년 9월 7일',
    lookupTerm: async () => {
      lookups += 1
      return { summary: '첫 번째 공개 용어 확인 결과', sources: [] }
    },
    request: async () => {
      const [name, args] = sequence[requests]
      requests += 1
      return call(name, args, requests)
    },
  })

  assert.equal(lookups, 1)
  assert.equal(requests, 3)
  assert.ok(result.events.some(event => event.tool === 'lookup_term' && /lookup_limit/.test(event.result.error ?? '')))
  assert.match(result.assistant_message, /어디에서 보셨는지/)
})

test('private schedule context is rejected before it can reach web search', async () => {
  let requests = 0
  let lookups = 0
  const result = await runAgentTurn(goalState([]), '내 일정을 검색해 줘', {
    now: '2026년 9월 7일',
    lookupTerm: async () => {
      lookups += 1
      return { summary: 'should not run', sources: [] }
    },
    request: async () => {
      requests += 1
      if (requests === 1) return call('lookup_term', { term: '개인 일정', query: '개인 일정 06:30 출근' }, requests)
      return call('respond', reply('개인 일정은 공개 검색에 보내지 않아요.', '확인하려는 공개 용어만 따로 알려주실래요?'), requests)
    },
  })

  assert.equal(lookups, 0)
  assert.ok(result.events.some(event => event.tool === 'lookup_term' && /private_context/.test(event.result.error ?? '')))
})
