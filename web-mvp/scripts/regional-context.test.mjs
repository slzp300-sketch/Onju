import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_REGIONAL_CONTEXT,
  normalizeRegionalContext,
  regionalDateKey,
  regionalTimeZoneLabel,
} from '../src/regionalContext.ts'
import {
  cleanRegionalContext,
  regionalColumns,
  regionalNowLabel,
} from '../../supabase/functions/_shared/onjuRegionalContext.ts'
import { conversationPrompt } from '../../supabase/functions/onju-agent-v2/prompt.ts'

const us = {
  locale: 'en-US',
  countryCode: 'US',
  timeZone: 'America/New_York',
  currencyCode: 'USD',
  weekStartsOn: 0,
}

test('browser regional context normalizes safe international values', () => {
  assert.deepEqual(normalizeRegionalContext(us), us)
  assert.deepEqual(normalizeRegionalContext({
    locale: 'not_a_locale!',
    countryCode: 'USA',
    timeZone: 'Mars/Olympus',
    currencyCode: 'US',
    weekStartsOn: 6,
  }), DEFAULT_REGIONAL_CONTEXT)
})

test('the same instant resolves to the correct local calendar date', () => {
  const instant = new Date('2026-09-14T03:30:00.000Z')
  assert.equal(regionalDateKey(DEFAULT_REGIONAL_CONTEXT, instant), '2026-09-14')
  assert.equal(regionalDateKey(us, instant), '2026-09-13')
})

test('edge functions sanitize and persist the same regional contract', () => {
  const context = cleanRegionalContext(us)
  assert.deepEqual(regionalColumns(context), {
    locale: 'en-US',
    country_code: 'US',
    time_zone: 'America/New_York',
    currency_code: 'USD',
    week_starts_on: 0,
  })
  assert.match(regionalNowLabel(context, new Date('2026-09-14T03:30:00.000Z')), /2026/)
  assert.match(regionalTimeZoneLabel(context, new Date('2026-09-14T03:30:00.000Z')), /^Local time/)
})

test('agent prompt receives locale, country, timezone and week start explicitly', () => {
  const prompt = conversationPrompt({ now: 'Sunday, September 13, 2026 at 11:30 PM', phase: 'open', regionalContext: us, facts: {}, openings: [] })
  assert.match(prompt, /locale=en-US/)
  assert.match(prompt, /timeZone=America\/New_York/)
  assert.match(prompt, /countryCode=US/)
  assert.match(prompt, /weekStartsOn=0/)
  assert.doesNotMatch(prompt, /현재 한국시간/)
})

test('migration removes Korea-only timezone constraints and adds regional fields', () => {
  const migration = readFileSync(resolve('../supabase/migrations/0019_web_mvp_global_context.sql'), 'utf8')
  for (const field of ['locale', 'country_code', 'time_zone', 'currency_code', 'week_starts_on']) assert.match(migration, new RegExp(field))
  assert.match(migration, /drop constraint if exists web_mvp_checkin_preferences_timezone_check/)
  assert.match(migration, /drop constraint if exists web_mvp_daily_logs_timezone_check/)
})

