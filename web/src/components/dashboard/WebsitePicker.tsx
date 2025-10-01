"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import AddWebsiteModal, { Website } from "./AddWebsiteModal"

function load(): Website[]{
  if(typeof window === 'undefined') return []
  try{ return JSON.parse(localStorage.getItem('websites')||'[]') }catch{ return [] }
}
function save(list: Website[]){ localStorage.setItem('websites', JSON.stringify(list)) }

export default function WebsitePicker({ onChange, showAll }: { onChange?: (site?: Website) => void, showAll?: boolean }){
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [websites, setWebsites] = useState<Website[]>([])
  const [activeId, setActiveId] = useState<string|undefined>(undefined)
  const [showList, setShowList] = useState(false)
  const [query, setQuery] = useState("")
  const box = useRef<HTMLDivElement>(null)
  const [limit, setLimit] = useState<number>(5)
  const [planName, setPlanName] = useState<string>('basic')

  useEffect(()=>{
    const ws = load()
    setWebsites(ws)
    const saved = localStorage.getItem('activeWebsiteId') || (showAll? '__ALL__' : ws[0]?.id)
    setActiveId(saved)
  },[showAll])

  useEffect(()=>{
    (async()=>{
      try{
        const email = (session as any)?.user?.email as string|undefined
        if(!email) return
        const r = await fetch('/api/admin/plan?email='+encodeURIComponent(email))
        const j = await r.json(); const name = (j?.plan?.name||'basic') as 'basic'|'pro'|'agency'
        setPlanName(name)
        const map: Record<string, number> = { basic: 1, pro: 5, agency: 50 }
        setLimit(map[name]||5)
      }catch{}
    })()
  }, [session])

  const active = useMemo(()=> websites.find(w=>w.id===activeId), [websites, activeId])
  useEffect(()=>{
    if(activeId==='__ALL__'){
      if(onChange) onChange(undefined)
      localStorage.setItem('activeWebsiteId', '__ALL__')
    } else if(active){
      if(onChange) onChange(active)
      localStorage.setItem('activeWebsiteId', active.id)
    }
  }, [activeId, active])

  const create = (w: Website) => {
    const next = [...websites, w]; setWebsites(next); save(next); setOpen(false); setActiveId(w.id)
  }

  return (
    <div style={{display:'flex', alignItems:'center', gap:8, position:'relative'}} ref={box}>
      <div className="picker" onClick={()=>setShowList(v=>!v)} style={{cursor:'pointer'}}>
        <span style={{fontWeight:700}}>{activeId==='__ALL__'? 'All Sites' : (active? active.name : 'No website selected')}</span>
      </div>
      {(websites.length < limit) && (
        <button className="btn secondary" onClick={()=>setOpen(true)} title={`Add Website (${planName} plan limit: ${limit})`} style={{height:36}}>+
        </button>
      )}
      {showList && (
        <div style={{position:'absolute', top:'110%', left:0, background:'var(--menu-bg)', border:'1px solid var(--menu-border)', borderRadius:10, minWidth:280, zIndex:40}}>
          <div style={{padding:8}}>
            <input className="input" placeholder="Search websites…" value={query} onChange={e=>setQuery(e.target.value)} />
          </div>
          {showAll && (
            <div key="__ALL__" onClick={()=>{ setActiveId('__ALL__'); setShowList(false) }} style={{padding:'8px 12px', cursor:'pointer', background: activeId==='__ALL__'? 'var(--menu-active-bg)':'transparent'}}>
              <div style={{fontWeight:700}}>All Sites</div>
              <div className="muted" style={{fontSize:12}}>Aggregate dashboard</div>
            </div>
          )}
          {websites.length===0 && <div style={{padding:10}} className="muted">No websites. Add one.</div>}
          {websites.filter(w => (w.name+" "+w.url).toLowerCase().includes(query.toLowerCase())).map(w => (
            <div key={w.id} onClick={()=>{ setActiveId(w.id); setShowList(false) }} style={{padding:'8px 12px', cursor:'pointer', background: w.id===activeId? 'var(--menu-active-bg)':'transparent'}}>
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
