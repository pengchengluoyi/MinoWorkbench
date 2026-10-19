/** LangGraph draw_mermaid / 旧画布文本在 Mermaid 11 strict 下会失败，先清洗再渲染。 */
export function sanitizeMermaidChart(raw: string): string {
  let text = String(raw || '').trim()
  if (!text) return ''

  if (text.startsWith('---')) {
    const rest = text.slice(3)
    const end = rest.indexOf('\n---')
    if (end >= 0) text = rest.slice(end + 4).trim()
  }

  text = text.replace(/<[^>]+>/g, '')
  text = text.replace(/&nbsp;/gi, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>')

  // LangGraph: `node -. label .-> other` → 带引号的边标签
  text = text.replace(/\s-\.\s+([^;]+?)\s+\.->/g, (_m, label: string) => {
    const clean = String(label).trim().replace(/"/g, "'")
    return ` -."${clean}" .->`
  })

  return text.trim()
}

export function mermaidSvgLooksLikeError(svg: string): boolean {
  const s = svg.toLowerCase()
  return s.includes('syntax error') || s.includes('error-text') || s.includes('aria-roledescription="error"')
}
