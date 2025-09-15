"use client"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

type Website = { id: string, name: string, url: string }
type Integration = { gscSite?: string, ga4Property?: string }

type DateRange = { from: Date, to: Date }

function loadSites(): Website[]{ try{ return JSON.parse(localStorage.getItem('websites')||'[]') }catch{ return [] } }
function loadIntegrations(id?: string): Integration{ if(!id) return {}; try{ return JSON.parse(localStorage.getItem('integrations:'+id)||'{}') }catch{ return {} } }

function last7Days(): DateRange{
  const y = new Date(); y.setDate(y.getDate()-1)
  const s = new Date(y); s.setDate(y.getDate()-6)
  return { from: s, to: y }
}

function lastNDays(n:number): DateRange{
  const y = new Date(); y.setDate(y.getDate()-1)
  const s = new Date(y); s.setDate(y.getDate()-(n-1))
  return { from: s, to: y }
}

function lastMonth(): DateRange{
  const y = new Date(); y.setDate(y.getDate()-1)
  const from = new Date(y.getFullYear(), y.getMonth()-1, 1)
  const to = new Date(y.getFullYear(), y.getMonth(), 0)
  return { from, to }
}

function fmtDateISO(d: Date){ return d.toISOString().slice(0,10) }
function pct(a:number, b:number){ if(!b) return 0; return (a-b)/b*100 }

function acronym(name: string){
  const parts = (name||'').split(/\s+|-/).filter(Boolean)
  if(!parts.length) return (name||'??').slice(0,2).toUpperCase()
  return (parts[0][0] + (parts[1]?.[0]||'')).toUpperCase()
}

type Row = {
  id: string
  name: string
  url: string
  gscClicks: number
  gscImpr: number
  gscPos: number
  gscClicksPrev: number
  gscImprPrev: number
  gscPosPrev: number
  ga4Sessions: number
  ga4SessionsPrev: number
  status: 'good'|'warn'|'bad'
}

