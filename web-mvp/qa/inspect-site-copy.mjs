import ts from 'typescript'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { siteExtraEnglish } from '../../logs/sites/onju-web-mvp/web-mvp/src/i18n/siteExtraCopy.ts'
const dir=resolve(import.meta.dirname,'../../logs/sites/onju-web-mvp/web-mvp/src')
const result=[]
const patches=[]
for(const file of readdirSync(dir).filter(name=>name.endsWith('.tsx') && !['RegionalSettings.tsx','AgentText.tsx'].includes(name))) {
  const source=readFileSync(resolve(dir,file),'utf8')
  const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  const edits=[]
  function walk(node) {
    if(process.argv.includes('--templates') && ts.isTemplateExpression(node) && /[가-힣]/.test(node.head.text+node.templateSpans.map(span=>span.literal.text).join(''))) {
      result.push({file, key: node.head.text+node.templateSpans.map((span,index)=>'{'+index+'}'+span.literal.text).join('')})
    }
    if(process.argv.includes('--template-patches') && ts.isTemplateExpression(node) && !ts.isTaggedTemplateExpression(node.parent) && /[가-힣]/.test(node.head.text+node.templateSpans.map(span=>span.literal.text).join(''))) {
      edits.push({start:node.getStart(tree),end:node.getStart(tree),text:'siteTemplate'})
    }
    if(process.argv.includes('--dynamic-patches') && ts.isStringLiteral(node) && Object.hasOwn(siteExtraEnglish,node.text)
      && !(ts.isCallExpression(node.parent) && node.parent.expression.getText(tree)==='siteCopy')
      && !(ts.isBinaryExpression(node.parent) || ts.isPropertyAssignment(node.parent) && node.parent.name===node)
      && !(ts.isArrayLiteralExpression(node.parent) && ['이 초안으로 시작할게요','관련 조건도 함께 조정할게요'].includes(node.text))) {
      edits.push({start:node.getStart(tree),end:node.end,text:`siteCopy(${JSON.stringify(node.text)})`})
    }
    if(process.argv.includes('--literals') && ts.isStringLiteral(node) && /[가-힣]/.test(node.text) && !(ts.isCallExpression(node.parent) && node.parent.expression.getText(tree)==='siteCopy')) {
      result.push({file,text:node.text,context:node.parent.getText(tree).slice(0,180)})
    }
    if(ts.isJsxText(node) && /[가-힣]/.test(node.text)) {
      const text=node.text.replace(/\s+/g,' ').trim()
      result.push({file,text})
      edits.push({start:node.pos,end:node.end,text:`{siteCopy(${JSON.stringify(text)})}`})
    }
    if(ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && /[가-힣]/.test(node.initializer.text)) {
      result.push({file,attribute:node.name.getText(tree),text:node.initializer.text})
      edits.push({start:node.initializer.getStart(tree),end:node.initializer.end,text:`{siteCopy(${JSON.stringify(node.initializer.text)})}`})
    }
    ts.forEachChild(node,walk)
  }
  walk(tree)
  if(edits.length) {
    patches.push({file:resolve(dir,file),edits:edits.sort((a,b)=>b.start-a.start)})
  }
}
process.stdout.write(JSON.stringify(process.argv.includes('--patches') || process.argv.includes('--dynamic-patches') || process.argv.includes('--template-patches') ? patches : result,null,2))
