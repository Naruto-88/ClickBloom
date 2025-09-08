"use client"
import { useEffect, useRef, useState } from "react"

export type Point = { date: string; clicks: number; impressions: number; ctr: number; position: number }

type Active = { clicks: boolean; impressions: boolean; ctr: boolean; position: boolean }

function draw(ctx: CanvasRenderingContext2D, data: Point[], active: Active, hoverIndex: number | null){
  const w = ctx.canvas.width, h = ctx.canvas.height
  const pad = 34
  ctx.clearRect(0,0,w,h)
  // grid
  ctx.strokeStyle = '#232343'; ctx.lineWidth = 1
  for(let i=0;i<5;i++){ const y = pad + (i*(h-pad*2))/4; ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke() }
  const xs = (i:number)=> pad + (i*(w-pad*2))/(data.length-1)
  const val = (v:number,min:number,max:number)=> h-pad - ((v-min)/(max-min))*(h-pad*2)
  // lines
  function line(values:number[], color:string){
    if(values.length<2){
      const min = Math.min(...values), max = Math.max(...values)
      ctx.fillStyle = color
      const x = (pad + (w-pad*2)/2)
      const y = val(values[0]||0, min-1, max+1)
      ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
      return
    }
    const min = Math.min(...values)
    const max = Math.max(...values)
    if(min===max){
      // avoid div by zero, draw flat line
      ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=2
      const y = val(min, min-1, max+1)
      ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke();
      return
    }
    ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=2
    values.forEach((v,i)=>{ const x=xs(i); const y=val(v, min, max); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y) }); ctx.stroke();
    values.forEach((v,i)=>{ const x=xs(i), y=val(v, min, max); ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.stroke() })
  }

  if(active.clicks) line(data.map(d=>d.clicks),'#a78bfa') // purple
  if(active.impressions) line(data.map(d=>d.impressions),'#22d3ee') // cyan
  if(active.ctr) line(data.map(d=>d.ctr),'#fbbf24') // yellow
  if(active.position) line(data.map(d=>d.position),'#7dd3fc') // light blue

  // X-axis labels (dates)
  ctx.fillStyle = '#a3a6c2'
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
    ctx.strokeStyle = '#3b3b5e'
    ctx.lineWidth = 1
    ctx.setLineDash([4,4])
    ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h-pad); ctx.stroke();
    ctx.setLineDash([])
  }
}

export default function PerformancePanel({ points }: { points: Point[] }){
  const canvas = useRef<HTMLCanvasElement>(null)
  const [active, setActive] = useState<Active>({ clicks: true, impressions: true, ctr: true, position: true })
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
          <span className={`item ${active.clicks? '':'off'}`} onClick={()=>toggle('clicks')}><span className="dot" style={{background:'#a78bfa'}}/>Clicks</span>
          <span className={`item ${active.impressions? '':'off'}`} onClick={()=>toggle('impressions')}><span className="dot" style={{background:'#22d3ee'}}/>Impressions</span>
          <span className={`item ${active.ctr? '':'off'}`} onClick={()=>toggle('ctr')}><span className="dot" style={{background:'#fbbf24'}}/>CTR (%)</span>
          <span className={`item ${active.position? '':'off'}`} onClick={()=>toggle('position')}><span className="dot" style={{background:'#7dd3fc'}}/>Average Position</span>
        </div>
      </div>
      <div className="chart" style={{height:340, position:'relative'}}>
        <canvas ref={canvas} width={820} height={260} onMouseMove={onMove} onMouseLeave={onLeave} />
        {(!points || points.length===0) && (
          <div className="muted" style={{position:'absolute', inset:0, display:'grid', placeItems:'center'}}>No data for selected period</div>
        )}
        {hoverIndex!==null && points[hoverIndex] && (
          <div style={{position:'absolute', top:12, left:`calc(34px + ${(hoverIndex/(Math.max(1,points.length-1)))*100}% - 120px)`, background:'#141428', border:'1px solid #2b2b47', borderRadius:8, padding:'8px 10px', width:240, pointerEvents:'none'}}>
            <div style={{fontWeight:700, marginBottom:4}}>{points[hoverIndex].date}</div>
            {active.clicks && <div>Clicks: <strong>{points[hoverIndex].clicks}</strong></div>}
            {active.impressions && <div>Impressions: <strong>{points[hoverIndex].impressions}</strong></div>}
            {active.ctr && <div>CTR (%): <strong>{points[hoverIndex].ctr.toFixed(1)}</strong></div>}
            {active.position && <div>Average Position: <strong>{points[hoverIndex].position.toFixed(1)}</strong></div>}
          </div>
        )}
      </div>
    </div>
  )
}
