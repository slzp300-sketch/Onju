import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nextLocalReminder, buildReminderCalendar, buildReminderNotice, claimReminderDelivery, isReminderQuietTime } from '../../logs/sites/onju-web-mvp/web-mvp/src/dailyReminder.ts'
import { inferEnergy, startCheckIn, advanceCheckIn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-daily/state.ts'
import { siteEnglish } from '../../logs/sites/onju-web-mvp/web-mvp/src/i18n/siteCopy.ts'
import { siteExtraEnglish } from '../../logs/sites/onju-web-mvp/web-mvp/src/i18n/siteExtraCopy.ts'
import { koKR } from '../../logs/sites/onju-web-mvp/web-mvp/src/i18n/catalog.ko-KR.ts'
import { enUS } from '../../logs/sites/onju-web-mvp/web-mvp/src/i18n/catalog.en-US.ts'

test('shared regional contracts and settings stay in parity across both working trees',()=>{
  const differences=[]
  for(const path of ['src/regionalContext.ts','src/useRegionalContext.ts','src/RegionalSettings.tsx','src/regionalSettings.css','src/i18n/index.ts','src/i18n/catalog.en-US.ts','src/i18n/catalog.ko-KR.ts']) {
    const root=readFileSync(new URL('../'+path,import.meta.url),'utf8').replaceAll('\r\n','\n')
    const site=readFileSync(new URL('../../logs/sites/onju-web-mvp/web-mvp/'+path,import.meta.url),'utf8').replaceAll('\r\n','\n')
    if(site!==root)differences.push(path)
  }
  assert.deepEqual(differences,[], 'Shared regional files differ: '+differences.join(', '))
})

test('local reminders handle DST gaps, repeated hours, offsets and Korean compatibility',()=>{
  for(const [zone,time,now,expected] of [
    ['America/New_York','02:30','2026-03-08T06:00:00Z','2026-03-09T06:30:00.000Z'],
    ['America/New_York','01:30','2026-11-01T05:31:00Z','2026-11-01T06:30:00.000Z'],
    ['America/Los_Angeles','08:00','2026-09-15T14:59:59Z','2026-09-15T15:00:00.000Z'],
    ['Asia/Seoul','06:30','2026-09-14T21:30:00Z','2026-09-15T21:30:00.000Z'],
    ['Australia/Sydney','08:00','2026-10-03T16:30:00Z','2026-10-03T21:00:00.000Z'],
  ]) assert.equal(nextLocalReminder(time,zone,new Date(now)).toISOString(),expected)
})

test('reminder quiet hours and delivery deduplication use the selected local date',()=>{
  const preferences={timezone:'America/New_York',morningEnabled:true,morningTime:'08:00',closingEnabled:true,closingTime:'21:00'}
  assert.equal(isReminderQuietTime(preferences,new Date('2026-09-15T03:00:00Z')),true)
  assert.equal(isReminderQuietTime(preferences,new Date('2026-09-15T12:00:00Z')),false)
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}
  assert.equal(claimReminderDelivery(storage,'test','morning',new Date('2026-11-01T05:30:00Z'),'America/New_York'),true)
  assert.equal(claimReminderDelivery(storage,'test','morning',new Date('2026-11-01T06:30:00Z'),'America/New_York'),false)
  const dashboard={date:'2026-09-15',preferences,items:[],itemLogs:[],checkIns:[]}
  const notice=buildReminderNotice(dashboard,'morning',new Date('2026-09-15T12:01:00Z'),'https://example.test','browser','en-GB')
  assert.ok(notice)
  assert.doesNotMatch(notice.title+notice.body,/[가-힣]/)
  assert.equal(buildReminderNotice({...dashboard,date:'2026-09-14'},'morning',new Date('2026-09-15T12:01:00Z')),null)
})

test('calendar reminders keep local wall time across DST and contain an explicit alarm',()=>{
  const calendar=buildReminderCalendar({timezone:'America/New_York',morningEnabled:true,morningTime:'08:00',closingEnabled:false,closingTime:'21:00'},new Date('2026-03-07T12:00:00Z'),'https://example.test','en-GB')
  assert.match(calendar,/DTSTART;TZID=America\/New_York:20260307T080000/)
  assert.match(calendar,/RRULE:FREQ=DAILY/)
  assert.match(calendar,/BEGIN:VALARM\r\nTRIGGER:PT0M/)
  assert.doesNotMatch(calendar,/[가-힣]/)
})

test('English check-in choices preserve evidence requirements and distinguish negated energy',()=>{
  assert.equal(inferEnergy('not great'),2)
  assert.equal(inferEnergy('Feeling good'),4)
  const routine={id:'step',title:'Write a customer hypothesis',planningStyle:'progression',completionEvidence:'One written hypothesis'}
  const start=startCheckIn('closing',[routine],'en-GB')
  assert.doesNotMatch(start.pendingQuestion,/[가-힣]/)
  const next=advanceCheckIn(start,start.choices[0],[routine],'en-GB')
  assert.equal(next.itemUpdate,null)
  assert.equal(next.progress.collected.pendingEvidenceRoutineId,'step')
  const done=advanceCheckIn(next.progress,'Created a hypothesis document',[routine],'en-GB')
  assert.equal(done.itemUpdate.status,'completed')
  assert.equal(done.itemUpdate.evidence,'Created a hypothesis document')
})

test('each developer-authored siteCopy call has an English catalog entry',()=>{
  const common=new Map(Object.entries(koKR).map(([key,value])=>[value.replace(/\s+/g,' ').trim(),enUS[key]]))
  const missing=[]
  for(const file of ['App.tsx','ProductApp.tsx','ScheduleSetup.tsx','PilotFeedback.tsx']){
    const source=readFileSync(new URL('../../logs/sites/onju-web-mvp/web-mvp/src/'+file,import.meta.url),'utf8')
    for(const match of source.matchAll(/siteCopy\(("(?:\\.|[^"\\])*")\)/g)){
      const key=JSON.parse(match[1]),value=siteExtraEnglish[key]??siteEnglish[key]??common.get(key)
      if(value===undefined||/[가-힣]/.test(value))missing.push({file,key})
    }
  }
  assert.deepEqual(missing,[])
})
