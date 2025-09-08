"use client"
import { useEffect, useRef } from "react"

type Slice = { label: string, value: number, color: string }

export default function DonutChart({ title, slices }: { title: string, slices: Slice[] }){
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const total = slices.reduce((a,s)=>a+s.value,0) || 1
    const ctx = ref.current!.getContext('2d')!
    const cx = 160, cy = 120, r = 90
    ctx.clearRect(0,0,400,260)
    let start = -Math.PI/2
    slices.forEach(s => {
      const sweep = (s.value/total)*Math.PI*2
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,start+sweep); ctx.closePath(); ctx.fillStyle=s.color; ctx.fill(); start+=sweep
    })
    // hole
    ctx.globalCompositeOperation='destination-out'
    ctx.beginPath(); ctx.arc(cx,cy,56,0,Math.PI*2); ctx.fill()
    ctx.globalCompositeOperation='source-over'
  },[slices])
  return (
    <div className="card">
      <div className="panel-title"><strong>{title}</strong><span className="badge">1232 Keywords</span></div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', alignItems:'center'}}>
        <canvas ref={ref} width={320} height={240}/>
        <div className="legend">
          {slices.map(s=> (
            <div key={s.label} style={{display:'flex', alignItems:'center', gap:8}}>
              <span className="dot" style={{background:s.color}}/>{s.label} ({s.value})
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

