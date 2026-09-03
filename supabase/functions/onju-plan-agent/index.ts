const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const itemProperties={dayIndex:{type:'integer',minimum:0,maximum:6},start:{type:'string',pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'},end:{type:'string',pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'},title:{type:'string'},tinyStart:{type:'string'},fallback:{type:'string'},rationale:{type:'string'}}
const schema={type:'object',additionalProperties:false,required:['assistant_message','items','warnings'],properties:{assistant_message:{type:'string'},items:{type:'array',maxItems:14,items:{type:'object',additionalProperties:false,required:Object.keys(itemProperties),properties:itemProperties}},warnings:{type:'array',items:{type:'string'}}}}
type TimeBlock={days?:number[];start?:string;end?:string;title?:string}
type PlanItem={dayIndex:number;start:string;end:string;title:string;tinyStart:string;fallback:string;rationale:string}
const toMinutes=(time:string)=>{const[h,m]=time.split(':').map(Number);return h*60+m}
const overlaps=(aStart:string,aEnd:string,bStart:string,bEnd:string)=>toMinutes(aStart)<toMinutes(bEnd)&&toMinutes(bStart)<toMinutes(aEnd)

Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});try{
 const apiKey=Deno.env.get('OPENAI_API_KEY');if(!apiKey)throw new Error('OPENAI_API_KEY is not configured')
 const body=await req.json();const goal=body.goalCard??{};const schedule:Array<TimeBlock>=Array.isArray(body.scheduleBlocks)?body.scheduleBlocks:[]
 if(!goal.outcome||!Array.isArray(goal.weeklyActions)||goal.weeklyActions.length===0)return new Response(JSON.stringify({error:'goal_card_incomplete'}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}})
 const instructions=`당신은 온주의 주간 계획 배치 전문가다. 한국시간(Asia/Seoul) 기준으로 완성된 목표 카드의 주간 행동을 실제 시간 지도 빈칸에 배치한다.
- 주간 행동의 frequencyPerWeek를 가능한 한 정확히 충족한다.
- 근무, 이동, 반복 일정, 회복 시간과 절대 겹치지 않는다. 기존 블록 전후로 가능하면 15분 여유를 둔다.
- 사용자가 지정한 preferredDays가 있으면 우선하되 충돌하면 다른 날에 분산한다.
- 05:00 이전과 23:00 이후에는 배치하지 않는다.
- 같은 목표 행동을 연속된 날에 과도하게 몰지 말고 회복을 고려한다.
- title은 구체적인 정상 실행, tinyStart는 2분 안에 시작할 행동, fallback은 피곤하거나 시간이 없을 때의 축소 실행이다.
- rationale에는 왜 이 요일과 시간인지 한 문장으로 설명한다.
- 목표 카드에 없는 성과나 수치를 새로 만들지 않는다.`
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini',store:true,instructions,input:JSON.stringify({goal_card:goal,confirmed_schedule_blocks:schedule}),text:{format:{type:'json_schema',name:'onju_weekly_plan',strict:true,schema}}})})
 if(!response.ok)throw new Error(`OpenAI request failed: ${response.status}`)
 const result=await response.json();const outputText=result.output?.flatMap((item:{content?:{type:string;text?:string}[]})=>item.content??[]).find((part:{type:string})=>part.type==='output_text')?.text
 if(!outputText||typeof result.id!=='string')throw new Error('No structured output returned')
 const parsed=JSON.parse(outputText);const accepted:PlanItem[]=[];const rejected:string[]=[]
 for(const item of (Array.isArray(parsed.items)?parsed.items:[]) as PlanItem[]){
  const validRange=item.start<item.end&&toMinutes(item.start)>=300&&toMinutes(item.end)<=1380
  const scheduleConflict=schedule.some(block=>block.days?.includes(item.dayIndex)&&block.start&&block.end&&overlaps(item.start,item.end,block.start,block.end))
  const planConflict=accepted.some(saved=>saved.dayIndex===item.dayIndex&&overlaps(item.start,item.end,saved.start,saved.end))
  if(!validRange||scheduleConflict||planConflict){rejected.push(`${['월','화','수','목','금','토','일'][item.dayIndex]} ${item.start} ${item.title}`);continue}
  accepted.push(item)
 }
 const warnings=[...(Array.isArray(parsed.warnings)?parsed.warnings:[]),...(rejected.length?[`기존 일정과 겹치는 ${rejected.length}개 제안을 제외했어요.`]:[])]
 return new Response(JSON.stringify({...parsed,items:accepted,warnings,response_id:result.id}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
}catch(error){console.error(error);return new Response(JSON.stringify({error:'onju_plan_agent_failed'}),{status:500,headers:{...corsHeaders,'Content-Type':'application/json'}})}})
