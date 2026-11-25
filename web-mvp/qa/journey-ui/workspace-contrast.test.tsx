import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterEach,expect,test} from 'vitest'

const site=resolve(import.meta.dirname,'../../../logs/sites/onju-web-mvp/web-mvp/src')
const source=['styles.css','workspace.css'].map(file=>readFileSync(resolve(site,file),'utf8')).join('\n')
// jsdom does not resolve custom properties; keep the real theme value and cascade.
const green=source.match(/--green\s*:\s*([^;}]+)/)![1]
const css=source.replaceAll('var(--green)',green)
afterEach(()=>{document.head.querySelectorAll('style').forEach(el=>el.remove());document.body.replaceChildren()})

for(const context of ['workspace-page','workspace-approval']) {
  for(const tag of ['a','button']) test(`${context}: ${tag} primary label stays white`,()=>{
    const style=document.createElement('style');style.textContent=css;document.head.append(style)
    document.body.innerHTML=`<main class="${context}"><${tag} class="button">계획 만들기</${tag}></main>`
    const button=document.querySelector('.button')!
    expect(getComputedStyle(button).color).toBe('rgb(255, 255, 255)')
    expect(getComputedStyle(button).backgroundColor).toBe('rgb(36, 99, 67)')
  })
  test(`${context}: disabled primary keeps legible solid colors`,()=>{
    const style=document.createElement('style');style.textContent=css;document.head.append(style)
    document.body.innerHTML=`<main class="${context}"><button class="button" disabled>계획을 저장하는 중</button></main>`
    const computed=getComputedStyle(document.querySelector('.button')!)
    expect(computed.color).toBe('rgb(82, 97, 78)')
    expect(computed.backgroundColor).toBe('rgb(226, 230, 222)')
    expect(computed.opacity).toBe('1')
  })
}
