import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { agentExpressionRules, agentFallbackCopy } from '../../supabase/functions/onju-agent-v2/promptLanguage.ts'
import { conversationPrompt } from '../../supabase/functions/onju-agent-v2/prompt.ts'
import { emptyBrief, parseGoalPeriod, updateGoalBrief } from '../../supabase/functions/onju-agent-v2/goalBrief.ts'
import { requestedGoalAreas, requestedSingleSession } from '../../supabase/functions/onju-agent-v2/goal.ts'
import { initialGoalMessage, synchronizeExecution } from '../../supabase/functions/onju-agent-v2/goalExecution.ts'
import { effortPolicy } from '../../supabase/functions/onju-agent-v2/goalEffort.ts'
import { draftChoices, draftMessage, reviseGoal } from '../../supabase/functions/onju-agent-v2/goalRevision.ts'
import { loadState, runAgentTurn } from '../../supabase/functions/onju-agent-v2/agent.ts'
import { isScheduleComplete } from '../../supabase/functions/onju-agent-v2/state.ts'
import { startCheckIn, advanceCheckIn, completionMessage } from '../../supabase/functions/onju-daily/state.ts'
import { buildWeeklyInsights } from '../../supabase/functions/onju-daily/insights.ts'
import { buildStructureProposal } from '../../supabase/functions/onju-daily/structure.ts'
import { buildTrialReview } from '../../supabase/functions/onju-daily/trialReview.ts'

const us = { locale:'en-US', countryCode:'US', timeZone:'America/New_York', currencyCode:'USD', weekStartsOn:0 }
const korean = /[가-힣]/

test('common judgment policy and locale expression packs stay separate', () => {
  const promptSource=readFileSync(resolve('../supabase/functions/onju-agent-v2/prompt.ts'),'utf8')
  assert.match(promptSource,/COMMON_CONVERSATION_POLICY/)
  assert.match(promptSource,/agentExpressionRules/)
  assert.doesNotMatch(agentExpressionRules('en-US'),korean)
  assert.match(agentExpressionRules('ko-KR'),korean)
  assert.doesNotMatch(agentFallbackCopy('en-US').rhythmPurpose,korean)
  const prompt=conversationPrompt({now:'Sunday, September 13, 2026 at 11:30 PM',phase:'goals',regionalContext:us,facts:{},openings:[]})
  assert.match(prompt,/English expression rules/)
  assert.match(prompt,/locale=en-US/)
})

test('English goal facts are parsed without forcing a Korean vocabulary', () => {
  assert.deepEqual(parseGoalPeriod('three months'),{label:'three months',weeks:13})
  assert.deepEqual(requestedGoalAreas('I want to improve work, health, and faith'),['work','health','faith'])
  assert.deepEqual(requestedSingleSession('I want to read 3 times a week for 20 minutes each'),{frequency:3,minutes:20})
  const effort=effortPolicy(['I can use 20 minutes per day and 60 minutes per week'],[],[],'en-US')
  assert.equal(effort.dailyCapacities[0],20)
  assert.equal(effort.weekly,60)
  assert.doesNotMatch(effort.note,korean)
  const brief=updateGoalBrief(emptyBrief(),{
    period:'three months',
    areas:['fitness'],
    objectives:[{area:'fitness',result:'finish a 5K in under 30 minutes'}],
  },'For three months, I want my fitness goal to be: finish a 5K in under 30 minutes.')
  assert.equal(brief.period.weeks,13)
  assert.equal(brief.objectives[0].result,'finish a 5K in under 30 minutes')
})

test('English schedule-completion phrases move the conversation forward', () => {
  assert.equal(isScheduleComplete("That's all for my schedule"),true)
  assert.equal(isScheduleComplete("Let's move on to goals"),true)
  assert.equal(isScheduleComplete('My Saturday schedule is not fixed'),false)
})

test('server-rendered English goal drafts and derived fields contain no Korean copy', () => {
  const card=synchronizeExecution({
    category:'fitness',outcome:'Finish a 5K in under 30 minutes',identity:'',deadline:'',baselineMetric:'',targetMetric:'Complete 80%',tinyStart:'',cue:'',environment:'',fallbackAction:'',recoveryRule:'',reviewCycle:'',durationWeeks:13,
    weeklyActions:[{title:'Run training session',frequencyPerWeek:3,durationMinutes:30,preferredDays:[0,2,5]}],
    execution:{measurement:'routine_completion',completionPercent:80,reviewEveryWeeks:1,progressStrategy:'Measure the first week, then adjust distance and pace from the actual result.',actions:[{completionCriterion:'Save the completed workout',minimumAction:'Put on running shoes and step outside',minimumMinutes:2,goalResult:'Finish a 5K in under 30 minutes',steps:['Open the planned workout','Complete the assigned run','Save time and distance']}]}},
  'en-US')
  assert.doesNotMatch(JSON.stringify(card),korean)
  assert.doesNotMatch(initialGoalMessage(card,[],'en-US'),korean)
  const revision=reviseGoal(card,[{field:'frequencyPerWeek',actionIndex:0,text:null,number:2,days:null,evidence:'2 times per week'}],'Change it to 2 times per week.','en-US')
  const draft={id:'draft-1',presentedMessageId:'message-1',...revision,baseLabel:'confirmed goal'}
  assert.equal(revision.card.weeklyActions[0].frequencyPerWeek,2)
  assert.doesNotMatch(draftMessage(draft,'en-US'),korean)
  assert.doesNotMatch(JSON.stringify(draftChoices(draft,'en-US')),korean)
})

