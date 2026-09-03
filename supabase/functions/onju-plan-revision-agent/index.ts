const corsHeaders = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const jsonHeaders = {...corsHeaders,'Content-Type':'application/json'}
const planItemProperties = {
  id:{type:'string'}, day:{type:'string'}, dayIndex:{type:'integer',minimum:0,maximum:6},
  start:{type:'string',pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'}, end:{type:'string',pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'},
  title:{type:'string'}, tinyStart:{type:'string'}, fallback:{type:'string'}, rationale:{type:'string'},
}
const changeProperties = {type:{type:'string',enum:['add','move','resize','remove','edit']},summary:{type:'string'},before:{type:'string'},after:{type:'string'}}
const schema = {type:'object',additionalProperties:false,required:['assistant_message','proposed_plan','changes','warnings','needs_clarification'],properties:{
  assistant_message:{type:'string'},
  proposed_plan:{type:'array',maxItems:14,items:{type:'object',additionalProperties:false,required:Object.keys(planItemProperties),properties:planItemProperties}},
  changes:{type:'array',maxItems:14,items:{type:'object',additionalProperties:false,required:Object.keys(changeProperties),properties:changeProperties}},
  warnings:{type:'array',items:{type:'string'}}, needs_clarification:{type:'boolean'},
}}
type TimeBlock={days?:number[];start?:string;end?:string;title?:string}
type PlanItem={id:string;day:string;dayIndex:number;start:string;end:string;title:string;tinyStart:string;fallback:string;rationale:string}
const toMinutes=(time:string)=>{const[h,m]=time.split(':').map(Number);return h*60+m}
const overlaps=(aStart:string,aEnd:string,bStart:string,bEnd:string)=>toMinutes(aStart)<toMinutes(bEnd)&&toMinutes(bStart)<toMinutes(aEnd)

Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});try{
 const apiKey=Deno.env.get('OPENAI_API_KEY');if(!apiKey)throw new Error('OPENAI_API_KEY is not configured')
 const body=await req.json();const currentPlan:Array<PlanItem>=Array.isArray(body.currentPlan)?body.currentPlan.slice(0,14):[];const schedule:Array<TimeBlock>=Array.isArray(body.scheduleBlocks)?body.scheduleBlocks:[]
 if(!body.message||!currentPlan.length)return new Response(JSON.stringify({error:'revision_input_incomplete'}),{status:400,headers:jsonHeaders})
 const instructions=`당신은 온주의 주간 계획 수정 비서다. 한국시간(Asia/Seoul) 기준으로 사용자의 자연어 요청을 기존 계획에 적용한 후보안을 만든다.
- 사용자가 요청한 항목만 바꾸고, 언급하지 않은 계획은 id와 모든 내용을 그대로 보존한다.
- proposed_plan에는 삭제 후 남은 항목까지 포함한 전체 계획을 반환한다. 새 항목만 새 id를 만든다.
- 근무·이동·회복 등 confirmed_schedule_blocks와 겹치면 적용하지 말고 needs_clarification을 true로 하며 proposed_plan을 빈 배열로 반환한다.
- 요청이 모호하거나 대상이 여러 개라 특정할 수 없으면 질문 하나만 하고 needs_clarification을 true로 한다.
- 계획은 05:00~23:00 사이이며 같은 요일의 계획끼리 겹치지 않아야 한다.
- changes에는 실제로 달라진 내용만 사람이 비교하기 쉬운 한국어로 적는다. before와 after는 '목 19:30–20:00 운동' 형식이다.
- 사용자의 목표나 성과 수치를 임의로 바꾸지 않는다. 승인 전 후보안이라는 점을 짧게 안내한다.
- assistant_message는 ChatGPT처럼 자연스럽게 설명한다. 단순 변경은 짧은 문단으로, 변경 사항이 둘 이상일 때만 목록을 사용한다. 문단 사이에는 빈 줄 하나만 두고 고정 섹션을 반복하지 않는다.
- 단순히 처리 여부만 말하지 말고 변경이 주간 균형과 고정 일정에 어떤 영향을 주는지 먼저 판단해 알려준다.`
 const requestBody:{model:string;store:boolean;instructions:string;input:string;previous_response_id?:string;text:unknown}={model:'gpt-4o-mini',store:true,instructions,input:JSON.stringify({request:body.message,current_plan:currentPlan,confirmed_schedule_blocks:schedule,goal_card:body.goalCard??{}}),text:{format:{type:'json_schema',name:'onju_plan_revision',strict:true,schema}}}
 if(typeof body.previousResponseId==='string'&&body.previousResponseId)requestBody.previous_response_id=body.previousResponseId
 let response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(requestBody)})
 if(!response.ok&&requestBody.previous_response_id){delete requestBody.previous_response_id;response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(requestBody)})}
 if(!response.ok)throw new Error(`OpenAI request failed: ${response.status}`)
 const result=await response.json();const outputText=result.output?.flatMap((item:{content?:{type:string;text?:string}[]})=>item.content??[]).find((part:{type:string})=>part.type==='output_text')?.text
 if(!outputText||typeof result.id!=='string')throw new Error('No structured output returned')
 const parsed=JSON.parse(outputText);const proposed:Array<PlanItem>=Array.isArray(parsed.proposed_plan)?parsed.proposed_plan:[]
 const currentIds=new Set(currentPlan.map(item=>item.id));const claimedIds=new Set(proposed.filter(item=>currentIds.has(item.id)).map(item=>item.id));const removed=currentPlan.filter(item=>!claimedIds.has(item.id))
 for(const item of proposed){
  if(!currentIds.has(item.id)){const sameTitle=removed.find(saved=>saved.title===item.title&&!claimedIds.has(saved.id));item.id=sameTitle?.id??crypto.randomUUID();claimedIds.add(item.id)}
  item.day=['월','화','수','목','금','토','일'][item.dayIndex]
 }
 const ids=new Set<string>();let invalid=''
 for(const item of proposed){
  if(ids.has(item.id)){invalid='중복된 계획 항목이 있어요.';break}ids.add(item.id)
  if(item.start>=item.end||toMinutes(item.start)<300||toMinutes(item.end)>1380){invalid='계획 시간이 허용 범위를 벗어났어요.';break}
  if(schedule.some(block=>block.days?.includes(item.dayIndex)&&block.start&&block.end&&overlaps(item.start,item.end,block.start,block.end))){invalid='수정한 시간이 확정 일정과 겹쳐요. 다른 시간을 알려주세요.';break}
  if(proposed.some(other=>other.id!==item.id&&other.dayIndex===item.dayIndex&&overlaps(item.start,item.end,other.start,other.end))){invalid='수정한 계획끼리 시간이 겹쳐요. 다른 시간을 알려주세요.';break}
 }
 if(invalid)return new Response(JSON.stringify({assistant_message:invalid,proposed_plan:[],changes:[],warnings:[invalid],needs_clarification:true,response_id:result.id}),{headers:jsonHeaders})
 return new Response(JSON.stringify({...parsed,response_id:result.id}),{headers:jsonHeaders})
}catch(error){console.error(error);return new Response(JSON.stringify({error:'onju_plan_revision_agent_failed'}),{status:500,headers:jsonHeaders})}})
