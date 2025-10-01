"use client"
import { useEffect, useRef, useState } from "react"

export type Point = { date: string; clicks: number; impressions: number; ctr: number; position: number }

type Active = { clicks: boolean; impressions: boolean; ctr: boolean; position: boolean }

function draw(ctx: CanvasRenderingContext2D, data: Point[], active: Active, hoverIndex: number | null){
  const cssVar = (name: string, fallback: string) => {
    try{ return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback }catch{ return fallback }
  }
  const border = cssVar('--border', '#e5e7eb')
  const card = cssVar('--card', '#ffffff')
  const muted = cssVar('--muted', '#6b7280')
  const w = ctx.canvas.width, h = ctx.canvas.height
  const pad = 34
  ctx.clearRect(0,0,w,h)
  // grid
  ctx.strokeStyle = border; ctx.lineWidth = 1
  for(let i=0;i<5;i++){ const y = pad + (i*(h-pad*2))/4; ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke() }
  const xs = (i:number)=> pad + (i*(w-pad*2))/(data.length-1)
  const val = (v:number,min:number,max:number)=> h-pad - ((v-min)/(max-min||1e-6))*(h-pad*2)
  function lineSmooth(values:number[], color:string, opts?:{fill?:boolean, dashed?:boolean}){
    if(values.length===0) return
    const min = Math.min(...values), max = Math.max(...values)
    if(max===min){
      const y = val(min, min-1, max+1)
      ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=2
      if(opts?.dashed) ctx.setLineDash([6,4])
      ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke(); ctx.setLineDash([])
      // markers
      for(let i=0;i<values.length;i++){ const x=xs(i); ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); ctx.strokeStyle=card; ctx.lineWidth=1; ctx.stroke() }
      return
    }
    // optional area fill (for clicks)
    if(opts?.fill){
      const grad = ctx.createLinearGradient(0,pad,0,h-pad)
      grad.addColorStop(0, color+'55'); grad.addColorStop(1, card)
      ctx.fillStyle = grad
      ctx.beginPath()
      for(let i=0;i<values.length;i++){
        const x=xs(i), y=val(values[i], min, max)
        if(i===0) ctx.moveTo(x,y); else {
          const px=xs(i-1), py=val(values[i-1], min, max)
          const mx=(px+x)/2, my=(py+y)/2
          ctx.quadraticCurveTo(px, py, mx, my)
        }
      }
      ctx.lineTo(w-pad,h-pad); ctx.lineTo(pad,h-pad); ctx.closePath(); ctx.fill()
    }
    // stroke
    ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=2
    if(opts?.dashed) ctx.setLineDash([6,4])
    for(let i=0;i<values.length;i++){
      const x=xs(i), y=val(values[i], min, max)
      if(i===0) ctx.moveTo(x,y); else {
        const px=xs(i-1), py=val(values[i-1], min, max)
        const mx=(px+x)/2, my=(py+y)/2
        ctx.quadraticCurveTo(px, py, mx, my)
      }
    }
    ctx.stroke(); ctx.setLineDash([])
    // markers
    values.forEach((v,i)=>{ const x=xs(i), y=val(v, min, max); ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); ctx.strokeStyle=card; ctx.lineWidth=1; ctx.stroke() })
  }

  if(active.clicks) lineSmooth(data.map(d=>d.clicks),'#a78bfa',{fill:true}) // purple with area
  if(active.impressions) lineSmooth(data.map(d=>d.impressions),'#22c55e') // green
  if(active.ctr && !false) lineSmooth(data.map(d=>d.ctr),'#fbbf24') // yellow (hidden by default via active)
  if(active.position) lineSmooth(data.map(d=>d.position),'#fbbf24',{dashed:true}) // dashed yellow

  // X-axis labels (dates)
  ctx.fillStyle = muted
  ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto'
  ctx.textAlign = 'center'
  const n = data.length
  if(n>1){
    const targetLabels = 8
    const step = Math.max(1, Math.round(n/targetLabels))
    for(let i=0;i<n;i+=step){
      const x = xs(i)
      const date = data[i].date
      ctx.fillText(date, x, h-6)
    }
  }

  // Hover vertical line
  if(hoverIndex!==null && hoverIndex>=0 && hoverIndex<data.length){
    const x = xs(hoverIndex)
    ctx.strokeStyle = border
    ctx.lineWidth = 1
    ctx.setLineDash([4,4])
    ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h-pad); ctx.stroke();
    ctx.setLineDash([])
  }
}

