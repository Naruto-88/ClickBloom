"use client"
import { useEffect, useMemo, useState } from "react"
import Modal from "./Modal"

export default function SelectModal({ open, title, items, getKey, getLabel, onSelect, onClose }: {
  open: boolean,
  title: string,
  items: any[],
  getKey: (x:any)=>string,
  getLabel: (x:any)=>string,
  onSelect: (key: string)=>void,
  onClose: ()=>void
}){
  const [selected, setSelected] = useState<string|undefined>()
  const [query, setQuery] = useState("")
  useEffect(()=>{ if(!open){ setSelected(undefined); setQuery("") } },[open])
  const filtered = useMemo(()=> items.filter(it => getLabel(it).toLowerCase().includes(query.toLowerCase())), [items, query, getLabel])
  useEffect(()=>{
    if(!open) return
    if(!selected && filtered.length>0){ try{ setSelected(getKey(filtered[0])) }catch{} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, items])
  return (
    <Modal open={open} onClose={onClose}>
      <h3 style={{marginTop:0}}>{title}</h3>
      {/* Combined searchable dropdown: search input at top of list */}
      <div style={{border:'1px solid #1f2937', borderRadius:10, overflow:'hidden'}}>
        <div style={{position:'sticky' as const, top:0, background:'#0b1020', padding:8, borderBottom:'1px solid #1f2937'}}>
          <input className="input" placeholder="Search..." value={query} onChange={e=>setQuery(e.target.value)} />
        </div>
        <div style={{maxHeight:300, overflowY:'auto'}}>
          {filtered.length===0 && (
            <div style={{padding:12}} className="muted">No results</div>
          )}
          {filtered.map((it)=>{
            const key = getKey(it)
            const label = getLabel(it)
            const active = key===selected
            return (
              <div key={key} onClick={()=>setSelected(key)}
                style={{padding:'10px 12px', cursor:'pointer', background: active? '#111827' : undefined, display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #1f2937'}}>
                <div style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={label}>{label}</div>
                {active && <span className="badge">Selected</span>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Close</button>
        <button className="btn" onClick={()=>{ const v = selected || (filtered[0]? getKey(filtered[0]) : ''); if(v){ onSelect(v); onClose(); } }}>Save</button>
      </div>
    </Modal>
  )
}

