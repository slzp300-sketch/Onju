/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const headers={...cors,'Content-Type':'application/json'}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const times=/^([01]\d|2[0-3]):[0-5]\d$/
const labels=['생활 리듬','기본 생활','반복 일정','회복 시간','이번 주 일정','목표 협의']
type Block={days:number[];title:string;start:string;end:string;kind:'fixed'|'variable'|'recovery'}
type Bound={days:number[];wake:string;bedtime:string;variable:boolean}
type State={stage:number;messages:{id:string;role:string;text:string}[];blocks:Block[];day_bounds:Bound[];goal_card:Record<string,unknown>;agent_v2_events:unknown[];agent_v2_response_id?:string}
const emptyGoal={category:'기타',outcome:'',identity:'',durationWeeks:0,deadline:'',baselineMetric:'',targetMetric:'',weeklyActions:[],tinyStart:'',cue:'',environment:'',fallbackAction:'',recoveryRule:'두 번 연속 놓치지 않기',reviewCycle:'매주 실행률 확인 · 4주마다 조정'}
const cleanDays=(v:unknown):number[]=>[...new Set<number>((Array.isArray(v)?v:[]).filter((n):n is number=>Number.isInteger(n)&&n>=0&&n<=6))].sort()
const validBlock=(v:any):v is Block=>Boolean(v&&cleanDays(v.days).length>0&&typeof v.title==='string'&&v.title.trim()&&times.test(v.start)&&times.test(v.end)&&v.start<v.end&&['fixed','variable','recovery'].includes(v.kind))
const validBound=(v:any):v is Bound=>v&&cleanDays(v.days).length>0&&times.test(v.wake)&&times.test(v.bedtime)&&typeof v.variable==='boolean'
const normalizeBound=(v:any)=>({...v,wake:v?.wake==='24:00'?'00:00':v?.wake,bedtime:v?.bedtime==='24:00'?'00:00':v?.bedtime})
const mergeBlocks=(a:Block[],b:Block[])=>[...a,...b].filter((x,i,all)=>validBlock(x)&&all.findIndex(y=>y.title===x.title&&y.start===x.start&&y.end===x.end&&JSON.stringify(cleanDays(y.days))===JSON.stringify(cleanDays(x.days)))===i).map(x=>({...x,days:cleanDays(x.days),title:x.title.trim().slice(0,80)}))
const mergeBounds=(a:Bound[],b:Bound[])=>{const byDay=new Map<number,Bound>();for(const x of [...a,...b])if(validBound(x))for(const day of cleanDays(x.days))byDay.set(day,{...x,days:[day]});const grouped=new Map<string,Bound>();for(const [day,x] of byDay){const key=`${x.wake}|${x.bedtime}|${x.variable}`;const old=grouped.get(key);grouped.set(key,old?{...old,days:[...old.days,day]}:{...x})}return [...grouped.values()]}
const explicitDone=(s:string)=>/(없어|없습니다|전부|충분|다음으로|넘어가)/.test(s)
const stageCanAdvance=(stage:number,state:State,message:string)=>stage===0?[0,1,2,3,4,5,6].every(d=>state.day_bounds.some(x=>x.days.includes(d))):stage<5&&explicitDone(message)
function explicitDailyRhythm(text:string):Bound[]{
 if(!text.includes('매일'))return []
 const wake=text.match(/(\d{1,2})(?:시|:)(?:\s*(\d{1,2})분?)?[^\d]{0,12}(?:기상|일어나)/)
 const bed=text.match(/(\d{1,2})(?:시|:)(?:\s*(\d{1,2})분?)?[^\d]{0,12}(?:취침|잠들|자요|잡니다)/)
 const clock=(m:RegExpMatchArray)=>`${String(Number(m[1])%24).padStart(2,'0')}:${String(Number(m[2]??0)).padStart(2,'0')}`
 return wake&&bed?[{days:[0,1,2,3,4,5,6],wake:clock(wake),bedtime:clock(bed),variable:false}]:[]
}

