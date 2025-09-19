"use client"
import { useEffect, useRef } from "react"

function drawLine(ctx: CanvasRenderingContext2D, data: number[], color: string){
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  const pad = 24
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = Math.max(1, max-min)
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  data.forEach((v,i)=>{
    const x = pad + (i*(w-pad*2))/(data.length-1)
    const y = h-pad - ((v-min)/range)*(h-pad*2)
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y)
  })
  ctx.stroke()
}

export default function DashboardCharts(){
  const c1 = useRef<HTMLCanvasElement>(null)
  const c2 = useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const d1 = [4,8,5,12,9,14,11,15,12,16,14,18]
    const d2 = [10,11,9,13,12,10,15,14,16,13,12,17]
    const ctx1 = c1.current!.getContext('2d')!
    ctx1.clearRect(0,0,ctx1.canvas.width,ctx1.canvas.height)
    drawLine(ctx1, d1, '#22d3ee')
    drawLine(ctx1, d2, '#a78bfa')

    const ctx2 = c2.current!.getContext('2d')!
    const values = [22, 38, 18, 9, 13]
    const colors = ['#22c55e','#84cc16','#06b6d4','#a78bfa','#f59e0b']
    const total = values.reduce((a,b)=>a+b,0)
    let start = -Math.PI/2
    ctx2.clearRect(0,0,ctx2.canvas.width,ctx2.canvas.height)
    values.forEach((v,i)=>{
      const slice = (v/total)*Math.PI*2
      ctx2.beginPath()
      ctx2.moveTo(140,90)
      ctx2.arc(140,90,80,start,start+slice)
      ctx2.fillStyle = colors[i]
      ctx2.fill()
      start += slice
    })
  },[])
  return (
    <section className="grid" style={{gridTemplateColumns:'1.2fr .8fr'}}>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>Performance Trends <span className="muted">Clicks, Impressions</span></div>
        <div className="chart" style={{height:320}}>
          <canvas ref={c1} width={760} height={260}/>
        </div>
      </div>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>Keyword Distribution <span className="muted">Top positions</span></div>
        <div className="chart" style={{height:320}}>
          <canvas ref={c2} width={280} height={180}/>
        </div>
      </div>
    </section>
  )
}

