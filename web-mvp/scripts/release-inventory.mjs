import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function inventory(directory, accept) {
  const files=[]
  async function walk(relative='') {
    for(const item of (await readdir(resolve(directory,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      if(item.name.startsWith('.')||['node_modules','dist'].includes(item.name))continue
      const name=relative?relative+'/'+item.name:item.name
      if(item.isSymbolicLink())throw new Error('Symlinks are not allowed in release inventory')
      if(item.isDirectory())await walk(name)
      else if(accept(name)) {
        const bytes=await readFile(resolve(directory,name))
        files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
      }
    }
  }
  await walk();return files
}

export async function validationManifest(root) {
  const webPaths=['web-mvp/dist','logs/sites/onju-web-mvp/dist']
  const artifacts=[]
  for(const path of webPaths) {
    const files=await inventory(resolve(root,path),()=>true)
    if(!files.some(file=>file.path==='index.html'))throw new Error('Missing built index: '+path)
    for(const file of files.filter(file=>/\.(?:js|css|html)$/.test(file.path))) {
      const bytes=await readFile(resolve(root,path,file.path))
      const content=bytes.toString()
      // Offline artifacts cannot embed a real backend, credentials, or the QA simulator.
      if(/https:\/\/[a-z0-9-]+\.supabase\.co|sb_secret_[A-Za-z0-9_-]+|synthetic-offline-public|onju\.offline\.invalid|createJourneyBackend/.test(content))throw new Error('Unsafe or QA-only content in artifact: '+file.path)
      file.gzipBytes=gzipSync(bytes).length
      if(file.path.endsWith('.js')&&file.bytes>500_000)throw new Error('JavaScript chunk exceeds offline release budget: '+file.path)
    }
    artifacts.push({directory:path,files})
  }
  const serverSources=[]
  const envNames=new Set()
  for(const path of ['supabase/functions','logs/sites/onju-web-mvp/supabase/functions']) {
    const files=await inventory(resolve(root,path),name=>name.endsWith('.ts'))
    for(const file of files) {
      const text=await readFile(resolve(root,path,file.path),'utf8')
      for(const match of text.matchAll(/Deno\.env\.get\(\s*['"]([^'"]+)['"]\s*\)/g))envNames.add(match[1])
    }
    serverSources.push({directory:path,files})
  }
  const migrations=[]
  for(const path of ['supabase/migrations','logs/sites/onju-web-mvp/supabase/migrations'])migrations.push({directory:path,files:await inventory(resolve(root,path),name=>name.endsWith('.sql'))})
  return {schemaVersion:1,createdAt:new Date().toISOString(),purpose:'offline-validation-only',deployable:false,
    caution:'Blank API configuration. Rebuild from the same validated source with explicitly approved public configuration after all release gates. No migration execution is authorized by this inventory.',
    artifacts,serverSources,migrations,environmentVariableNames:[...envNames].sort(),publicBuildVariableNames:['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY'],
    releaseGates:['reconcile-production-migration-ledger','confirm-operating-contact-and-retention','approve-live-evaluation-budget','real-English-quality-and-overseas-connectivity','approve-deployment-and-rollback'],
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.env.ONJU_OFFLINE!=='1')throw new Error('Inventory requires ONJU_OFFLINE=1')
  const root=fileURLToPath(new URL('../../',import.meta.url))
  const output=process.argv[2]
  if(!output)throw new Error('Pass an output directory')
  const manifest=await validationManifest(root)
  await mkdir(output,{recursive:true})
  await writeFile(resolve(output,'release-inventory.json'),JSON.stringify(manifest,null,2))
  console.log('Offline artifacts verified; release-inventory.json written. NOT deployable.')
}
