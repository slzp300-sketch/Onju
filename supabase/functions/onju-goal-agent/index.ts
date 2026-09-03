const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}

const goalCardProperties={
  category:{type:'string',enum:['일·커리어','자기계발·공부','건강·운동','신앙','생활관리','관계·가족','취미·창작','기타']},
  outcome:{type:'string'},identity:{type:'string'},durationWeeks:{type:'integer',minimum:0,maximum:260},deadline:{type:'string'},
  baselineMetric:{type:'string'},targetMetric:{type:'string'},tinyStart:{type:'string'},cue:{type:'string'},environment:{type:'string'},
  fallbackAction:{type:'string'},recoveryRule:{type:'string'},reviewCycle:{type:'string'},
  weeklyActions:{type:'array',maxItems:7,items:{type:'object',additionalProperties:false,required:['title','frequencyPerWeek','durationMinutes','preferredDays'],properties:{title:{type:'string'},frequencyPerWeek:{type:'integer',minimum:1,maximum:7},durationMinutes:{type:'integer',minimum:1,maximum:480},preferredDays:{type:'array',items:{type:'integer',minimum:0,maximum:6}}}}},
}
const schema={type:'object',additionalProperties:false,required:['assistant_message','goal_card','missing_fields','ready_for_confirmation'],properties:{
  assistant_message:{type:'string'},goal_card:{type:'object',additionalProperties:false,required:Object.keys(goalCardProperties),properties:goalCardProperties},
  missing_fields:{type:'array',items:{type:'string'}},ready_for_confirmation:{type:'boolean'},
}}

const instructions=(today:string)=>`당신은 온주(Onju)의 목표 설계 파트너다. 현재 한국 시각은 ${today}, 기준 시간대는 Asia/Seoul이다.
사용자의 막연한 희망을 숫자로 판정 가능한 중장기 목표와 현실적인 주간 시스템으로 함께 설계한다.

대화 원칙:
- 매 응답에서 사용자가 가장 쉽게 답할 수 있는 질문을 정확히 하나만 한다. 한꺼번에 설문하지 않는다.
- 이미 답한 내용은 다시 묻지 않고 goal_card를 매번 완전한 최신 상태로 반환한다. 모르는 문자열은 "", 모르는 숫자는 0, 모르는 배열은 []로 둔다.
- 사용자가 말한 목표는 표현이 다소 막연해도 category와 outcome에 먼저 자연스럽게 요약한다. 운동·체력·신디는 건강·운동, 공부·자격증·독서는 자기계발·공부, 업무·사업·출시는 일·커리어로 분류한다. 명백한 카테고리를 기타로 두지 않는다.
- 결과 지표(종료 시 달성 여부)와 행동 지표(매주 통제 가능한 반복)를 분리한다.
- 기준선이 없으면 수치를 꾸며내지 말고 첫 1~2주 측정을 제안한다.
- 기간은 목표 크기와 가용 시간에 따라 4주(습관 형성·검증), 12주(측정 가능한 변화), 24주(큰 프로젝트·실력), 52주(장기 성과) 중 우선 추천하되, 특정 기간의 성공률이 높다고 근거 없이 말하지 않는다.
- 정체성은 "나는 ...하는 사람이다"처럼 상황이 바뀌어도 유지되는 문장으로 만든다.
- 주간 행동은 횟수·분·선호 요일을 숫자로 정한다. 요일 인덱스는 월=0 ... 일=6이다.
- 2분 안에 시작 가능한 tinyStart, 기존 행동 뒤에 붙이는 cue, 마찰을 줄이는 environment, 정상 실행이 어려울 때 fallbackAction을 정한다.
- recoveryRule에는 예외를 실패로 계산하지 않고 두 번 연속 놓치지 않는 복귀 방법을 담는다.
- 처음부터 과도한 양을 제안하지 않는다. 표준화한 뒤 점진적으로 키운다.
- 일정 지도와 충돌하는 행동은 제안하지 않는다.
- 필수 정보가 모두 구체적일 때만 ready_for_confirmation=true로 둔다. 그때는 질문 대신 카드 확인과 승인을 요청한다.
- 다음 질문은 missing_fields 중 우선순위가 가장 높은 하나만 묻는다. 한 문장 안에서 두 가지 수치나 정보를 동시에 요구하지 않는다. 우선순위는 기준선 → 결과 목표 수치 → 정체성 → 주간 행동 → 실행 단서 → 2분 시작 → 축소 실행 → 복귀 규칙이다.

필수 정보: category, outcome, durationWeeks/deadline, baselineMetric, targetMetric, identity, weeklyActions, tinyStart, cue, fallbackAction, recoveryRule.`

Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});try{
  const apiKey=Deno.env.get('OPENAI_API_KEY');if(!apiKey)throw new Error('OPENAI_API_KEY is not configured')
  const body=await req.json();if(typeof body.message!=='string'||!body.message.trim())return new Response(JSON.stringify({error:'message_required'}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}})
  const today=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'full',timeStyle:'short'}).format(new Date())
  const requestBody:Record<string,unknown>={model:'gpt-4o-mini',store:true,instructions:instructions(today),input:JSON.stringify({user_message:body.message,current_goal_card:body.goalCard??{},confirmed_schedule_blocks:Array.isArray(body.scheduleBlocks)?body.scheduleBlocks:[]}),text:{format:{type:'json_schema',name:'onju_goal_design_turn',strict:true,schema}}}
  if(typeof body.previousResponseId==='string'&&body.previousResponseId.startsWith('resp_'))requestBody.previous_response_id=body.previousResponseId
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(requestBody)})
  if(!response.ok)throw new Error(`OpenAI request failed: ${response.status}`)
  const result=await response.json();const outputText=result.output?.flatMap((item:{content?:{type:string;text?:string}[]})=>item.content??[]).find((part:{type:string})=>part.type==='output_text')?.text
  if(!outputText||typeof result.id!=='string')throw new Error('No structured output returned')
  const parsed=JSON.parse(outputText);return new Response(JSON.stringify({...parsed,response_id:result.id}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
}catch(error){console.error(error);return new Response(JSON.stringify({error:'onju_goal_agent_failed'}),{status:500,headers:{...corsHeaders,'Content-Type':'application/json'}})}})
