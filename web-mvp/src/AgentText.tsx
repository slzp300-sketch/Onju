export default function AgentText({ text }: { text: string }) {
  const lines = text.replace(/\*\*/g, '').replace(/[ \t]+$/gm, '').split('\n')
  return <div className="agent-text">{lines.map((raw,index)=>{
    const line=raw.trim()
    if(!line)return <span className="agent-space" key={index}/>
    if(/^(✓|💡|→|⏱)/.test(line))return <strong className="agent-section" key={index}>{line}</strong>
    if(line.startsWith('•')||line.startsWith('- '))return <span className="agent-bullet" key={index}><i/><span>{line.replace(/^(•|- )/,'').trim()}</span></span>
    return <span className="agent-paragraph" key={index}>{line}</span>
  })}</div>
}
