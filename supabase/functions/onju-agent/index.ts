const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const scheduleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['assistant_message', 'needs_clarification', 'blocks'],
  properties: {
    assistant_message: { type: 'string' },
    needs_clarification: { type: 'boolean' },
    blocks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['days', 'title', 'start', 'end', 'kind'],
        properties: {
          days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
          title: { type: 'string' },
          start: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
          end: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
          kind: { type: 'string', enum: ['fixed', 'variable', 'recovery'] },
        },
      },
    },
  },
}

const instructions = (today: string) => `당신은 온주(Onju), 한국 사용자의 다정하고 유능한 개인 일정 비서다. 기준 시간대는 반드시 Asia/Seoul(KST)이고, 현재 한국 시각은 ${today}이다.

목표는 사용자의 고정 시간, 반복 일정, 회복 시간, 이번 주 변동 일정을 대화로 정확히 파악해 현실적인 시간 지도를 함께 만드는 것이다.
- 한 번에 필요한 질문 하나만 짧고 자연스러운 한국어로 한다.
- 사용자가 이미 말한 내용을 다시 묻지 않는다.
- 심리 평가나 과한 조언을 하지 않고, 판단하지 않는 말투를 쓴다.
- 모든 일정 구간을 빠짐없이 별도 블록으로 추출한다. 예: "6:30-8:30 이동, 8:30-17:30 근무"는 정확히 2개 블록이다.
- 요일 인덱스는 월=0, 화=1, 수=2, 목=3, 금=4, 토=5, 일=6이다. "평일"은 [0,1,2,3,4], "매일"은 [0,1,2,3,4,5,6]이다.
- 오전/오후, 요일, 종료 시간이 불명확하거나 기존 일정과 충돌하면 추측하지 않는다. 확실한 블록만 반환하고 needs_clarification=true로 둔 뒤 정확히 무엇이 필요한지 묻는다.
- "18시 30분에 도착해"처럼 시점만 있고 구간의 시작 또는 끝이 없는 말은 일정 블록으로 만들지 않는다. 앞뒤 맥락으로 시간을 임의 계산하지 말고 시작·종료 시각을 한 번만 재질문한다.
- 시작과 종료가 같은 블록, 종료가 시작보다 이른 블록은 만들지 않는다. 자정을 넘는 일정은 종료 시각을 재확인한다.
- 새로 제안할 블록만 blocks에 담는다. 사용자가 일정이 없다고 명확히 말하면 blocks=[]로 둔다.
- assistant_message는 추출 결과를 자연스럽게 요약하거나 다음에 필요한 한 가지를 질문한다.
- 일정 추가는 화면에서 사용자가 최종 승인하므로, 저장했다고 말하지 말고 "반영할까요?"라고 표현한다.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
    const body = await req.json()
    if (typeof body.message !== 'string' || !body.message.trim()) {
      return new Response(JSON.stringify({ error: 'message_required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const today = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'full', timeStyle: 'short' }).format(new Date())
    const requestBody: Record<string, unknown> = {
      model: 'gpt-4o-mini',
      store: true,
      instructions: instructions(today),
      input: JSON.stringify({
        current_stage: body.stage,
        user_message: body.message,
        confirmed_schedule_blocks: Array.isArray(body.existingBlocks) ? body.existingBlocks : [],
      }),
      text: { format: { type: 'json_schema', name: 'onju_schedule_turn', strict: true, schema: scheduleSchema } },
    }
    if (typeof body.previousResponseId === 'string' && body.previousResponseId.startsWith('resp_')) {
      requestBody.previous_response_id = body.previousResponseId
    }
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`)
    const result = await response.json()
    const outputText = result.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).find((part: { type: string }) => part.type === 'output_text')?.text
    if (!outputText || typeof result.id !== 'string') throw new Error('No structured output returned')
    const parsed = JSON.parse(outputText)
    const existing = Array.isArray(body.existingBlocks) ? body.existingBlocks : []
    const blocks = (Array.isArray(parsed.blocks) ? parsed.blocks : []).filter((block: { days?: number[]; title?: string; start?: string; end?: string }) => {
      if (!Array.isArray(block.days) || block.days.length === 0 || !block.title || !block.start || !block.end || block.start >= block.end) return false
      return !existing.some((saved: { days?: number[]; title?: string; start?: string; end?: string }) =>
        saved.title === block.title && saved.start === block.start && saved.end === block.end && JSON.stringify(saved.days) === JSON.stringify(block.days))
    })
    return new Response(JSON.stringify({ ...parsed, blocks, response_id: result.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: 'onju_agent_failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
