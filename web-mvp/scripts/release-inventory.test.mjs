import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inventory } from './release-inventory.mjs'
test('inventory hashes exact selected bytes, excludes hidden env and never reads secrets',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'onju-inventory-'))
  await writeFile(join(dir,'app.ts'),'synthetic source')
  await writeFile(join(dir,'.env'),'not a credential; excluded fixture')
  await writeFile(join(dir,'notes.md'),'not in source inventory')
  const first=await inventory(dir,name=>name.endsWith('.ts'))
  assert.equal(first.length,1);assert.equal(first[0].path,'app.ts');assert.equal(first[0].bytes,16)
  await writeFile(join(dir,'app.ts'),'changed source')
  assert.notEqual((await inventory(dir,name=>name.endsWith('.ts')))[0].sha256,first[0].sha256)
})