export default function PerformancePanel({ points, hideCtr=false }: { points: Point[], hideCtr?: boolean }){
  const canvas = useRef<HTMLCanvasElement>(null)
  const [active, setActive] = useState<Active>({ clicks: true, impressions: true, ctr: !hideCtr, position: true })
  const [hoverIndex, setHoverIndex] = useState<number|null>(null)

  useEffect(()=>{ if(points?.length && canvas.current){ const ctx = canvas.current.getContext('2d')!; draw(ctx, points, active, hoverIndex) } },[points, active, hoverIndex])

  const toggle = (key: keyof Active) => setActive(prev => ({ ...prev, [key]: !prev[key] }))

  // Mouse handling for tooltip
  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const w = e.currentTarget.width
    const pad = 34
    if(points.length<2){ setHoverIndex(null); return }
    const step = (w - pad*2)/(points.length-1)
    let idx = Math.round((x - pad)/step)
    if(idx<0) idx = 0; if(idx>points.length-1) idx = points.length-1
    setHoverIndex(idx)
  }
  const onLeave = () => setHoverIndex(null)

  return (
    <div className="card">
      <div className="panel-title">
        <div>
          <div style={{fontWeight:700}}>Performance Trends</div>
          <div className="muted">Track your search performance over time</div>
        </div>
        <div className="legend">
          <span className={`item ${active.clicks? '':'off'}`} onClick={()=>toggle('clicks')} style={{color: active.clicks? '#a78bfa' : undefined}}><span className="dot" style={{background:'#a78bfa'}}/>Clicks</span>
          <span className={`item ${active.impressions? '':'off'}`} onClick={()=>toggle('impressions')} style={{color: active.impressions? '#22c55e' : undefined}}><span className="dot" style={{background:'#22c55e'}}/>Impressions</span>
          {(!hideCtr) && <span className={`item ${active.ctr? '':'off'}`} onClick={()=>toggle('ctr')} style={{color: active.ctr? '#fbbf24' : undefined}}><span className="dot" style={{background:'#fbbf24'}}/>CTR (%)</span>}
          <span className={`item ${active.position? '':'off'}`} onClick={()=>toggle('position')} style={{color: active.position? '#fbbf24' : undefined}}><span className="dot" style={{background:'#fbbf24'}}/>Average Position</span>
        </div>
      </div>
      <div className="chart" style={{height:340, position:'relative'}}>
        <canvas ref={canvas} width={820} height={260} onMouseMove={onMove} onMouseLeave={onLeave} />
        {(!points || points.length===0) && (
          <div className="muted" style={{position:'absolute', inset:0, display:'grid', placeItems:'center'}}>No data for selected period</div>
        )}
        {hoverIndex!==null && points[hoverIndex] && (
          <div style={{position:'absolute', top:12, left:`calc(34px + ${(hoverIndex/(Math.max(1,points.length-1)))*100}% - 120px)`, background:'var(--menu-bg)', border:'1px solid var(--menu-border)', borderRadius:8, padding:'8px 10px', width:240, pointerEvents:'none'}}>
            <div style={{fontWeight:700, marginBottom:4}}>{points[hoverIndex].date}</div>
            {active.clicks && <div>Clicks: <strong>{points[hoverIndex].clicks}</strong></div>}
            {active.impressions && <div>Impressions: <strong>{points[hoverIndex].impressions}</strong></div>}
            {active.ctr && !hideCtr && <div>CTR (%): <strong>{points[hoverIndex].ctr.toFixed(1)}</strong></div>}
            {active.position && <div>Average Position: <strong>{points[hoverIndex].position.toFixed(1)}</strong></div>}
          </div>
        )}
      </div>
    </div>
  )
}
