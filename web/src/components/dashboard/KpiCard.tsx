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

export default function KpiCard({ title, current, previous, format, color, invert=false, series=[] }: Props){
  const canvas = useRef<HTMLCanvasElement>(null)

  const rawDelta = previous === 0 ? 0 : ((current - previous) / previous) * 100
  const delta = invert ? -rawDelta : rawDelta
  const up = delta >= 0

  useEffect(()=>{
    if(!canvas.current || !series?.length) return
    const ctx = canvas.current.getContext('2d')!
    const w = canvas.current.width
    const h = canvas.current.height
    ctx.clearRect(0,0,w,h)
    const pad = 6
    const min = Math.min(...series)
    const max = Math.max(...series)
    const xs = (i:number)=> pad + (i*(w-pad*2))/Math.max(1, series.length-1)
    const ys = (v:number)=> h-pad - ((v-min)/Math.max(1, max-min))*(h-pad*2)
    // background fade
    const grad = ctx.createLinearGradient(0,0,0,h)
    grad.addColorStop(0, color + '55')
    grad.addColorStop(1, '#0b0b16')
    ctx.fillStyle = grad
    ctx.beginPath()
    series.forEach((v,i)=>{ const x=xs(i); const y=ys(v); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y) })
    ctx.lineTo(w-pad,h-pad); ctx.lineTo(pad,h-pad); ctx.closePath(); ctx.fill()
    // line
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    series.forEach((v,i)=>{ const x=xs(i); const y=ys(v); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y) })
    ctx.stroke()
  }, [series, color])

  return (
    <div className="kpi-tile">
      <div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <div className="value">{format(current)}</div>
          <div className={`trend ${up? '' : 'down'}`}>{delta>0? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}</div>
        </div>
        <div className="muted" style={{marginTop:4}}>{title}</div>
        <div style={{display:'grid', gridTemplateColumns:'110px 1fr', alignItems:'center', gap:8, marginTop:10}}>
          <canvas ref={canvas} width={110} height={48} style={{borderRadius:6}}/>
          <div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span className="muted">Current Period</span><strong>{format(current)}</strong></div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span className="muted">Previous Period</span><strong>{format(previous)}</strong></div>
          </div>
        </div>
      </div>
    </div>
  )
}