export default function ClientsDashboard(){
  const router = useRouter()
  const [range, setRange] = useState<DateRange>(last7Days)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [highlightId, setHighlightId] = useState<string|undefined>()
  const [showPrev, setShowPrev] = useState(true)
  const [sortBy, setSortBy] = useState<'worst'|'clicks'|'sessions'|'name'>('worst')
  const [statusFilter, setStatusFilter] = useState<'all'|'attention'|'red'|'orange'|'green'>('all')
  const presets = useMemo(()=>([
    { key:'7d', label:'7 Days', range: lastNDays(7) },
    { key:'30d', label:'30 Days', range: lastNDays(30) },
    { key:'lastm', label:'Last Month', range: lastMonth() },
    { key:'6m', label:'Last 6 Months', range: lastNDays(180) },
    { key:'1y', label:'Last Year', range: lastNDays(365) },
  ]), [])
  const [activeKey, setActiveKey] = useState<string>('7d')

  const sites = useMemo(()=> loadSites(), [])

  async function fetchGscTotals(siteUrl: string, start: string, end: string){
    const res = await fetch(`/api/google/gsc/search?site=${encodeURIComponent(siteUrl)}&start=${start}&end=${end}`)
    if(!res.ok) return { clicks:0, impressions:0, position:0, rows:0 }
    const data = await res.json()
    const rows:any[] = data.rows||[]
    const clicks = rows.reduce((a,r)=> a + (r.clicks||0), 0)
    const impressions = rows.reduce((a,r)=> a + (r.impressions||0), 0)
    const position = rows.length ? rows.reduce((a,r)=> a + (r.position||0), 0) / rows.length : 0
    return { clicks, impressions, position, rows: rows.length }
  }

  async function fetchGa4Sessions(property: string, start: string, end: string){
    try{
      const res = await fetch('/api/google/ga4/report', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property, start, end }) })
      if(!res.ok) return 0
      const data = await res.json()
      const rows = (data.rows||[]) as any[]
      const idx = (data.metricHeaders||[]).findIndex((m:any)=> m.name==='sessions')
      if(idx<0) return 0
      const total = rows.reduce((a,r)=> a + Number(r.metricValues?.[idx]?.value || 0), 0)
      return total
    }catch{ return 0 }
  }

  function decideStatus(curr: { clicks:number, impressions:number, pos:number, sessions:number }, prev: { clicks:number, impressions:number, pos:number, sessions:number }): 'good'|'warn'|'bad'{
    const dClicks = pct(curr.clicks, prev.clicks)
    const dImpr = pct(curr.impressions, prev.impressions)
    const dPos = (curr.pos - prev.pos) // positive = worse
    const dSess = pct(curr.sessions, prev.sessions)
    if(dClicks < -20 || dImpr < -20 || dSess < -20 || dPos > 5) return 'bad'
    if(dClicks < -5 || dImpr < -5 || dSess < -5 || dPos > 2) return 'warn'
    return 'good'
  }

  const load = async () => {
    setLoading(true)
    try{
      const start = fmtDateISO(range.from)
      let endDate = range.to
      // Clamp end to yesterday (GSC latency)
      const y = new Date(); y.setDate(y.getDate()-1)
      if(endDate > y) endDate = y
      const end = fmtDateISO(endDate)
      const days = Math.max(1, Math.round((endDate.getTime()-range.from.getTime())/86400000)+1)
      const prevEnd = new Date(range.from); prevEnd.setDate(prevEnd.getDate()-1)
      const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate()-(days-1))
      const pStart = fmtDateISO(prevStart); const pEnd = fmtDateISO(prevEnd)

      const out: Row[] = []
      for(const w of sites){
        const integ = loadIntegrations(w.id)
        const gscSite = integ.gscSite
        const ga4Prop = integ.ga4Property

        let gCurr = { clicks:0, impressions:0, position:0, rows:0 }
        let gPrev = { clicks:0, impressions:0, position:0, rows:0 }
        if(gscSite){
          try{ gCurr = await fetchGscTotals(gscSite, start, end) }catch{}
          try{ gPrev = await fetchGscTotals(gscSite, pStart, pEnd) }catch{}
        }

        let sessions = 0, sessionsPrev = 0
        if(ga4Prop){
          try{ sessions = await fetchGa4Sessions(ga4Prop, start, end) }catch{}
          try{ sessionsPrev = await fetchGa4Sessions(ga4Prop, pStart, pEnd) }catch{}
        }

        const status = decideStatus(
          { clicks: gCurr.clicks, impressions: gCurr.impressions, pos: gCurr.position||0, sessions },
          { clicks: gPrev.clicks, impressions: gPrev.impressions, pos: gPrev.position||0, sessions: sessionsPrev }
        )

        out.push({
          id: w.id, name: w.name, url: w.url,
          gscClicks: gCurr.clicks, gscImpr: gCurr.impressions, gscPos: Math.round((gCurr.position||0)*10)/10,
          gscClicksPrev: gPrev.clicks, gscImprPrev: gPrev.impressions, gscPosPrev: Math.round((gPrev.position||0)*10)/10,
          ga4Sessions: sessions, ga4SessionsPrev: sessionsPrev,
          status
        })
      }
      setRows(out)
    } finally { setLoading(false) }
  }

  useEffect(()=>{ load() }, [range.from, range.to])

  const fmt = (n:number)=> n>=1000 ? (n/1000).toFixed(1)+'K' : String(Math.round(n))
  const fmtDelta = (curr:number, prev:number)=>{
    const d = pct(curr, prev)
    const s = (d>0? '+':'') + (Math.round(d*10)/10).toFixed(1) + '%'
    const cls = d>=0 ? 'up' : 'down'
    return <span className={`growth-badge ${cls}`} style={{marginLeft:6}}>{s}</span>
  }

  const sorted = useMemo(()=>{
    // filter
    let list = rows.filter(r=>{
      if(statusFilter==='all') return true
      if(statusFilter==='attention') return r.status!=='good'
      if(statusFilter==='red') return r.status==='bad'
      if(statusFilter==='orange') return r.status==='warn'
      if(statusFilter==='green') return r.status==='good'
      return true
    })
    // sort
    const score = (r:Row)=>{
      const dClicks = pct(r.gscClicks, r.gscClicksPrev)
      const dImpr = pct(r.gscImpr, r.gscImprPrev)
      const dSess = pct(r.ga4Sessions, r.ga4SessionsPrev)
      const dPos = (r.gscPos - r.gscPosPrev)
      const severity = r.status==='bad'? 2 : r.status==='warn'? 1 : 0
      return severity*1000 + Math.max(0,-dClicks) + Math.max(0,-dImpr) + Math.max(0,-dSess) + Math.max(0,dPos)
    }
    if(sortBy==='worst') list = list.sort((a,b)=> score(b)-score(a))
    if(sortBy==='clicks') list = list.sort((a,b)=> b.gscClicks - a.gscClicks)
    if(sortBy==='sessions') list = list.sort((a,b)=> b.ga4Sessions - a.ga4Sessions)
    if(sortBy==='name') list = list.sort((a,b)=> a.name.localeCompare(b.name))
    // Keep highlighted on top
    if(highlightId){ list = list.sort((a,b)=> (a.id===highlightId? -1 : b.id===highlightId? 1 : 0)) }
    return list
  }, [rows, highlightId, sortBy, statusFilter])

  return (
    <>
      <div className="toolbar" style={{marginBottom:12, justifyContent:'space-between'}}>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <div className="seg" style={{display:'inline-flex', gap:6, padding:6, border:'1px solid #2b2b47', borderRadius:10, background:'#121228'}}>
            {presets.map(p => {
              const active = p.key===activeKey
              return (
                <button
                  key={p.key}
                  className="btn secondary"
                  style={{
                    height:32, padding:'0 10px',
                    background: active? '#1f1f3a' : 'transparent',
                    color: active? '#fff' : undefined,
                    borderColor: active? '#3a3a5d' : undefined
                  }}
                  onClick={()=> { setRange(p.range); setActiveKey(p.key) }}
                >{p.label}</button>
              )
            })}
          </div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          <div className="picker" style={{gap:8}}>
            <span className="muted" style={{fontSize:12}}>Sort</span>
            <select value={sortBy} onChange={(e)=> setSortBy(e.target.value as any)} style={{background:'transparent', border:0, color:'inherit'}}>
              <option value="worst">Worst first</option>
              <option value="clicks">Clicks</option>
              <option value="sessions">Sessions</option>
              <option value="name">Name</option>
            </select>
          </div>
          <div className="picker" style={{gap:8}}>
            <span className="muted" style={{fontSize:12}}>Filter</span>
            <select value={statusFilter} onChange={(e)=> setStatusFilter(e.target.value as any)} style={{background:'transparent', border:0, color:'inherit'}}>
              <option value="all">All</option>
              <option value="attention">Attention (Red/Orange)</option>
              <option value="red">Red</option>
              <option value="orange">Orange</option>
              <option value="green">Green</option>
            </select>
          </div>
          <label className="picker" style={{gap:6, cursor:'pointer'}}>
            <input type="checkbox" checked={!showPrev} onChange={(e)=> setShowPrev(!e.target.checked)} />
            Compact
          </label>
          <div className="muted" style={{fontSize:12}}>
            {range.from.toLocaleDateString()} – {range.to.toLocaleDateString()} (vs previous period)
          </div>
        </div>
      </div>

      {/* Acronym chips with status */}
      <div style={{display:'flex', flexWrap:'wrap', gap:8, marginBottom:10}}>
        {sites.map(s=>{
          const r = rows.find(x=>x.id===s.id)
          const st = r?.status || 'warn'
          const bg = st==='bad'? '#2a1212' : st==='warn'? '#2a1f12' : '#0b1f16'
          const br = st==='bad'? '#432020' : st==='warn'? '#4a341f' : '#1e3d2f'
          const color = st==='bad'? '#ff6b6b' : st==='warn'? '#fbbf24' : '#34d399'
          const blink = st!=='good'
          return (
            <div key={s.id} onClick={()=> setHighlightId(s.id)} title={s.name}
              style={{
                padding:'6px 10px', borderRadius:999, border:`1px solid ${br}`, background:bg, color,
                cursor:'pointer', fontWeight:700, letterSpacing:.3, boxShadow: blink? '0 0 10px rgba(0,0,0,.2)':undefined,
                animation: blink? 'blink 1.2s steps(2, start) infinite' : undefined
              }}>
              {acronym(s.name)}
            </div>
          )
        })}
      </div>

      <div className="card" style={{padding:12}}>
        <div className="muted" style={{fontSize:12, marginBottom:8}}>
          Showing {sites.length} clients • Range: {presets.find(p=>p.key===activeKey)?.label}
        </div>
        <div style={{display:'grid', gridTemplateColumns:'220px repeat(3, 1fr) 140px 44px', gap:8, alignItems:'center', fontSize:13, padding:'6px 8px', borderBottom:'1px solid #23233a'}}> 
          <div style={{opacity:.8}}>Client</div>
          <div style={{opacity:.8}}>GSC Clicks</div>
          <div style={{opacity:.8}}>GSC Impressions</div>
          <div style={{opacity:.8}}>GSC Avg Pos</div>
          <div style={{opacity:.8}}>GA4 Sessions</div>
          <div style={{opacity:0}}>Open</div>
        </div>
        {sorted.map(r=>{
          const stColor = r.status==='bad'? '#ef4444' : r.status==='warn'? '#f59e0b' : '#10b981'
          const isHi = highlightId===r.id
          return (
            <div key={r.id}
              style={{
                display:'grid', gridTemplateColumns:'220px repeat(3, 1fr) 140px 44px', gap:8, alignItems:'center',
                padding:'8px 8px', borderRadius:10, margin:'4px 0', border:'1px dashed #2b2b47',
                background: isHi? '#121228' : '#0f0f20',
                outline: isHi? '2px solid var(--accent)' : undefined
              }}>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <span style={{width:8,height:8,borderRadius:999,background:stColor, boxShadow:'0 0 10px rgba(0,0,0,.3)'}}/>
                <div>
                  <div style={{fontWeight:700}}>{r.name}</div>
                  <div className="muted" style={{fontSize:12}}>{r.url}</div>
                </div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <strong>{fmt(r.gscClicks)}</strong>
                {fmtDelta(r.gscClicks, r.gscClicksPrev)}
                {showPrev && <span className="muted" style={{fontSize:11}}>prev {fmt(r.gscClicksPrev)}</span>}
              </div>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <strong>{fmt(r.gscImpr)}</strong>
                {fmtDelta(r.gscImpr, r.gscImprPrev)}
                {showPrev && <span className="muted" style={{fontSize:11}}>prev {fmt(r.gscImprPrev)}</span>}
              </div>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <strong>{r.gscPos.toFixed(1)}</strong>
                {/* For position lower is better; invert */}
                <span>
                  <span className={`growth-badge ${r.gscPos <= r.gscPosPrev ? 'up':'down'}`}>
                    {(r.gscPos - r.gscPosPrev).toFixed(1)}
                  </span>
                </span>
                {showPrev && <span className="muted" style={{fontSize:11}}>prev {r.gscPosPrev.toFixed(1)}</span>}
              </div>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <strong>{fmt(r.ga4Sessions)}</strong>
                {fmtDelta(r.ga4Sessions, r.ga4SessionsPrev)}
                {showPrev && <span className="muted" style={{fontSize:11}}>prev {fmt(r.ga4SessionsPrev)}</span>}
              </div>
              <div style={{display:'grid', placeItems:'center'}}>
                <button
                  onClick={()=>{ try{ localStorage.setItem('activeWebsiteId', r.id) }catch{}; router.push('/dashboard') }}
                  title="Open client dashboard"
                  className="icon-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 17L17 7M17 7H9M17 7V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
        {(!sorted.length && !loading) && (
          <div className="muted" style={{padding:12}}>No clients found. Add websites and connect GSC/GA4 in Websites.</div>
        )}
        {loading && (
          <div style={{display:'flex', alignItems:'center', gap:8, padding:10}}><span className="spinner"/> Loading…</div>
        )}
      </div>

      <style jsx global>{`
        @keyframes blink { 50% { opacity: .35 } }
        .icon-btn{ width:28px; height:28px; display:grid; place-items:center; border-radius:8px; border:1px solid #2b2b47; background:#121228; color: var(--accent); cursor:pointer; }
        .icon-btn:hover{ filter: brightness(1.1); }
      `}</style>
    </>
  )
}
