const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const scheduleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['assistant_message', 'needs_clarification', 'stage_complete', 'suggestions', 'day_bounds', 'blocks'],
  properties: {
    assistant_message: { type: 'string' },
    needs_clarification: { type: 'boolean' },
    stage_complete: { type: 'boolean' },
    suggestions: { type: 'array', maxItems: 3, items: { type: 'string' } },
    day_bounds: { type: 'array', maxItems: 7, items: { type: 'object', additionalProperties: false, required: ['days','wake','bedtime','variable'], properties: {
      days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
      wake: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }, bedtime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }, variable: { type: 'boolean' },
    } } },
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
- 가장 먼저 평일과 주말 또는 요일별 기상·취침 시간을 파악한다. 사용자가 말하지 않았다면 다른 일정이나 빈 시간을 먼저 단정하지 않는다.
- 생활 리듬 단계에서 확실한 기상·취침 범위를 day_bounds에 반환한다. 평일은 days=[0,1,2,3,4], 주말은 [5,6]이다.
- 기상·취침 시간이 들쑥날쑥하면 억지로 고정하지 않는다. 사용자가 말한 대표 시각 또는 범위를 기준으로 variable=true로 저장하고, 당일 아침에 조정할 수 있다고 안내한다.
- 기상·취침 중 하나가 빠졌거나 변동폭조차 모르면 day_bounds=[]로 두고 한 가지만 추가 질문한다.
- 생활 리듬에 관해 하나라도 확인 질문을 하고 있다면 needs_clarification=true, stage_complete=false로 둔다. 같은 답변에 다음 단계 안내를 절대 넣지 않는다.
- day_bounds, variable, stage_complete, days 같은 내부 필드명이나 true/false 값을 사용자에게 절대 보여주지 않는다. "일정한 편", "변동이 있는 편"처럼 자연스러운 한국어로 표현한다.
- 생활 리듬 단계에서 월~일까지의 기상·취침 정보가 모두 파악되면 그 답변에서는 다른 일정을 묻지 말고 생활 리듬 요약만 한다. 다음 단계 질문은 화면이 전환된 뒤 제시된다.
- 한 번에 필요한 질문 하나만 짧고 자연스러운 한국어로 한다.
- 사용자가 이미 말한 내용을 다시 묻지 않는다.
- 수동적으로 정보만 요구하지 않는다. 사용자의 답을 먼저 구조화하고, 시간상 제약이나 빠진 부분을 판단한 뒤 현실적인 기본안을 주도적으로 제안한다.
- 계산할 수 있는 내용은 직접 계산한다. 예: 준비 시간의 합, 일정 사이의 빈 시간, 이동 전 남은 시간. 단, 사용자가 말하지 않은 사실이나 시간을 지어내지 않는다.
- 선택이 필요하면 가장 현실적인 안 하나를 먼저 추천하고 이유를 짧게 설명한 뒤, 사용자가 바꾸거나 승인할 수 있게 한다.
- 일정이 빠듯하거나 서로 양립하기 어려우면 어떤 항목이 밀릴 가능성이 큰지 구체적으로 짚는다.
- 새 일정과 confirmed_schedule_blocks를 합쳐 사용자가 말한 기상~취침 사이의 실제 빈 시간대를 계산해 알려준다. 30분 미만의 짧은 틈은 제외한다.
- 기본 생활 단계에서는 새 일정을 반영한 뒤 다른 고정 일정(정기 운동, 교회·모임, 가족 시간, 식사, 회복 시간)이 더 있는지 질문 하나로 이어간다.
- 사용자가 "없어", "이게 전부야", "다음으로"처럼 현재 단계의 정보가 끝났다고 명확히 말하면 stage_complete=true로 둔다. 그 외에는 false다.
- 심리 평가나 과한 조언을 하지 않고, 판단하지 않는 말투를 쓴다.
- 모든 일정 구간을 빠짐없이 별도 블록으로 추출한다. 예: "6:30-8:30 이동, 8:30-17:30 근무"는 정확히 2개 블록이다.
- 요일 인덱스는 월=0, 화=1, 수=2, 목=3, 금=4, 토=5, 일=6이다. "평일"은 [0,1,2,3,4], "매일"은 [0,1,2,3,4,5,6]이다.
- 오전/오후, 요일, 종료 시간이 불명확하거나 기존 일정과 충돌하면 추측하지 않는다. 확실한 블록만 반환하고 needs_clarification=true로 둔 뒤 정확히 무엇이 필요한지 묻는다.
- "18시 30분에 도착해"처럼 시점만 있고 구간의 시작 또는 끝이 없는 말은 일정 블록으로 만들지 않는다. 앞뒤 맥락으로 시간을 임의 계산하지 말고 시작·종료 시각을 한 번만 재질문한다.
- 시작과 종료가 같은 블록, 종료가 시작보다 이른 블록은 만들지 않는다. 자정을 넘는 일정은 종료 시각을 재확인한다.
- 새로 제안할 블록만 blocks에 담는다. 사용자가 일정이 없다고 명확히 말하면 blocks=[]로 둔다.
- assistant_message는 추출 결과를 자연스럽게 요약하거나 다음에 필요한 한 가지를 질문한다.
- 확실하게 추출된 일정은 화면의 시간 지도에 즉시 반영된다. assistant_message에서 "시간 지도에 반영했어요"라고 명확히 알린다. 불명확한 일정은 반영하지 말고 한 가지만 재질문한다.

