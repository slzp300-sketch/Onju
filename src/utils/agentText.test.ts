import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AgentText from '../../web-mvp/src/AgentText'

const render = (text: string) => renderToStaticMarkup(createElement(AgentText, { text }))

describe('AI reply readability', () => {
  it('renders emphasis without exposing Markdown markers', () => {
    const html = render('기상은 **06:00**입니다.\n\n취침 시간은요?')
    expect(html).toContain('<strong>06:00</strong>')
    expect(html.match(/<p>/g)).toHaveLength(2)
    expect(html).not.toContain('**')
  })
  it('renders semantic lists and preserves explicit line breaks', () => {
    const html = render('- 월요일 **06:00**\n- 토요일 **08:00**\n\n첫 줄\n다음 줄')
    expect(html).toContain('<ul>')
    expect(html.match(/<li>/g)).toHaveLength(2)
    expect(html).toContain('<br/>')
  })
  it('supports ordered lists and CRLF without empty paragraphs', () => {
    const html = render('1. 첫 번째\r\n2. 두 번째\r\n\r\n\r\n마지막')
    expect(html).toContain('<ol start="1">')
    expect(html).not.toContain('<p></p>')
  })
  it('keeps model HTML inert and unmatched emphasis readable', () => {
    const html = render('<script>alert(1)</script>\n**미완성')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('**미완성')
  })
  it('reflows a legacy wall of text without changing facts or decimal numbers', () => {
    const html = render('평일은 05:30에 기상하고 22:30에 취침한다고 말씀해 주셨어요. 주말에는 토요일 08:00 기상, 일요일 06:30 기상으로 이해했어요.현재 일정표를 보면 평일 고정 근무와 이동 시간을 제외한 나머지 시간에 어떤 활동을 할지 함께 정할 수 있을 것 같아요. 주간 계획은 2.5시간 정도로 시작해 볼까요? &#x20;')
    expect(html.match(/<p>/g)?.length).toBeGreaterThan(1)
    expect(html).toContain('<strong>05:30</strong>')
    expect(html).toContain('2.5시간')
    expect(html).not.toContain('&amp;#x20;')
  })
})
