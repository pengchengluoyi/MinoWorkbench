import { useEffect, useId, useRef, useState } from 'react'
import { mermaidSvgLooksLikeError, sanitizeMermaidChart } from '@/lib/mermaidSanitize'

type MermaidApi = {
  initialize: (config: {
    startOnLoad?: boolean
    theme?: string
    securityLevel?: string
    suppressErrorRendering?: boolean
  }) => void
  render: (id: string, text: string) => Promise<{ svg: string }>
}

let mermaidPromise: Promise<MermaidApi> | null = null

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(mod => {
      const api = mod.default as MermaidApi
      api.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'loose',
        suppressErrorRendering: true,
      })
      return api
    })
  }
  return mermaidPromise
}

/** 渲染服务端下发的 Mermaid 文本（LangGraph draw_mermaid / Nexus agent_canvas）。 */
export function MermaidDiagram({ chart, className }: { chart: string; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const reactId = useId().replace(/:/g, '')
  const [error, setError] = useState('')

  useEffect(() => {
    const text = sanitizeMermaidChart(chart)
    if (!text || !hostRef.current) return
    let cancelled = false
    setError('')
    hostRef.current.innerHTML = ''
    void loadMermaid()
      .then(api => api.render(`mino-mmd-${reactId}`, text))
      .then(({ svg }) => {
        if (cancelled || !hostRef.current) return
        if (mermaidSvgLooksLikeError(svg)) {
          hostRef.current.innerHTML = ''
          setError('syntax')
          return
        }
        hostRef.current.innerHTML = svg
      })
      .catch(err => {
        if (!cancelled) {
          if (hostRef.current) hostRef.current.innerHTML = ''
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
      if (hostRef.current) hostRef.current.innerHTML = ''
    }
  }, [chart, reactId])

  if (!chart.trim()) return null
  if (error) {
    return (
      <p className={className} style={{ fontSize: 12, color: 'var(--w-text-muted, #888)', margin: 0 }}>
        流程图暂无法显示（语法不兼容）。请使用「交互画布」查看编排。
      </p>
    )
  }
  return <div ref={hostRef} className={className} aria-label="Mermaid 流程图" />
}
