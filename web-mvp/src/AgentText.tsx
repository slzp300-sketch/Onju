import * as React from 'react'

// A deliberately small Markdown subset: never execute model-supplied HTML.
function inline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|\b(?:[01]?\d|2[0-3]):[0-5]\d\b)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(part) ? <strong key={index}>{part}</strong>
      : <React.Fragment key={index}>{part}</React.Fragment>)
}

function readableText(text: string) {
  // Older saved replies predate structured output. Reflow only long, plain
  // paragraphs at sentence boundaries; preserve lists, explicit breaks and data.
  return text.replace(/\r\n?/g, '\n').replace(/&#x20;|&#32;/gi, ' ').trim().split('\n\n').map(paragraph => {
    if (paragraph.length < 140 || paragraph.includes('\n') || /^(?:[-*•]|\d+[.)]|#)/.test(paragraph)) return paragraph
    const sentences = paragraph.split(/(?<=[.!?。！？])\s*(?=[가-힣“‘])/u)
    const groups: string[] = []
    for (const sentence of sentences) {
      if (groups.length && groups[groups.length - 1].length + sentence.length < 110) groups[groups.length - 1] += ` ${sentence}`
      else groups.push(sentence)
    }
    return groups.join('\n\n')
  }).join('\n\n')
}

export default function AgentText({ text }: { text: string }) {
  const lines = readableText(text).split('\n')
  const blocks: React.ReactNode[] = []
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    const bullet = /^(?:[-•*]\s+|\d+[.)]\s+)/
    if (bullet.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line)
      const pattern = ordered ? /^\d+[.)]\s+/ : /^[-•*]\s+/
      const items: React.ReactNode[] = []
      const start = Number.parseInt(line, 10)
      while (i < lines.length && pattern.test(lines[i].trim())) {
        items.push(<li key={i}>{inline(lines[i].trim().replace(pattern, ''))}</li>)
        i++
      }
      blocks.push(ordered ? <ol key={i} start={start}>{items}</ol> : <ul key={i}>{items}</ul>)
    } else if (/^(?:#{1,6}\s|✓|💡|→|⏱)/.test(line)) {
      blocks.push(<p className="agent-section" key={i}>{inline(line.replace(/^#{1,6}\s+/, ''))}</p>)
      i++
    } else {
      const paragraph: React.ReactNode[] = []
      const key = i
      while (i < lines.length && lines[i].trim() && !bullet.test(lines[i].trim()) && !/^(?:#{1,6}\s|✓|💡|→|⏱)/.test(lines[i].trim())) {
        if (paragraph.length) paragraph.push(<br key={`br-${i}`} />)
        paragraph.push(<React.Fragment key={i}>{inline(lines[i].trim())}</React.Fragment>)
        i++
      }
      blocks.push(<p key={key}>{paragraph}</p>)
    }
  }
  return <div className="agent-text">{blocks}</div>
}