test('English daily check-in remains natural across all turns', () => {
  let progress=startCheckIn('closing','Read one chapter','en-US')
  assert.match(progress.pendingQuestion,/Read one chapter/)
  assert.doesNotMatch(progress.pendingQuestion,korean)
  let next=advanceCheckIn(progress,'Completed it','Read one chapter','en-US')
  progress=next.progress
  next=advanceCheckIn(progress,'Feeling drained','Read one chapter','en-US')
  assert.equal(next.energy,2)
  progress=next.progress
  next=advanceCheckIn(progress,'A late meeting got in the way','Read one chapter','en-US')
  assert.equal(next.progress.status,'completed')
  assert.equal(next.itemStatus,'completed')
  assert.doesNotMatch(completionMessage('closing',next.itemStatus,'en-US'),korean)
})

test('English weekly insight, structure proposal, and trial review contain no Korean fallback copy', () => {
  const routines=[
    {id:'r1',title:'Read · 20 min',dayIndex:0,grade:'normal'},
    {id:'r2',title:'Read · 20 min',dayIndex:2,grade:'normal'},
    {id:'r3',title:'Read · 20 min',dayIndex:4,grade:'normal'},
  ]
  const logs=[
    {routineItemId:'r1',logDate:'2026-08-31',status:'missed'},
    {routineItemId:'r2',logDate:'2026-09-02',status:'missed'},
    {routineItemId:'r3',logDate:'2026-09-04',status:'missed'},
  ]
  const insights=buildWeeklyInsights('2026-09-06',routines,logs,[],'en-US')
  assert.equal(insights.signals[0].type,'missed_streak')
  assert.doesNotMatch(JSON.stringify(insights),korean)
  const proposal=buildStructureProposal('2026-09-06',insights.signals,[{key:'read',title:'Read · 20 min',start:'21:00',dependencyKinds:[]}],['Late meetings'],[],'en-US')
  assert.equal(proposal.dependencyKind,'schedule')
  assert.equal(proposal.options.length,3)
  assert.doesNotMatch(JSON.stringify(proposal),korean)
  const review=buildTrialReview('2026-09-08',{
    id:'t1',routineKey:'read',strategyId:proposal.options[0].id,strategy:proposal.options[0].strategy,
    dependencyKind:'schedule',startedOn:'2026-09-06',trialUntil:'2026-09-20',extensionCount:0,
  },[{id:'r1',routineKey:'read',title:'Read · 20 min',dayIndex:0}],[],'en-US')
  assert.equal(review.recommendation,'pending')
  assert.doesNotMatch(JSON.stringify(review),korean)
})

test('English multi-turn goal conversation uses model judgment without Korean deterministic replies', async () => {
  const responses=[
    {paragraphs:['A three-month window is long enough to test a steady approach without locking you into a full year.'],question:'What result would make those three months feel successful?',choices:[]},
    {paragraphs:['Finishing a 5K under 30 minutes gives us a clear outcome to design around.'],question:'What is your current 5K time or longest comfortable run?',choices:[]},
  ]
  let call=0
  const deps={now:'Sunday, September 13, 2026 at 11:30 PM',regionalContext:us,request:async body=>{
    assert.match(body.instructions,/English expression rules/)
    const reply=responses[call++]
    return {id:`resp-${call}`,model:'mock',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name:'respond',call_id:`call-${call}`,arguments:JSON.stringify({
      focus:'goals',intent:'share_fact',move:'ask',confidence:'high',expects_reply:true,open_threads:['goal_result'],remember:[],forget:[],goal_outcome:'',goal_draft:null,
      paragraphs:reply.paragraphs,bullets:[],question:reply.question,choices:reply.choices,
    })}]}
  }}
  let state=loadState({stage:5})
  let result=await runAgentTurn(state,'I want to work on a fitness goal for three months.',deps)
  assert.doesNotMatch(result.assistant_message,korean)
  assert.match(result.assistant_message,/three months/i)
  state=result.state
  result=await runAgentTurn(state,'I want to finish a 5K in under 30 minutes.',deps)
  assert.doesNotMatch(result.assistant_message,korean)
  assert.match(result.assistant_message,/5K/)
  assert.equal(call,2)
})

test('English bounded fallback stays localized when model formatting repeatedly fails', async () => {
  let calls=0
  const deps={now:'Sunday, September 13, 2026 at 11:30 PM',regionalContext:us,request:async()=>({
    id:`bad-${++calls}`,model:'mock',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name:'respond',call_id:`bad-call-${calls}`,arguments:JSON.stringify({
      focus:'goals',intent:'share_fact',move:'ask',confidence:'low',expects_reply:true,open_threads:[],remember:[],forget:[],goal_outcome:'',goal_draft:null,
      paragraphs:[],bullets:[],question:'',choices:[],
    })}],
  })}
  const result=await runAgentTurn(loadState({stage:5}),'I want to set a goal.',deps)
  assert.equal(calls,5)
  assert.doesNotMatch(result.assistant_message,korean)
  assert.match(result.assistant_message,/How long/i)
})
