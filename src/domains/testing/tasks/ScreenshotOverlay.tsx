import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { TraceInteraction } from './interaction'

export function ScreenshotOverlay({ interaction, imageWidth, imageHeight }: { interaction: TraceInteraction; imageWidth: number; imageHeight: number }) {
  const id = useId()
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const container = ref.current?.parentElement
    if (!container) return
    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const width = interaction.width || imageWidth
  const height = interaction.height || imageHeight
  const scale = Math.min(size.width / imageWidth, size.height / imageHeight)
  const drawnWidth = imageWidth * scale
  const drawnHeight = imageHeight * scale
  const left = (size.width - drawnWidth) / 2
  const top = (size.height - drawnHeight) / 2
  const valid = width > 0 && height > 0 && interaction.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height)
  const points = valid ? interaction.points.map((point) => ({ x: left + point.x / width * drawnWidth, y: top + point.y / height * drawnHeight })) : []
  const target = points.at(-1)
  const tail = target && {
    x: Math.max(left + 4, Math.min(left + drawnWidth - 4, target.x + (target.x < left + 40 ? 36 : -36))),
    y: Math.max(top + 4, Math.min(top + drawnHeight - 4, target.y + (target.y < top + 40 ? 36 : -36))),
  }
  const line = interaction.kind === 'path' ? points : target && tail ? [tail, target] : []
  const drawing = size.width > 0 && size.height > 0 && line.length >= 2 && target

  return (
    <svg ref={ref} role="img" aria-label={interaction.kind === 'path' ? '拖拽或滑动动线' : '操作坐标箭头'} viewBox={`0 0 ${size.width || 1} ${size.height || 1}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
      {drawing ? (
        <>
          <defs>
            <marker id={`${id}-arrow`} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M 1 1 L 11 6 L 1 11 Z" fill="#f97316" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
            </marker>
            <clipPath id={`${id}-clip`}><rect x={left} y={top} width={drawnWidth} height={drawnHeight} /></clipPath>
          </defs>
          <g clipPath={`url(#${id}-clip)`}>
            <polyline points={line.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            <polyline points={line.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#f97316" strokeWidth="3" strokeDasharray={interaction.kind === 'path' ? '8 5' : undefined} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#${id}-arrow)`} />
            {interaction.kind === 'path' ? <circle cx={points[0].x} cy={points[0].y} r="5" fill="#f97316" stroke="#fff" strokeWidth="2" /> : null}
            <circle cx={target.x} cy={target.y} r="8" fill="none" stroke="#fff" strokeWidth="4" />
            <circle cx={target.x} cy={target.y} r="8" fill="none" stroke="#f97316" strokeWidth="2" />
          </g>
        </>
      ) : null}
    </svg>
  )
}