const tools=[
 {type:'function',name:'save_day_bounds',description:'사용자가 직접 밝힌 요일별 기상·취침 시간이 모두 있는 항목만 저장한다. 하나라도 없으면 저장하지 말고 질문한다.',strict:true,parameters:{type:'object',additionalProperties:false,required:['bounds'],properties:{bounds:{type:'array',items:{type:'object',additionalProperties:false,required:['days','wake','bedtime','variable'],properties:{days:{type:'array',items:{type:'integer',minimum:0,maximum:6}},wake:{type:'string'},bedtime:{type:'string'},variable:{type:'boolean'}}}}}}},
 {type:'function',name:'save_schedule_blocks',description:'사용자가 시작과 종료를 명확히 말한 일정만 시간 지도에 저장한다.',strict:true,parameters:{type:'object',additionalProperties:false,required:['blocks'],properties:{blocks:{type:'array',items:{type:'object',additionalProperties:false,required:['days','title','start','end','kind'],properties:{days:{type:'array',items:{type:'integer',minimum:0,maximum:6}},title:{type:'string'},start:{type:'string'},end:{type:'string'},kind:{type:'string',enum:['fixed','variable','recovery']}}}}}}},
 {type:'function',name:'update_goal_card',description:'목표 협의 단계에서 현재까지 확정된 목표 카드를 전체 형태로 저장한다. 모르는 값은 빈 값으로 둔다.',strict:false,parameters:{type:'object',additionalProperties:false,required:['goal_card'],properties:{goal_card:{type:'object',additionalProperties:true}}}},
 {type:'function',name:'advance_stage',description:'현재 단계가 실제로 완료된 경우에만 다음 단계로 이동한다.',strict:true,parameters:{type:'object',additionalProperties:false,required:['reason'],properties:{reason:{type:'string'}}}},
 {type:'function',name:'offer_choices',description:'자유 서술보다 2~3개 선택지가 답변에 실질적으로 도움이 될 때만 화면 버튼을 제안한다.',strict:true,parameters:{type:'object',additionalProperties:false,required:['choices'],properties:{choices:{type:'array',minItems:2,maxItems:3,items:{type:'string'}}}}},
]

const prompt=(state:State,now:string)=>`당신은 온주, 한국시간 기준의 능동적인 AI 생활·계획 비서다. 현재 시각은 ${now}, 현재 단계는 ${labels[state.stage]}다.
사용자의 답을 먼저 정확히 짚고 판단한 뒤 필요한 저장 도구를 호출한다. 사실 저장은 반드시 도구로만 한다. 사용자가 말하지 않은 시간·요일·목표 수치를 추정해 저장하지 않는다. 명확한 사실은 사용자에게 저장 허락을 다시 묻지 말고 반드시 즉시 도구를 호출한 뒤 반영했다고 알린다. 도구 이름, 내부 필드명, 요일 숫자, true/false를 사용자에게 보여주지 않는다.
한 응답에서는 현재 단계의 빠진 정보 딱 하나만 질문한다. 아직 그 질문이 남았으면 다음 단계 이야기를 섞지 않는다. 모든 답변은 자연스러운 한국어 1~3개 짧은 문단으로 쓰고, 필요할 때만 짧은 목록을 쓴다. # 제목, 표, 별표 강조는 쓰지 않는다.
생활 리듬에서는 월~일의 기상과 취침을 먼저 완성한다. 요일 인덱스는 반드시 월=0, 화=1, 수=2, 목=3, 금=4, 토=5, 일=6이며 평일은 [0,1,2,3,4], 주말은 [5,6]이다. 평일/주말이 다르면 요일별로 구체적으로 물어본다. 사용자가 들쑥날쑥하거나 일정하지 않다고 말한 범위는 variable=true로 저장한다. 기본 생활부터는 명확한 시작·종료가 있는 일정을 즉시 저장하고 반영했다고 말한다. 일정 사이 빈 시간도 구체적으로 짚는다. 목표 협의에서는 기준선→목표 수치→기간→주간 행동→2분 시작→실행 단서→축소 실행 순으로 한 번에 하나씩 주도적으로 구체화한다.
현재 사실 데이터: ${JSON.stringify({dayBounds:state.day_bounds,blocks:state.blocks,goalCard:state.goal_card})}`

