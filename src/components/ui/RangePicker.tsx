"use client"
import { useEffect, useMemo, useState } from "react"

type Range = { from: Date, to: Date }

const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function startOfMonth(d: Date){ return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date){ return new Date(d.getFullYear(), d.getMonth()+1, 0) }
function addMonths(d: Date, n: number){ const x = new Date(d); x.setMonth(x.getMonth()+n); return x }
function format(d: Date){ const dd = String(d.getDate()).padStart(2,'0'); const mm = months[d.getMonth()]; const yyyy = d.getFullYear(); return `${dd} ${mm} ${yyyy}` }
function fmtISO(d: Date){ return d.toISOString().slice(0,10) }

function daysInGrid(anchor: Date){
  const first = startOfMonth(anchor)
  const startIdx = (first.getDay()+7)%7 // Sunday=0
  const total = endOfMonth(anchor).getDate()
  const arr: Date[] = []
  // previous month spill
  for(let i=startIdx-1;i>=0;i--){ const d = new Date(first); d.setDate(first.getDate()-i-1); arr.push(d) }
  for(let i=1;i<=total;i++){ const d = new Date(first); d.setDate(i); arr.push(d) }
  while(arr.length % 7 !== 0){ const d = new Date(arr[arr.length-1]); d.setDate(d.getDate()+1); arr.push(d) }
  return arr
}

export default function RangePicker({ open, onClose, value, onApply }: { open: boolean, onClose: ()=>void, value: Range, onApply: (r: Range)=>void }){
  const [left, setLeft] = useState<Date>(startOfMonth(value.from))
  const [right, setRight] = useState<Date>(startOfMonth(addMonths(value.from,1)))
  const [from, setFrom] = useState<Date>(value.from)
  const [to, setTo] = useState<Date>(value.to)

  useEffect(()=>{ if(open){ setLeft(startOfMonth(value.from)); setRight(startOfMonth(addMonths(value.from,1))); setFrom(value.from); setTo(value.to) } },[open])

  const select = (d: Date) => {
    if(from && to && from.getTime() !== to.getTime()){
      setFrom(d); setTo(d); return
    }
    if(!from){ setFrom(d); setTo(d); return }
    if(d < from){ setTo(from); setFrom(d); return }
    setTo(d)
  }
  const setPreset = (label: string) => {
    const today = new Date()
    let start: Date, end: Date
    if(label==='Today'){ start=end=today }
    else if(label==='Yesterday'){ const y=new Date(); y.setDate(y.getDate()-1); start=end=y }
    else if(label==='Last 7 Days'){ end=new Date(today); end.setDate(end.getDate()-1); start=new Date(end); start.setDate(end.getDate()-6) }
    else if(label==='Last 30 Days'){ end=new Date(today); end.setDate(end.getDate()-1); start=new Date(end); start.setDate(end.getDate()-29) }
    else if(label==='Last 90 Days'){ end=new Date(today); end.setDate(end.getDate()-1); start=new Date(end); start.setDate(end.getDate()-89) }
    else if(label==='This Month'){ start=startOfMonth(today); end=today }
    else if(label==='Last Month'){ const lm=addMonths(today,-1); start=startOfMonth(lm); end=endOfMonth(lm) }
    else { return }
    setFrom(start); setTo(end); setLeft(startOfMonth(start)); setRight(startOfMonth(addMonths(start,1)))
  }

  const inRange = (d: Date) => d>=new Date(from.getFullYear(), from.getMonth(), from.getDate()) && d<=new Date(to.getFullYear(), to.getMonth(), to.getDate())
  const isSameDay = (a: Date, b: Date)=> a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
  const classes = (d: Date, month: number) => {
    const curMonth = d.getMonth()===month
    const cls = ["rp-day"]
    if(!curMonth) cls.push('muted')
    if(inRange(d)) cls.push('in')
    if(isSameDay(d, from)) cls.push('start')
    if(isSameDay(d, to)) cls.push('end')
    return cls.join(' ')
  }

  if(!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{width: 760}}>
        <div style={{display:'grid', gridTemplateColumns:'200px 1fr 1fr', gap:16}}>
          <div style={{borderRight:'1px solid var(--menu-border)', paddingRight:10, maxHeight:340, overflow:'auto'}}>
            {['Today','Yesterday','Last 7 Days','Last 30 Days','This Month','Last Month','Last 90 Days'].map(p => (
              <div key={p} style={{padding:'8px 10px', cursor:'pointer', borderRadius:8}} onClick={()=>setPreset(p)} className="picker-item">{p}</div>
            ))}
          </div>
          {/* Left month */}
          <div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <button className="btn secondary" onClick={()=>{ setLeft(addMonths(left,-1)); setRight(addMonths(right,-1)) }}>&lt;</button>
              <strong>{months[left.getMonth()]} {left.getFullYear()}</strong>
              <span/>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:6, fontSize:12, color:'var(--muted)', marginBottom:6}}>
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=> <div key={d} style={{textAlign:'center'}}>{d}</div>)}
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:6}}>
              {daysInGrid(left).map((d,i)=> (
                <button type="button" key={i} className={classes(d, left.getMonth())} onClick={()=>select(d)}>{d.getDate()}</button>
              ))}
            </div>
          </div>
          {/* Right month */}
          <div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <span/>
              <strong>{months[right.getMonth()]} {right.getFullYear()}</strong>
              <button className="btn secondary" onClick={()=>{ setLeft(addMonths(left,1)); setRight(addMonths(right,1)) }}>&gt;</button>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:6, fontSize:12, color:'var(--muted)', marginBottom:6}}>
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=> <div key={d} style={{textAlign:'center'}}>{d}</div>)}
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:6}}>
              {daysInGrid(right).map((d,i)=> (
                <button type="button" key={i} className={classes(d, right.getMonth())} onClick={()=>select(d)}>{d.getDate()}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12}}>
          <div className="muted">{format(from)} - {format(to)}</div>
          <div className="actions">
            <button className="btn secondary" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={()=>{ onApply({ from, to }); onClose() }}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  )
}
