import * as React from 'react'
import { useTextReveal } from './useTextReveal'

type Run = { characters: string[]; strong: boolean }
type Block = { kind: 'paragraph' | 'section' | 'ordered' | 'unordered'; lines: Run[][]; start?: number }
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

// A deliberately small Markdown subset: never execute model-supplied HTML.
function inline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|\b(?:[01]?\d|2[0-3]):[0-5]\d\b)/g).map(part => {
    const bold = part.startsWith('**') && part.endsWith('**') && part.length > 4
    return {
      characters: Array.from(segmenter.segment(bold ? part.slice(2, -2) : part), item => item.segment),
      strong: bold || /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(part),
    }
  })
}

function readableText(text: string) {
  // Older saved replies predate structured output. Reflow only long, plain
  // paragraphs at sentence boundaries; preserve lists, explicit breaks and data.
  return text.replace(/\r\n?/g, '\n').replace(/&#x20;|&#32;/gi, ' ').trim().split('\n\n').map(paragraph => {
    if (paragraph.length < 140 || paragraph.includes('\n') || /^(?:[-*•]|\d+[.)]|#)/.test(paragraph)) return paragraph
    // A full stop before another digit can be a decimal point (for example
    // `2.5시간`), so only treat it as a sentence boundary before text.
    const sentences = paragraph.split(/(?:(?<=[!?。！？])\s*(?=[A-Za-z0-9가-힣“‘"'])|(?<=\.)\s*(?=[A-Za-z가-힣“‘"']))/u)
    const groups: string[] = []
    for (const sentence of sentences) {
      if (groups.length && groups[groups.length - 1].length + sentence.length < 110) groups[groups.length - 1] += ` ${sentence}`
      else groups.push(sentence)
    }
    return groups.join('\n\n')
  }).join('\n\n')
}

function parseText(text: string) {
  const lines = readableText(text).split('\n')
  const blocks: Block[] = []
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    const bullet = /^(?:[-•*]\s+|\d+[.)]\s+)/
    if (bullet.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line)
      const pattern = ordered ? /^\d+[.)]\s+/ : /^[-•*]\s+/
      const items: Run[][] = []
      const start = Number.parseInt(line, 10)
      while (i < lines.length && pattern.test(lines[i].trim())) {
        items.push(inline(lines[i].trim().replace(pattern, '')))
        i++
      }
      blocks.push({ kind: ordered ? 'ordered' : 'unordered', lines: items, start })
    } else if (/^(?:#{1,6}\s|✓|💡|→|⏱)/.test(line)) {
      blocks.push({ kind: 'section', lines: [inline(line.replace(/^#{1,6}\s+/, ''))] })
      i++
    } else {
      const paragraph: Run[][] = []
      while (i < lines.length && lines[i].trim() && !bullet.test(lines[i].trim()) && !/^(?:#{1,6}\s|✓|💡|→|⏱)/.test(lines[i].trim())) {
        paragraph.push(inline(lines[i].trim()))
        i++
      }
      blocks.push({ kind: 'paragraph', lines: paragraph })
    }
  }
  return { blocks, length: blocks.reduce((sum, block) => sum + block.lines.flat().reduce((n, run) => n + run.characters.length, 0), 0) }
}

function revealBlocks(parsed: Block[], count: number) {
  let remaining = count
  return parsed.map((block, index) => {
    if (remaining <= 0) return null
    const lines = block.lines.map((line, lineIndex) => {
      if (remaining <= 0) return null
      const content = line.map((run, runIndex) => {
        const visible = run.characters.slice(0, remaining).join('')
        remaining = Math.max(0, remaining - run.characters.length)
        if (!visible) return null
        return run.strong ? <strong key={runIndex}>{visible}</strong> : <React.Fragment key={runIndex}>{visible}</React.Fragment>
      })
      return block.kind === 'ordered' || block.kind === 'unordered'
        ? <li key={lineIndex}>{content}</li>
        : <React.Fragment key={lineIndex}>{lineIndex > 0 && <br />}{content}</React.Fragment>
    })
    if (block.kind === 'ordered') return <ol key={index} start={block.start}>{lines}</ol>
    if (block.kind === 'unordered') return <ul key={index}>{lines}</ul>
    return <p key={index} className={block.kind === 'section' ? 'agent-section' : undefined}>{lines}</p>
  })
}

export default function AgentText({ text, animate = false, onRevealComplete }: {
  text: string; animate?: boolean; onRevealComplete?: () => void
}) {
  // Parse the complete Markdown once so bold/list markers never flash while typing.
  const parsed = React.useMemo(() => parseText(text), [text])
  const { count, revealing } = useTextReveal(text, parsed.length, animate, onRevealComplete)
  return <div className={`agent-text${revealing ? ' is-revealing' : ''}`} aria-busy={revealing || undefined}>
    {revealBlocks(parsed.blocks, count)}
    {revealing && count === 0 && <span className="agent-reveal-caret" aria-hidden="true" />}
  </div>
}