async function openai(apiKey:string,body:Record<string,unknown>){return fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body)})}

Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
 const apiKey=Deno.env.get('OPENAI_API_KEY'),url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!apiKey||!url||!key)throw new Error('missing environment')
 const body=await req.json();if(!uuid.test(body.sessionId??'')||typeof body.message!=='string'||!body.message.trim())return new Response(JSON.stringify({error:'invalid_request'}),{status:400,headers})
 const db=createClient(url,key,{auth:{persistSession:false}});const {data,error}=await db.from('web_mvp_agent_sessions').select('*').eq('session_id',body.sessionId).maybeSingle();if(error)throw error
 const state:State={stage:Math.min(5,Math.max(0,data?.stage??0)),messages:Array.isArray(data?.messages)?data.messages:[],blocks:Array.isArray(data?.blocks)?data.blocks:[],day_bounds:Array.isArray(data?.day_bounds)?data.day_bounds:[],goal_card:data?.goal_card&&Object.keys(data.goal_card).length?data.goal_card:{...emptyGoal},agent_v2_events:Array.isArray(data?.agent_v2_events)?data.agent_v2_events:[],agent_v2_response_id:data?.agent_v2_response_id}
 const initialStage=state.stage
 const userText=body.message.trim().slice(0,2000),suggestions:string[]=[];const events:any[]=[];const now=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'full',timeStyle:'short'}).format(new Date())
 const deterministicBounds=explicitDailyRhythm(userText);if(deterministicBounds.length){state.day_bounds=mergeBounds(state.day_bounds,deterministicBounds);events.push({at:new Date().toISOString(),tool:'validated_day_bounds_parser',args:{source:'explicit_daily_rhythm'},result:{ok:true}})}
 let request:Record<string,unknown>={model:'gpt-4.1-mini',store:true,instructions:prompt(state,now),input:userText,tools,parallel_tool_calls:false}
 if(state.agent_v2_response_id?.startsWith('resp_'))request.previous_response_id=state.agent_v2_response_id
 let final='',responseId=''
 for(let turn=0;turn<6;turn++){
  let res=await openai(apiKey,request);if(!res.ok&&request.previous_response_id){delete request.previous_response_id;res=await openai(apiKey,request)}if(!res.ok)throw new Error(`openai_${res.status}`)
  const out=await res.json();responseId=out.id;const calls=(out.output??[]).filter((x:any)=>x.type==='function_call');const text=(out.output??[]).flatMap((x:any)=>x.content??[]).find((x:any)=>x.type==='output_text')?.text
  if(!calls.length){final=typeof text==='string'?text.trim().replaceAll('**',''):'';break}
  const outputs=[]
  for(const call of calls){let args:any={};try{args=JSON.parse(call.arguments)}catch{args={}}let result:any={ok:false,error:'validation_failed'}
   if(call.name==='save_day_bounds'){const values=(Array.isArray(args.bounds)?args.bounds:[]).map(normalizeBound).filter(validBound);if(values.length){state.day_bounds=mergeBounds(state.day_bounds,values);result={ok:true,saved:values.length}}}
   if(call.name==='save_schedule_blocks'){const values=(Array.isArray(args.blocks)?args.blocks:[]).filter(validBlock);if(values.length){state.blocks=mergeBlocks(state.blocks,values);result={ok:true,saved:values.length}}}
   if(call.name==='update_goal_card'&&state.stage===5&&args.goal_card&&typeof args.goal_card==='object'){state.goal_card={...emptyGoal,...args.goal_card};result={ok:true}}
   if(call.name==='advance_stage'){if(stageCanAdvance(state.stage,state,userText)){state.stage++;result={ok:true,stage:state.stage}}else result={ok:false,error:'stage_is_incomplete'} }
   if(call.name==='offer_choices'){const values=(Array.isArray(args.choices)?args.choices:[]).filter((x:any)=>typeof x==='string'&&x.trim()).slice(0,3);if(values.length>=2){suggestions.splice(0,suggestions.length,...values);result={ok:true}}}
   events.push({at:new Date().toISOString(),tool:call.name,args,result});outputs.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)})
  }
  request={model:'gpt-4.1-mini',store:true,previous_response_id:out.id,input:outputs,tools,parallel_tool_calls:false}
 }
 if(!final)throw new Error('no_final_text')
 if(state.stage===0&&[0,1,2,3,4,5,6].every(d=>state.day_bounds.some(x=>x.days.includes(d)))){state.stage=1;events.push({at:new Date().toISOString(),tool:'validated_stage_transition',args:{from:0},result:{ok:true,stage:1}})}
 else if(state.stage===initialStage&&state.stage>0&&state.stage<5&&explicitDone(userText)){state.stage++;events.push({at:new Date().toISOString(),tool:'validated_stage_transition',args:{from:initialStage},result:{ok:true,stage:state.stage}})}
 state.messages=[...state.messages,{id:crypto.randomUUID(),role:'user',text:userText},{id:crypto.randomUUID(),role:'assistant',text:final}].slice(-100)
 const payload={session_id:body.sessionId,stage:state.stage,messages:state.messages,blocks:state.blocks,pending_blocks:[],day_bounds:state.day_bounds,goal_card:state.goal_card,goal:String(state.goal_card.outcome??''),reason:String(state.goal_card.identity??''),obstacle:String(state.goal_card.recoveryRule??''),agent_v2_response_id:responseId,agent_v2_events:[...state.agent_v2_events,...events].slice(-200),agent_v2_suggestions:suggestions,agent_v2_version:2,updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+2592e6).toISOString()}
 const {error:saveError}=await db.from('web_mvp_agent_sessions').upsert(payload,{onConflict:'session_id'});if(saveError)throw saveError
 return new Response(JSON.stringify({assistant_message:final,suggestions,needs_clarification:state.stage===0&&![0,1,2,3,4,5,6].every(d=>state.day_bounds.some(x=>x.days.includes(d))),response_id:responseId,state:{stage:state.stage,blocks:state.blocks,dayBounds:state.day_bounds,goalCard:state.goal_card}}),{headers})
}catch(error){console.error(error);return new Response(JSON.stringify({error:'onju_agent_v2_failed'}),{status:500,headers})}})