응답 형식:
- ChatGPT와 대화하듯 자연스럽고 따뜻한 문장으로 답한다. 정해진 양식을 매번 반복하지 않는다.
- 단순한 확인은 1~2개 문단으로 쓴다. 일정이나 판단이 둘 이상일 때만 짧은 목록을 사용한다.
- 새로운 주제로 전환하거나 중요한 계산 결과가 있을 때만 "✓ 정리", "💡 온주의 제안", "⏱ 비어 있는 시간" 같은 짧은 제목을 선택적으로 사용한다.
- 한 문단은 2~3문장을 넘기지 않고 문단 사이에 빈 줄 하나만 둔다. 줄 끝에 공백을 넣거나 문장마다 강제로 줄바꿈하지 않는다.
- 같은 질문을 본문과 마지막 줄에서 반복하지 않는다. 마지막 질문은 정확히 하나만 쓴다.
- 마크다운 표와 # 제목, 별표 강조 문법은 사용하지 않는다.
- 사용자가 답한 뒤 실제 선택지가 도움이 될 때만 suggestions에 2~3개의 짧고 서로 다른 답변 후보를 넣는다. 자유롭게 설명해야 하는 질문이면 빈 배열을 반환한다.
- suggestions는 버튼 문구만 넣으며 물음표나 설명을 넣지 않는다. 예: ["평일 저녁은 쉬어요", "정기 운동이 있어요", "다른 일정을 말할게요"].`

type ScheduleBlock = { days: number[]; start: string; end: string }
type DayBounds = { days: number[]; wake: string; bedtime: string; variable: boolean }
const minutes = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute }
const clock = (value: number) => `${value>=1440?'다음 날 ':''}${String(Math.floor((value%1440) / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
function availabilitySummary(blocks: ScheduleBlock[], bounds: DayBounds[]) {
  const labels = ['월','화','수','목','금','토','일']; const grouped = new Map<string, number[]>()
  for (let day = 0; day < 7; day++) {
    const ranges = blocks.filter(block => block.days.includes(day)).map(block => [minutes(block.start), minutes(block.end)] as [number,number]).sort((a,b)=>a[0]-b[0])
    const merged: [number,number][] = []
    for (const range of ranges) { const last=merged.at(-1); if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]) }
    const boundary=bounds.find(item=>item.days.includes(day));if(!boundary)continue
    const wake=minutes(boundary.wake),bedRaw=minutes(boundary.bedtime),bed=bedRaw<=wake?bedRaw+1440:bedRaw
    const free: [number,number][] = []; let cursor=wake
    for(const [start,end] of merged){if(end<=wake||start>=bed)continue;if(start-cursor>=30)free.push([cursor,Math.min(start,bed)]);cursor=Math.max(cursor,end)}if(bed-cursor>=30)free.push([cursor,bed])
    const key=free.map(([start,end])=>`${clock(start)}–${clock(end)}`).join(', ')||'30분 이상 빈 구간 없음';grouped.set(key,[...(grouped.get(key)??[]),day])
  }
  return [...grouped].slice(0,4).map(([times,days])=>`• ${days.map(day=>labels[day]).join('·')}: ${times}`).join('\n')
}

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
        confirmed_day_bounds: Array.isArray(body.existingDayBounds) ? body.existingDayBounds : [],
      }),
      text: { format: { type: 'json_schema', name: 'onju_schedule_turn', strict: true, schema: scheduleSchema } },
    }
    if (typeof body.previousResponseId === 'string' && body.previousResponseId.startsWith('resp_')) {
      requestBody.previous_response_id = body.previousResponseId
    }
    let response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })
    if (!response.ok && requestBody.previous_response_id) {
      delete requestBody.previous_response_id
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
    }
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`)
    const result = await response.json()
    const outputText = result.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).find((part: { type: string }) => part.type === 'output_text')?.text
    if (!outputText || typeof result.id !== 'string') throw new Error('No structured output returned')
    const parsed = JSON.parse(outputText)
    const existingDayBounds:Array<DayBounds>=Array.isArray(body.existingDayBounds)?body.existingDayBounds:[]
    const mentionsBedtime=/(취침|잠들|잠자|자고|자는|잡니다|잘게|잘 거|새벽\s*\d)/.test(body.message)
    const parsedDayBounds:Array<DayBounds>=(Array.isArray(parsed.day_bounds)?parsed.day_bounds:[]).map((bound:DayBounds)=>({...bound,days:(bound.days??[]).filter(day=>mentionsBedtime||existingDayBounds.some(saved=>saved.days?.includes(day)))})).filter((bound:DayBounds)=>bound.days.length)
    const existing = Array.isArray(body.existingBlocks) ? body.existingBlocks : []
    const explicitDay = ['월','화','수','목','금','토','일'].findIndex(day => body.message.includes(`${day}요일`))
    const blocks = (Array.isArray(parsed.blocks) ? parsed.blocks : []).map((block: { days?: number[]; title?: string; start?: string; end?: string }) => explicitDay >= 0 && block.days?.length === 1 ? { ...block, days: [explicitDay] } : block).filter((block: { days?: number[]; title?: string; start?: string; end?: string }) => {
      if (!Array.isArray(block.days) || block.days.length === 0 || !block.title || !block.start || !block.end || block.start >= block.end) return false
      return !existing.some((saved: { days?: number[]; title?: string; start?: string; end?: string }) =>
        saved.title === block.title && saved.start === block.start && saved.end === block.end && JSON.stringify(saved.days) === JSON.stringify(block.days))
    })
    const allBlocks = [...existing, ...blocks].filter((block): block is ScheduleBlock => Array.isArray(block.days) && typeof block.start === 'string' && typeof block.end === 'string')
    const dayBounds = [...existingDayBounds, ...parsedDayBounds]
    const rhythmComplete = body.stage === '생활 리듬' && parsed.needs_clarification !== true && [0,1,2,3,4,5,6].every(day=>dayBounds.some((bound:DayBounds)=>bound.days?.includes(day)))
    const summary=availabilitySummary(allBlocks,dayBounds)
    const gapText = body.stage === '기본 생활' && blocks.length && summary && !parsed.assistant_message.includes('아직 비어 있는 시간') ? `\n\n⏱ 아직 비어 있는 시간\n${summary}\n확정 일정이 추가되면 이 시간도 바로 다시 계산할게요.` : ''
    const suggestions = Array.isArray(parsed.suggestions) && parsed.suggestions.length ? parsed.suggestions : body.stage === '기본 생활' && blocks.length ? ['고정 일정이 더 있어요', '이게 전부예요'] : []
    const rhythmText=rhythmComplete?'\n\n→ 다음으로 고정된 이동·근무 시간을 확인할게요.':''
    const needsClarification=body.stage==='생활 리듬'?!rhythmComplete:parsed.needs_clarification
    return new Response(JSON.stringify({ ...parsed, stage_complete:rhythmComplete||parsed.stage_complete, needs_clarification:needsClarification, day_bounds:parsedDayBounds, suggestions:rhythmComplete?[]:suggestions, assistant_message: `${parsed.assistant_message}${gapText}${rhythmText}`, blocks, response_id: result.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: 'onju_agent_failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
