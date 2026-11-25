import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
const ts = createRequire(import.meta.url)('typescript')

// Real endpoint code with a deliberately synthetic DB/provider boundary.
export function loadCostHandler(base, endpoint, db, fakeFetch) {
  let handler, providerCalls=0
  const deno={env:{get:name=>({ANTHROPIC_API_KEY:'test-only',OPENAI_API_KEY:'test-only',SUPABASE_URL:'http://localhost',SUPABASE_SERVICE_ROLE_KEY:'test-only'})[name]},serve:fn=>{handler=fn}}
  const cache=new Map()
  function load(path) {
    if(cache.has(path))return cache.get(path).exports
    const module={exports:{}};cache.set(path,module)
    const compiled=ts.transpileModule(readFileSync(path,'utf8'),{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}})
    if(compiled.diagnostics?.length)throw new Error(ts.flattenDiagnosticMessageText(compiled.diagnostics[0].messageText,'\n'))
    const require=specifier=>{
      if(specifier.startsWith('https://esm.sh/@supabase/'))return {createClient:()=>db}
      if(!specifier.startsWith('.'))throw new Error('Unexpected import '+specifier)
      const candidate=resolve(dirname(path),specifier)
      return load(existsSync(candidate)?candidate:candidate+'.ts')
    }
    new Function('require','module','exports','Deno','fetch','console',compiled.outputText)(require,module,module.exports,deno,async()=>{providerCalls++;if(fakeFetch)return fakeFetch();throw new Error('No live calls allowed')},{error(){},warn(){},log(){}})
    return module.exports
  }
  load(resolve(base,'supabase/functions',endpoint,'index.ts'))
  return {handler,counts:()=>({providerCalls})}
}
