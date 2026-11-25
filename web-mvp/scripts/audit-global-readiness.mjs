// Static, offline inventory only. Never imports application code or reads .env.
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const normalize = value => value.replaceAll('\\', '/')
const digest = value => createHash('sha256').update(value.replaceAll('\r\n', '\n')).digest('hex')
const unique = values => [...new Set(values)].sort()

export function inspectSource(path, text) {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const result = { imports: [], invocations: [], tables: [], rpcs: [], dynamicRpcs: [], envNames: [], actions: [], calls: [], providers: [], routes: [] }
  const literal = node => node && ts.isStringLiteralLike(node) ? node.text : null
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const bindings = node.importClause?.namedBindings
      const typeOnly = node.isTypeOnly || node.importClause?.isTypeOnly ||
        (bindings && ts.isNamedImports(bindings) && !node.importClause?.name && bindings.elements.length > 0 && bindings.elements.every(item => item.isTypeOnly))
      if (!typeOnly) result.imports.push(literal(node.moduleSpecifier))
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === 'action' && literal(node.initializer)) result.actions.push(literal(node.initializer))
    if (ts.isBinaryExpression(node) && ['===', '=='].includes(node.operatorToken.getText(file))) {
      if (node.left.getText(file).endsWith('.action') && literal(node.right)) result.actions.push(literal(node.right))
      if (node.right.getText(file).endsWith('.action') && literal(node.left)) result.actions.push(literal(node.left))
    }
    if (ts.isJsxAttribute(node) && node.name.getText(file) === 'path' && literal(node.initializer)) result.routes.push(literal(node.initializer))
    if (ts.isPropertyAccessExpression(node) && node.expression.getText(file) === 'import.meta.env') result.envNames.push(node.name.text)
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(file)
      const argument = literal(node.arguments[0])
      const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
      if (expression.endsWith('.functions.invoke')) result.invocations.push({ target: argument, dynamic: !argument, line })
      if (expression.endsWith('.from') && argument?.startsWith('web_mvp_')) result.tables.push(argument)
      if (expression.endsWith('.rpc')) {
        if (argument) result.rpcs.push(argument)
        else result.dynamicRpcs.push({ expression: node.arguments[0]?.getText(file), line })
      }
      if (expression === 'Deno.env.get' && argument) result.envNames.push(argument)
      if (ts.isIdentifier(node.expression)) result.calls.push(node.expression.text)
      if (expression === 'fetch') {
        const arg = node.arguments[0]
        const urlText = arg ? arg.getText(file) : ''
        const endpoint = urlText.match(/\/functions\/v1\/([a-z][a-z0-9-]+)/)?.[1]
        if (endpoint) result.invocations.push({ target: endpoint, dynamic: false, line })
        else if (urlText.includes('/functions/v1/')) result.invocations.push({ target: null, dynamic: true, line })
        for (const host of ['api.openai.com', 'generativelanguage.googleapis.com', 'api.anthropic.com']) {
          if (urlText.includes(host)) result.providers.push(host)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  for (const key of ['imports', 'tables', 'rpcs', 'envNames', 'actions', 'calls', 'providers', 'routes']) result[key] = unique(result[key].filter(Boolean))
  return result
}

export function inspectSql(text) {
  // Static declarations, not SQL execution or proof of grants/RLS correctness.
  const sql = text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  return {
    tables: unique([...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(web_mvp_\w+)/gi)].map(m => m[1])),
    functions: unique([...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(web_mvp_\w+)/gi)].map(m => m[1])),
    accessTokenColumn: /add\s+column\s+(?:if\s+not\s+exists\s+)?access_token_hash\b/i.test(sql),
  }
}

