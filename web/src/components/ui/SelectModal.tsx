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
      <div className="form-grid">
        <input className="input" placeholder="Search..." value={query} onChange={e=>setQuery(e.target.value)} />
        <select className="input" value={selected} onChange={e=>setSelected(e.target.value)}>
          <option value="" disabled>Select...</option>
          {filtered.map((it)=> <option key={getKey(it)} value={getKey(it)}>{getLabel(it)}</option>)}
        </select>
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Close</button>
        <button className="btn" onClick={()=>{ const v = selected || (filtered[0]? getKey(filtered[0]) : ''); if(v){ onSelect(v); onClose(); } }}>Save</button>
      </div>
    </Modal>
  )
}

