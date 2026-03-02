"use client"
import { useEffect, useRef } from "react"

type Props = {
  title: string
  current: number
  previous: number
  format: (n: number) => string
  color: string
  invert?: boolean // when lower is better (e.g., average position)
  series?: number[] // sparkline values for current period
}

export default function KpiCard({ title, current, previous, format, color, invert = false, series = [] }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)

  // Robust delta calculation
  let rawDelta: number
  if (previous === 0) {
    // If there was no previous value, treat any positive current as full improvement
    rawDelta = current > 0 ? 100 : 0
  } else {
    rawDelta = ((current - previous) / previous) * 100
  }
  const delta = invert ? -rawDelta : rawDelta
  // Only mark as up when strictly positive; 0 is neutral/non-up
  const up = delta > 0

  useEffect(() => {
    if (!canvas.current || !series?.length) return
    const ctx = canvas.current.getContext('2d')!
    const w = canvas.current.width
    const h = canvas.current.height
    ctx.clearRect(0, 0, w, h)
    const pad = 6
    const min = Math.min(...series)
    const max = Math.max(...series)
    const xs = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, series.length - 1)
    const ys = (v: number) => h - pad - ((v - min) / Math.max(1, max - min)) * (h - pad * 2)
    // background fade
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, color + '55')
    grad.addColorStop(1, '#0b0b16')
    ctx.fillStyle = grad
    ctx.beginPath()
    series.forEach((v, i) => { const x = xs(i); const y = ys(v); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
    ctx.lineTo(w - pad, h - pad); ctx.lineTo(pad, h - pad); ctx.closePath(); ctx.fill()
    // line
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    series.forEach((v, i) => { const x = xs(i); const y = ys(v); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
    ctx.stroke()
  }, [series, color])

  return (
    <div className="card kpi-tile" style={{ padding: '24px' }}>
      <div style={{ width: '100%' }}>
        <div className="muted" style={{ marginBottom: 12, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
          <div className="value" style={{ fontSize: '32px' }}>{format(current)}</div>
          <div className={`trend ${up ? '' : 'down'}`} style={{ transform: 'translateY(-4px)' }}>
            {delta > 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span className="muted">Current</span>
              <strong style={{ color: color }}>{format(current)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span className="muted">Previous</span>
              <strong style={{ opacity: 0.8 }}>{format(previous)}</strong>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <canvas ref={canvas} width={120} height={40} style={{ borderRadius: 8, background: 'rgba(255,255,255,0.02)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
