import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import { DEFAULT_REGIONAL_CONTEXT as korea, loadRegionalContext, saveRegionalContext, detectedDefaults, REGIONAL_SETTINGS_KEY, calendarDateLabel, regionalDateKey, regionalWeekRange, orderedWeekdayIndices, orderWeeklyItems } from '../src/regionalContext.ts'
import { cleanRegionalContext, regionalDateKey as serverDate } from '../../supabase/functions/_shared/onjuRegionalContext.ts'

const descriptors = Object.fromEntries(['navigator', 'localStorage', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
function browser(language = 'en-US') {
  const store = new Map()
  Object.defineProperty(globalThis, 'navigator', { configurable:true, value:{language} })
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{getItem:key=>store.get(key)??null, setItem:(key,value)=>store.set(key,value)} })
  Object.defineProperty(globalThis, 'window', { configurable:true, value:{dispatchEvent(){}} })
  return store
}
afterEach(() => { for (const [key, descriptor] of Object.entries(descriptors)) { if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key] } })

test('language never establishes country, currency or timezone residence', () => {
  for (const locale of ['ko-KR', 'en-US', 'en-GB', 'en-CA', 'en-AU', 'zh-CN']) {
    browser(locale)
    const detected = detectedDefaults()
    assert.equal(detected.countryCode,'ZZ')
    assert.equal(detected.currencyCode,'XXX')
    assert.equal(detected.timeZone,Intl.DateTimeFormat().resolvedOptions().timeZone)
    assert.equal(detected.locale,locale === 'zh-CN' ? 'en-US' : locale)
  }
})

test('saved preferences beat automatic detection and a conflicting legacy copy on reload', () => {
  const store = browser('ko-KR')
  const manual = { ...korea, locale:'en-GB', countryCode:'CA', currencyCode:'CAD', timeZone:'America/Vancouver', weekStartsOn:0 }
  saveRegionalContext(manual)
  store.set('onju-regional-context-v1',JSON.stringify(korea))
  assert.equal(store.has(REGIONAL_SETTINGS_KEY),true)
  assert.deepEqual(loadRegionalContext(),manual)
  assert.deepEqual(cleanRegionalContext(loadRegionalContext()),manual)
})

test('legacy preferences survive while corrupt storage falls back without a country guess', () => {
  const store = browser('en-GB')
  store.set('onju-regional-context-v1',JSON.stringify(korea))
  assert.deepEqual(loadRegionalContext(),korea)
  store.set(REGIONAL_SETTINGS_KEY,'not json')
  assert.equal(loadRegionalContext().countryCode,'ZZ')
})

for (const [zone, instant, expected] of [
  ['Asia/Seoul','2026-09-14T15:00:00Z','2026-09-15'],
  ['America/New_York','2026-09-15T03:59:59Z','2026-09-14'],
  ['America/New_York','2026-09-15T04:00:00Z','2026-09-15'],
  ['America/Los_Angeles','2026-09-15T06:59:59Z','2026-09-14'],
  ['America/Phoenix','2026-03-08T10:00:00Z','2026-03-08'],
  ['Europe/London','2026-03-29T01:00:00Z','2026-03-29'],
  ['America/Toronto','2026-11-01T05:30:00Z','2026-11-01'],
  ['America/Toronto','2026-11-01T06:30:00Z','2026-11-01'],
  ['Australia/Sydney','2026-10-03T16:00:00Z','2026-10-04'],
  ['Australia/Perth','2026-10-03T16:00:00Z','2026-10-04'],
]) test(`browser/server local date agreement: ${zone} at ${instant}`, () => {
  const context={...korea,timeZone:zone,locale:'en-GB',countryCode:'ZZ'}
  assert.equal(regionalDateKey(context,new Date(instant)),expected)
  assert.equal(serverDate(cleanRegionalContext(context),new Date(instant)),expected)
})

test('Sunday/Monday week ranges are calendar-based across DST and year boundaries', () => {
  const context={...korea,timeZone:'America/New_York'}
  assert.deepEqual(regionalWeekRange(context,new Date('2026-03-08T07:00:00Z')),{start:'2026-03-02',end:'2026-03-08'})
  assert.deepEqual(regionalWeekRange({...context,weekStartsOn:0},new Date('2026-03-08T07:00:00Z')),{start:'2026-03-08',end:'2026-03-14'})
  assert.deepEqual(regionalWeekRange(context,new Date('2027-01-01T12:00:00Z')),{start:'2026-12-28',end:'2027-01-03'})
})

test('week display changes without mutating day indexes, IDs, items or multiweek boundaries', () => {
  const items=Object.freeze([{id:'m',dayIndex:0,weekIndex:1},{id:'s',dayIndex:6,weekIndex:1},{id:'next',dayIndex:0,weekIndex:2}].map(Object.freeze))
  const result=orderWeeklyItems(items,{...korea,weekStartsOn:0})
  assert.deepEqual(result.map(item=>item.id),['s','m','next'])
  assert.deepEqual(items.map(item=>item.dayIndex),[0,6,0])
  assert.equal(result[1],items[0])
  assert.deepEqual(orderedWeekdayIndices(korea),[0,1,2,3,4,5,6])
  assert.deepEqual(orderWeeklyItems([{day:'월'}, {day:'일'}],{...korea,weekStartsOn:0}).map(x=>x.day),['일','월'])
})

test('historical calendar labels never cross a day after timezone travel', () => {
  for (const timeZone of ['Asia/Seoul','America/Los_Angeles','Australia/Sydney']) {
    assert.equal(calendarDateLabel({...korea,locale:'en-GB',timeZone},'2026-09-15'),'15 Sept 2026')
    assert.equal(calendarDateLabel({...korea,timeZone},'invalid'),'invalid')
    assert.equal(calendarDateLabel({...korea,timeZone},'2026-02-30'),'2026-02-30')
  }
})
