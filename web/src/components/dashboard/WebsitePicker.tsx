"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import AddWebsiteModal, { Website } from "./AddWebsiteModal"

function load(): Website[]{
  if(typeof window === 'undefined') return []
  try{ return JSON.parse(localStorage.getItem('websites')||'[]') }catch{ return [] }
}
function save(list: Website[]){ localStorage.setItem('websites', JSON.stringify(list)) }

export default function WebsitePicker({ onChange }: { onChange?: (site?: Website) => void }){
  const [open, setOpen] = useState(false)
  const [websites, setWebsites] = useState<Website[]>([])
  const [activeId, setActiveId] = useState<string|undefined>(undefined)
  const [showList, setShowList] = useState(false)
  const [query, setQuery] = useState("")
  const box = useRef<HTMLDivElement>(null)

  useEffect(()=>{
    const ws = load()
    setWebsites(ws)
    const saved = localStorage.getItem('activeWebsiteId') || ws[0]?.id
    setActiveId(saved)
  },[])

  const active = useMemo(()=> websites.find(w=>w.id===activeId), [websites, activeId])
  useEffect(()=>{ if(onChange) onChange(active); if(active) localStorage.setItem('activeWebsiteId', active.id) }, [active])

  const create = (w: Website) => {
    const next = [...websites, w]; setWebsites(next); save(next); setOpen(false); setActiveId(w.id)
  }

  return (
    <div style={{display:'flex', alignItems:'center', gap:8, position:'relative'}} ref={box}>
      <div className="picker" onClick={()=>setShowList(v=>!v)} style={{cursor:'pointer'}}>
        <span style={{fontWeight:700}}>{active? active.name : 'No website selected'}</span>
      </div>
      <button className="btn secondary" onClick={()=>setOpen(true)} title="Add Website" style={{height:36}}>+
      </button>
      {showList && (
        <div style={{position:'absolute', top:'110%', left:0, background:'#0f0f20', border:'1px solid #2b2b47', borderRadius:10, minWidth:280, zIndex:40}}>
          <div style={{padding:8}}>
            <input className="input" placeholder="Search websites…" value={query} onChange={e=>setQuery(e.target.value)} />
          </div>
          {websites.length===0 && <div style={{padding:10}} className="muted">No websites. Add one.</div>}
          {websites.filter(w => (w.name+" "+w.url).toLowerCase().includes(query.toLowerCase())).map(w => (
            <div key={w.id} onClick={()=>{ setActiveId(w.id); setShowList(false) }} style={{padding:'8px 12px', cursor:'pointer', background: w.id===activeId? '#18182b':'transparent'}}>
              <div style={{fontWeight:700}}>{w.name}</div>
              <div className="muted" style={{fontSize:12}}>{w.url}</div>
            </div>
          ))}
        </div>
      )}
      <AddWebsiteModal open={open} onClose={()=>setOpen(false)} onCreate={create}/>
    </div>
  )
}
