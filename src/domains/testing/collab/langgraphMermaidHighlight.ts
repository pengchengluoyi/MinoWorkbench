/** 在 LangGraph 官方 draw_mermaid 文本上高亮当前选中的图节点。 */
export function highlightLangGraphMermaid(chart: string, stepId: string): string {
  const id = stepId.trim()
  if (!id || !chart.trim()) return chart
  const classLine = 'classDef lgSelected fill:#e6f4ff,stroke:#1677ff,stroke-width:2px'
  const lines = chart.split('\n')
  let touched = false
  const out = lines.map(line => {
    const trimmed = line.trim()
    if (trimmed.startsWith(`${id}(`) && !trimmed.includes(':::lgSelected')) {
      touched = true
      if (trimmed.endsWith(';')) {
        return line.replace(/;$/, ':::lgSelected;')
      }
      return `${line}:::lgSelected`
    }
    return line
  })
  if (touched && !out.some(l => l.includes('classDef lgSelected'))) {
    out.push(classLine)
  }
  return out.join('\n')
}

/** 高亮 agent_canvas.mermaid 中的角色节点（id 中 - 转为 _）。 */
export function highlightAgentMermaid(chart: string, agentId: string): string {
  const nid = agentId.trim().replace(/-/g, '_')
  if (!nid || !chart.trim()) return chart
  const classLine = 'classDef agSelected fill:#e6f4ff,stroke:#1677ff,stroke-width:2px'
  const lines = chart.split('\n')
  let touched = false
  const out = lines.map(line => {
    const trimmed = line.trim()
    if (trimmed.startsWith(`${nid}[`) && !trimmed.includes(':::agSelected')) {
      touched = true
      if (trimmed.endsWith(';')) {
        return line.replace(/;$/, ':::agSelected;')
      }
      return `${line}:::agSelected`
    }
    return line
  })
  if (touched && !out.some(l => l.includes('classDef agSelected'))) {
    out.push(classLine)
  }
  return out.join('\n')
}
