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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
    const body = await req.json()
    const today = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', dateStyle: 'full', timeStyle: 'short',
    }).format(new Date())
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        instructions: `당신은 한국 사용자의 개인 일정 비서다. 기준 시간대는 반드시 Asia/Seoul(KST)이다. 오늘은 ${today}이다.
사용자의 문장에서 모든 일정 구간을 빠짐없이 별도 블록으로 추출한다. 요일 인덱스는 월=0, 화=1, 수=2, 목=3, 금=4, 토=5, 일=6이다.
예: "6:30-8:30까지 이동하고, 8:30-17:30까지 근무"는 이동과 근무, 정확히 2개 블록이다.
오전/오후, 요일, 종료 시간이 불명확하면 추측해 확정하지 말고 blocks를 비우거나 확실한 블록만 반환하며 needs_clarification=true로 둔다.
assistant_message는 한국어로 짧고 친절하게, 추출 내용 또는 필요한 재질문을 말한다. 기존 일정과 겹치면 재확인을 요청한다.`,
        input: JSON.stringify({ stage: body.stage, user_message: body.message, existing_blocks: body.existingBlocks ?? [] }),
        text: { format: { type: 'json_schema', name: 'schedule_interpretation', strict: true, schema: scheduleSchema } },
      }),
    })
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`)
    const result = await response.json()
    const text = result.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).find((part: { type: string }) => part.type === 'output_text')?.text
    if (!text) throw new Error('No structured output returned')
    return new Response(text, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: 'schedule_interpretation_failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
