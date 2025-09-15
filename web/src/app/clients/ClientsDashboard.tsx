"use client"
import { useEffect, useMemo, useState } from "react"
import RangeDropdown from "@/components/ui/RangeDropdown"

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
  const [range, setRange] = useState<DateRange>(last7Days)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [highlightId, setHighlightId] = useState<string|undefined>()

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

  function decideStatus(curr: { clicks:number, impressions:number, pos:number }, prev: { clicks:number, impressions:number, pos:number }): 'good'|'warn'|'bad'{
    const dClicks = pct(curr.clicks, prev.clicks)
    const dImpr = pct(curr.impressions, prev.impressions)
    const dPos = (curr.pos - prev.pos) // positive = worse
    if(dClicks < -20 || dImpr < -20 || dPos > 5) return 'bad'
    if(dClicks < -5 || dImpr < -5 || dPos > 2) return 'warn'
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
          { clicks: gCurr.clicks, impressions: gCurr.impressions, pos: gCurr.position||0 },
          { clicks: gPrev.clicks, impressions: gPrev.impressions, pos: gPrev.position||0 }
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
    // Keep highlighted on top
    const list = [...rows]
    if(highlightId){
      list.sort((a,b)=> (a.id===highlightId? -1 : b.id===highlightId? 1 : 0))
    } else {
      list.sort((a,b)=> b.gscClicks - a.gscClicks)
    }
    return list
  }, [rows, highlightId])

  return (
    <>
      <div className="toolbar" style={{marginBottom:12, justifyContent:'flex-end'}}>
        <RangeDropdown value={range} onChange={setRange} />
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
        <div className="muted" style={{fontSize:12, marginBottom:8}}>Showing {sites.length} clients • Default range: Last 7 days</div>
        <div style={{display:'grid', gridTemplateColumns:'220px repeat(3, 1fr) 140px', gap:8, alignItems:'center', fontSize:13, padding:'6px 8px', borderBottom:'1px solid #23233a'}}> 
          <div style={{opacity:.8}}>Client</div>
          <div style={{opacity:.8}}>GSC Clicks</div>
          <div style={{opacity:.8}}>GSC Impressions</div>
          <div style={{opacity:.8}}>GSC Avg Pos</div>
          <div style={{opacity:.8}}>GA4 Sessions</div>
        </div>
        {sorted.map(r=>{
          const stColor = r.status==='bad'? '#ef4444' : r.status==='warn'? '#f59e0b' : '#10b981'
          const isHi = highlightId===r.id
          return (
            <div key={r.id}
              style={{
                display:'grid', gridTemplateColumns:'220px repeat(3, 1fr) 140px', gap:8, alignItems:'center',
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
              <div style={{display:'flex', alignItems:'center'}}>
                <strong>{fmt(r.gscClicks)}</strong>
                {fmtDelta(r.gscClicks, r.gscClicksPrev)}
              </div>
              <div style={{display:'flex', alignItems:'center'}}>
                <strong>{fmt(r.gscImpr)}</strong>
                {fmtDelta(r.gscImpr, r.gscImprPrev)}
              </div>
              <div style={{display:'flex', alignItems:'center'}}>
                <strong>{r.gscPos.toFixed(1)}</strong>
                {/* For position lower is better; invert */}
                <span style={{marginLeft:6}}>
                  <span className={`growth-badge ${r.gscPos <= r.gscPosPrev ? 'up':'down'}`}>
                    {(r.gscPos - r.gscPosPrev).toFixed(1)}
                  </span>
                </span>
              </div>
              <div style={{display:'flex', alignItems:'center'}}>
                <strong>{fmt(r.ga4Sessions)}</strong>
                {fmtDelta(r.ga4Sessions, r.ga4SessionsPrev)}
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
      `}</style>
    </>
  )
}
