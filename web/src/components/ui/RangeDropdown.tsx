"use client"
import { useMemo, useState } from 'react'
import RangePicker from './RangePicker'

export type DateRange = { from: Date, to: Date }

function toLabel(r: DateRange){
  const fmt = (d:Date)=> d.toLocaleDateString(undefined,{ day:'numeric', month:'short', year:'numeric' })
  return `${fmt(r.from)} - ${fmt(r.to)}`
}

export default function RangeDropdown({ value, onChange, maxDays }: { value: DateRange, onChange: (r: DateRange)=>void, maxDays?: number }){
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const presets = useMemo(()=>{
    const today = new Date(); const y = new Date(); y.setDate(today.getDate()-1)
    const mk = (days:number)=> ({ from: new Date(y.getTime() - (days-1)*86400000), to: y })
    const list = [
      { key:'7', label:'Last 7 Days', range: mk(7) },
      { key:'28', label:'Last 28 Days', range: mk(28) },
      { key:'30', label:'Last 30 Days', range: mk(30) },
      { key:'90', label:'Last 3 Months', range: mk(90) },
      { key:'180', label:'Last 6 Months', range: mk(180) },
      { key:'365', label:'Last 12 Months', range: mk(365) },
      { key:'this', label:'This Month', range: { from: new Date(y.getFullYear(), y.getMonth(), 1), to: y } },
      { key:'last', label:'Last Month', range: { from: new Date(y.getFullYear(), y.getMonth()-1, 1), to: new Date(y.getFullYear(), y.getMonth(), 0) } },
    ]
    if(!maxDays) return list
    const days = (r:DateRange)=> Math.max(1, Math.round((r.to.getTime()-r.from.getTime())/86400000)+1)
    return list.filter(p=> days(p.range) <= maxDays)
  },[maxDays])

  return (
    <div style={{position:'relative'}}>
      <div className="picker" onClick={()=>setOpen(v=>!v)} style={{cursor:'pointer'}}>
        <span>{toLabel(value)}</span>
      </div>
      {open && (
        <div style={{position:'absolute', right:0, top:'110%', background:'var(--menu-bg)', border:'1px solid var(--menu-border)', borderRadius:10, minWidth:240, zIndex:50, padding:8}}>
          {presets.map(p=> (
            <div key={p.key} onClick={()=>{ onChange(p.range); setOpen(false) }} style={{padding:'8px 10px', cursor:'pointer', borderRadius:8}}>{p.label}</div>
          ))}
          <div onClick={()=>{ setShowCustom(true); }} style={{padding:'8px 10px', cursor:'pointer', borderRadius:8, borderTop:'1px solid var(--menu-border)', marginTop:4}}>Custom…</div>
        </div>
      )}
      <RangePicker open={showCustom} onClose={()=>setShowCustom(false)} value={value} onApply={(r)=>{ 
        let out = r
        if(maxDays){
          const days = Math.max(1, Math.round((r.to.getTime()-r.from.getTime())/86400000)+1)
          if(days>maxDays){ const to = new Date(r.to); const from = new Date(to.getTime() - (maxDays-1)*86400000); out = { from, to } }
        }
        onChange(out); setShowCustom(false); setOpen(false) }} />
    </div>
  )
}


