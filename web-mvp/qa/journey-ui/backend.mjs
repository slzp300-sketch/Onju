// Synthetic transport only. Never imports a provider, database, credentials, or production data.
// Scripted replies validate UI/state plumbing, NOT natural-language reasoning quality.
import {applyWorkspaceCommand,emptyWorkspace} from '../../../logs/sites/onju-web-mvp/supabase/functions/_shared/planWorkspace.ts'
export function createJourneyBackend() {
  const sessions = new Map(), requests = []
  let failSave = false, failChat = false, releaseChat
  const empty = () => ({ category:'기타',outcome:'',identity:'',durationWeeks:0,deadline:'',baselineMetric:'',targetMetric:'',weeklyActions:[],tinyStart:'',cue:'',environment:'',fallbackAction:'',recoveryRule:'',reviewCycle:'' })
  const backend = {
    sessions, requests,
    failNextSave() { failSave = true },
    failNextChat() { failChat = true },
    holdChat() { backend.chatWait = new Promise(done => { releaseChat = done }); return () => { releaseChat(); backend.chatWait = null } },
    async dispatch(name, body) {
      requests.push({ name, body: structuredClone(body) })
      const { sessionId, sessionToken } = body
      if (!sessionId || !sessionToken) throw new Error('fixture requires owned session')
      let s = sessions.get(sessionId)
      if (s && s.token !== sessionToken) throw new Error('session_forbidden')
      if (s?.deleted) throw new Error('session_revoked')
      if (!s) { s = { token:sessionToken, turn:0, messages:[], card:empty(), plan:[], draft:null, checkIns:[] }; sessions.set(sessionId,s) }
      const ko = body.regionalContext?.locale?.startsWith('ko') ?? false
      if (name === 'onju-telemetry') return { ok:true, summary:null }
      if(name==='onju-workspace') {
        s.workspace??=emptyWorkspace();s.workspaceRevision??=0
        if(body.action==='load')return {workspace:s.workspace,revision:s.workspaceRevision}
        if(body.action==='mutate'){
          if(s.workspace.receipts.includes(body.command.id))return {workspace:s.workspace,revision:s.workspaceRevision}
          if(body.expectedRevision!==s.workspaceRevision)return {error:'workspace_conflict'}
          if(failSave){failSave=false;return {error:'workspace_unavailable'}}
          const next=applyWorkspaceCommand(s.workspace,body.command)
          if(next!==s.workspace){s.workspace=next;s.workspaceRevision++}
          return {workspace:s.workspace,revision:s.workspaceRevision}
        }
        throw new Error('unsupported_workspace_action')
      }
      if (/^onju-memory(?:-v2)?$/.test(name)) {
        if (body.action === 'load') return { state:{ stage:0,messages:s.messages,blocks:[],pending_blocks:[],day_bounds:[],goal:s.card.outcome,reason:'',obstacle:'',goal_card:s.card,pending_plan:[],plan_revision_history:[],agent_v2_context:{draft:s.draft,artifactVersions:{goalCardVersion:3,planVersion:3,roadmapVersion:2}} } }
        if (body.action === 'save') return { ok:true }
        if (body.action === 'save_plan_revision') {
          if (failSave) { failSave=false; throw new Error('fixture_save_failed') }
          s.plan=structuredClone(body.plan); if(body.goalCard) s.card=body.goalCard
          return { ok:true }
        }
        if (body.action === 'export_session') return { snapshot:{version:1,sessionId,session:{messages:s.messages,goal_card:s.card,plan:s.plan,plan_workspace:s.workspace},collections:{checkIns:s.checkIns}} }
        if (body.action === 'delete_session') { s.deleted=true; s.messages=[];s.plan=[];s.checkIns=[];s.workspace=emptyWorkspace();return {deleted:true} }
        if (body.action === 'enroll_public_beta') return {enrolled:true}
        throw new Error('Unexpected fixture memory action: '+body.action)
      }
      if (/^onju-agent-v[23]$/.test(name)) {
        if (backend.chatWait) await backend.chatWait
        if (failChat) { failChat=false; return {error:'public_budget_exhausted'} }
        s.turn++
        const id='fixture-message-'+s.turn
        const card={...empty(),outcome:ko?'책 3권 읽기':'Read 3 books',durationWeeks:12,baselineMetric:ko?'현재 0권':'0 books completed',targetMetric:ko?'완독 3권':'3 books completed',weeklyActions:[{title:ko?'20분 읽고 한 줄 기록하기':'Read for 20 minutes and note one idea',frequencyPerWeek:3,durationMinutes:20,preferredDays:[0,2,4],planningStyle:'repeat'}]}
        let text
        if (s.turn===1) text=ko?'책 3권을 읽고 싶으시군요.\n\n**언제까지 읽고 싶고, 지금은 얼마나 읽으셨나요?**':'You want to read 3 books.\n\n**By when, and how much have you already read?**'
        else if (!body.confirmation) { s.draft={id:'fixture-draft',card,presentedMessageId:id};text=ko?'12주, 현재 0권을 기준으로 정리했어요. 주말 시간은 유동적으로 남겨둘게요.\n\n평일에 20분씩 읽는 초안을 확인해 주세요.':'I have noted 12 weeks and 0 books completed. Weekends can stay flexible.\n\nReview this draft: read for 20 minutes on weekdays.' }
        else { if(body.confirmation.draftId!==s.draft?.id) throw new Error('draft_changed');s.card=card;s.draft=null;text=ko?'승인한 목표로 첫 주 실행안을 만들 수 있어요.':'Your approved goal is ready for a first-week plan.' }
        s.messages.push({id:'user-'+id,role:'user',text:body.message},{id,role:'assistant',text})
        return { assistant_message:text,assistant_message_id:id,suggestions:[],needs_clarification:s.turn===1,state:{stage:0,blocks:[],dayBounds:[],goalCard:s.card,goalDraft:s.draft,dialogue:{focus:'goals',lastIntent:'share_fact',lastMove:'ask',confidence:'high',expectsReply:true,openThreads:[],memory:[]},dailyCheckIns:[]} }
      }
      if (/^onju-plan-agent(?:-v2)?$/.test(name)) return { assistant_message:'Synthetic first week',items:[0,2,4].map(dayIndex=>({actionIndex:0,planningStyle:'repeat',weekIndex:1,weekStart:'2026-09-14',progressIndex:1,sequenceIndex:1,milestoneId:'',dependsOnSequenceIndex:null,inputArtifact:ko?'선택한 책':'Selected book',dayIndex,start:'',end:'',title:s.card.weeklyActions[0].title,completionEvidence:ko?'한 줄 기록':'One written note',tinyStart:'',fallback:'',rationale:''})),project_plan:null,warnings:[],response_id:'fixture-plan' }
      if (/^onju-daily(?:-v2)?$/.test(name)) {
        if(body.action==='start_checkin') s.checkIns=[{id:'fixture-checkin',date:'2026-09-15',type:body.checkType,status:'active',step:0,collected:{},pendingQuestion:ko?'오늘 에너지는 어떤가요?':'How is your energy today?',choices:[ko?'괜찮아요':'Good'],completedAt:null}]
        else if(body.action==='answer_checkin') {s.checkIns[0]={...s.checkIns[0],status:'completed',step:1,collected:{answer:body.answer},pendingQuestion:'',choices:[],completedAt:'2026-09-15T09:00:00Z'} }
        else if(!['sync_plan','load'].includes(body.action)) throw new Error('Unexpected fixture daily action: '+body.action)
        const dashboard={date:'2026-09-15',dayIndex:1,preferences:{timezone:body.regionalContext?.timeZone??'UTC',morningEnabled:true,morningTime:'08:00',closingEnabled:true,closingTime:'21:00'},items:[],itemLogs:[],dailyLog:null,checkIns:s.checkIns,routines:[],yesterday:null,dailyAdaptation:null,adaptationHistory:[],weeklyReview:null,weeklyCalibration:null,structureProposal:null,activeTrials:[],weekly:{startDate:'2026-09-14',endDate:'2026-09-20',scheduled:3,completed:0,minimum:0,missed:0,observedSkipped:0,exception:0,unrecorded:3,recordedDays:0,outcomeCount:0,adherenceRate:null,continuityRate:null,coverageRate:null,days:[],routines:[],signals:[],adaptations:[],adaptationSummary:{proposed:0,applied:0,dismissed:0,continued:0},adaptationMetrics:{totalProposed:0,reasonBreakdown:[],decided:0,applied:0,modified:0,continued:0,recovered:0,verdict:'collecting'},note:ko?'기록 수집 중':'Collecting records'}}
        return ['start_checkin','answer_checkin'].includes(body.action)?{dashboard,session:s.checkIns[0]}:dashboard
      }
      throw new Error('Unexpected fixture endpoint: '+name)
    },
    async fetch(url, init) {
      const parsed=new URL(String(url))
      if(!['onju.offline.invalid','127.0.0.1'].includes(parsed.hostname)||!parsed.pathname.startsWith('/functions/v1/')) throw new Error('Unexpected network request blocked')
      const name=parsed.pathname.split('/').at(-1)
      const value=await backend.dispatch(name,JSON.parse(init.body))
      if(value.error) return new Response(JSON.stringify(value),{status:429,headers:{'Content-Type':'application/json'}})
      if(init.headers?.Accept==='text/event-stream') {
        const event=(name,data)=>'event: '+name+'\ndata: '+JSON.stringify(data)+'\n\n'
        const stream=event('meta',{assistant_message_id:value.assistant_message_id})+event('delta',{text:value.assistant_message.slice(0,22)})+event('delta',{text:value.assistant_message.slice(22)})+event('complete',value)
        // Deliberately split inside Korean UTF-8/JSON/SSE fields to test incremental decoding.
        const bytes=new TextEncoder().encode(stream)
        return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close()}}),{headers:{'Content-Type':'text/event-stream'}})
      }
      return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
    },
  }
  return backend
}