export function buildInventory(files) {
  const names = Object.keys(files).sort()
  const source = Object.fromEntries(names.filter(path => /\.(?:ts|tsx|mjs)$/.test(path)).map(path => [path, inspectSource(path, files[path])]))
  const sql = names.filter(path => path.startsWith('supabase/migrations/') && path.endsWith('.sql')).map(path => ({ path, version: path.split('/').at(-1).split('_')[0], sha256: digest(files[path]), ...inspectSql(files[path]) }))
  const closures = entry => {
    const visited = new Set()
    const pending = [entry]
    while (pending.length) {
      const path = pending.pop()
      if (visited.has(path) || !source[path]) continue
      visited.add(path)
      for (const specifier of source[path].imports.filter(value => value.startsWith('.'))) {
        const base = normalize(relative('/inventory', resolve('/inventory', dirname(path), specifier)))
        const match = [base, base + '.ts', base + '.tsx', base + '/index.ts'].find(candidate => source[candidate])
        if (match) pending.push(match)
      }
    }
    return [...visited].sort()
  }
  const definedTables = new Set(sql.flatMap(item => item.tables))
  const definedRpcs = new Set(sql.flatMap(item => item.functions))
  const handlers = names.filter(path => /^supabase\/functions\/[^/]+\/index\.ts$/.test(path)).map(path => {
    const dependencies = closures(path)
    const combine = key => unique(dependencies.flatMap(name => source[name][key]))
    const calls = combine('calls')
    const tables = combine('tables'), rpcs = combine('rpcs')
    return {
      name: path.split('/')[2], path, dependencies,
      actions: combine('actions'), tables, rpcs,
      dynamicRpcs: dependencies.flatMap(name => source[name].dynamicRpcs.map(item => ({ path: name, ...item }))),
      envNames: combine('envNames'), providers: combine('providers'),
      // A referenced guard may not cover every branch; manual review is mandatory.
      guardReferences: {
        session: calls.includes('claimWebMvpSession'), rate: calls.includes('enforceWebMvpRateLimits'),
        budget: calls.includes('reserveWebMvpAiBudget'), settlement: calls.includes('settleWebMvpAiBudgetSafely'),
      },
      missingTables: tables.filter(name => !definedTables.has(name)),
      missingRpcs: rpcs.filter(name => !definedRpcs.has(name)),
    }
  })
  const clients = Object.entries(source).filter(([path, value]) => /^(?:src|web-mvp\/src)\//.test(path) && value.invocations.length)
    .map(([path, value]) => ({ path, invocations: value.invocations, actions: value.actions, envNames: value.envNames }))
  const hash = createHash('sha256')
  const fingerprints = names.map(path => { const sha256 = digest(files[path]); hash.update(path + '\0' + sha256); return { path, sha256 } })
  return {
    sourceSha256: hash.digest('hex'), fingerprints, handlers, clients, migrations: sql,
    envNames: unique(Object.values(source).flatMap(item => item.envNames)),
    accessTokenDefinition: sql.filter(item => item.accessTokenColumn).map(item => item.path),
    missingTables: unique(handlers.flatMap(item => item.missingTables)), missingRpcs: unique(handlers.flatMap(item => item.missingRpcs)),
    limitations: ['Static references are not execution coverage or a security audit.', 'Dynamic dispatch and SQL permissions require manual review.', 'No runtime environment values, remote state or model quality were inspected.'],
  }
}

export function compareInventories(local, reference) {
  const ref = new Map(reference.fingerprints.map(item => [item.path, item.sha256]))
  const here = new Map(local.fingerprints.map(item => [item.path, item.sha256]))
  return {
    changed: [...here.keys()].filter(path => ref.has(path) && here.get(path) !== ref.get(path)).sort(),
    localOnly: [...here.keys()].filter(path => !ref.has(path)).sort(),
    referenceOnly: [...ref.keys()].filter(path => !here.has(path)).sort(),
    migrationVersionCollisions: local.migrations.flatMap(item => reference.migrations.filter(other => item.version === other.version && item.sha256 !== other.sha256).map(other => ({ version: item.version, local: item.path, reference: other.path }))),
  }
}

const roots = ['web-mvp/src', 'src', 'supabase/functions', 'supabase/migrations']
const allowed = path => /\.(?:ts|tsx|mjs|sql)$/.test(path) && !/(?:\.test|\.spec)\./.test(path)
export function readTree(root) {
  const files = {}
  function walk(path) {
    if (!existsSync(resolve(root, path))) return
    for (const entry of readdirSync(resolve(root, path), { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ['node_modules', '.git', 'dist'].includes(entry.name)) continue
      const child = normalize(path + '/' + entry.name)
      if (entry.isDirectory()) walk(child)
      else if (allowed(child)) files[child] = readFileSync(resolve(root, child), 'utf8')
    }
  }
  roots.forEach(walk)
  for (const path of ['supabase/config.toml', 'scripts/build-site.mjs']) if (existsSync(resolve(root, path))) files[path] = readFileSync(resolve(root, path), 'utf8')
  return files
}
function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024 })
}
function readHead(root) {
  // Resolve once: never mix files from different HEAD revisions.
  const commit = git(root, ['rev-parse', 'HEAD']).trim()
  const paths = git(root, ['ls-tree', '-r', '--name-only', commit, '--', ...roots, 'supabase/config.toml', 'scripts/build-site.mjs']).trim().split('\n').filter(path => allowed(path) || path === 'supabase/config.toml')
  return { commit, files: Object.fromEntries(paths.map(path => [path, git(root, ['show', commit + ':' + path])])) }
}

export function runAudit(args) {
  const get = name => args.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1)
  if (!get('--reference') || !get('--out') || args.some(arg => !/^--(?:reference|out)=/.test(arg))) throw new Error('Usage: node scripts/audit-global-readiness.mjs --reference=<local site repository> --out=<local report.json>')
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const referencePath = resolve(get('--reference')), out = resolve(get('--out'))
  const head = readHead(referencePath)
  const local = buildInventory(readTree(root)), releaseCommit = buildInventory(head.files), releaseWorkingTree = buildInventory(readTree(referencePath))
  const report = {
    generatedAt: new Date().toISOString(), mode: 'offline-static', paidProviderCalls: 0,
    localRoot: root, referenceRoot: referencePath, referenceCommit: head.commit,
    local, releaseCommit, releaseWorkingTree,
    localVsReleaseCommit: compareInventories(local, releaseCommit),
    releaseWorkingTreeVsCommit: compareInventories(releaseWorkingTree, releaseCommit),
    liveDeploymentVerified: false,
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ report: out, referenceCommit: head.commit, localHandlers: local.handlers.length, releaseHandlers: releaseCommit.handlers.length, missingTables: local.missingTables, missingRpcs: local.missingRpcs, versionCollisions: report.localVsReleaseCommit.migrationVersionCollisions, liveDeploymentVerified: false, paidProviderCalls: 0 }, null, 2))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runAudit(process.argv.slice(2))
