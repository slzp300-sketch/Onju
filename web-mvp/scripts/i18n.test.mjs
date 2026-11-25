import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function loadTypeScriptModule(file, dependencies = {}) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText
  const module = { exports: {} }
  const localRequire = (name) => {
    if (name in dependencies) return dependencies[name]
    throw new Error(`Unexpected dependency: ${name}`)
  }
  new Function('module', 'exports', 'require', output)(module, module.exports, localRequire)
  return module.exports
}

const { koKR } = loadTypeScriptModule('../src/i18n/catalog.ko-KR.ts')
const { enUS } = loadTypeScriptModule('../src/i18n/catalog.en-US.ts')
const i18n = loadTypeScriptModule('../src/i18n/index.ts', {
  './catalog.ko-KR': { koKR },
  './catalog.en-US': { enUS },
})

test('Korean and English language packs expose the same complete key set', () => {
  assert.deepEqual(Object.keys(enUS).sort(), Object.keys(koKR).sort())
  assert.ok(Object.values(koKR).every(Boolean))
  assert.ok(Object.values(enUS).every(Boolean))
})

test('translation selects the supported language and interpolates values', () => {
  assert.equal(i18n.translate('ko-KR', 'plan.count', { count: 3 }), '3회 계획')
  assert.equal(i18n.translate('en-US', 'plan.count', { count: 3 }), '3 planned actions')
  assert.equal(i18n.translate('en-GB', 'setup.saved'), 'Saved')
})

test('weekday labels are stable Monday-first internal indexes in both languages', () => {
  assert.deepEqual(i18n.weekdayLabels('ko-KR'), ['월', '화', '수', '목', '금', '토', '일'])
  assert.deepEqual(i18n.weekdayLabels('en-US'), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
})

test('all user-facing web surfaces use the language pack', () => {
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const setup = fs.readFileSync(new URL('../src/ScheduleSetup.tsx', import.meta.url), 'utf8')
  assert.match(app, /applyDocumentLocale\(state\.regionalContext\)/)
  assert.doesNotMatch(app, /<Header\s*\/>/)
  assert.match(setup, /translator\(regionalContext\)/)
  assert.match(setup, /weekdayLabels\(regionalContext\)/)
})

test('weekly plan model calls receive locale and timezone instructions', () => {
  const generator = fs.readFileSync(new URL('../../supabase/functions/onju-plan-agent/index.ts', import.meta.url), 'utf8')
  const revision = fs.readFileSync(new URL('../../supabase/functions/onju-plan-revision-agent/index.ts', import.meta.url), 'utf8')
  for (const source of [generator, revision]) {
    assert.match(source, /cleanRegionalContext\(body\.regionalContext\)/)
    assert.match(source, /regionalContext\.locale/)
    assert.match(source, /regionalContext\.timeZone/)
  }
})
