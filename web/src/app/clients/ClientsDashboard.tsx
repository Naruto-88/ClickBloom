"use client"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useDateRange } from "@/components/date-range"
import { signIn } from "next-auth/react"

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
  organicUsers: number
  organicUsersPrev: number
  organicSessions: number
  organicSessionsPrev: number
  status: 'good'|'warn'|'bad'
}

export default function ClientsDashboard(){
  const router = useRouter()
  const { range, setRange } = useDateRange()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [snapshotTs, setSnapshotTs] = useState<number|null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [pendingRows, setPendingRows] = useState<Row[]|null>(null)
  const [autoApply, setAutoApply] = useState<boolean>(()=>{ try{ return (localStorage.getItem('clients:autoApply')||'false')==='true' }catch{ return false } })
  const [clock, setClock] = useState(0)
  const [highlightId, setHighlightId] = useState<string|undefined>()
  const [showPrev, setShowPrev] = useState(true)
  const [sortBy, setSortBy] = useState<'worst'|'clicks'|'impressions'|'position'|'sessions'|'users'|'name'>('worst')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [statusFilter, setStatusFilter] = useState<'all'|'attention'|'red'|'orange'|'green'>('all')
  const [updates, setUpdates] = useState<Array<{ title:string, type:'core'|'spam'|'ranking'|'other', start:string, end?:string|null, url?:string }>>([])
  const [updatesLoading, setUpdatesLoading] = useState(false)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [warmBusy, setWarmBusy] = useState(false)
  const [gscAuthNeeded, setGscAuthNeeded] = useState(false)
  const [gscAuthFailures, setGscAuthFailures] = useState<string[]>([])
  const [ga4AuthFailures, setGa4AuthFailures] = useState<string[]>([])
  const presets = useMemo(()=>([
    { key:'7d', label:'7 Days', range: lastNDays(7) },
    { key:'30d', label:'30 Days', range: lastNDays(30) },
    { key:'3m', label:'Last 3 Months', range: lastNDays(90) },
    { key:'lastm', label:'Last Month', range: lastMonth() },
    { key:'6m', label:'Last 6 Months', range: lastNDays(180) },
    { key:'1y', label:'Last Year', range: lastNDays(365) },
  ]), [])
  const [activeKey, setActiveKey] = useState<string>('7d')
  const matchPresetKey = (r: DateRange): string => {
    const dayDiff = Math.max(1, Math.round((r.to.getTime()-r.from.getTime())/86400000)+1)
    const lm = lastMonth()
    const isSameDay = (a:Date,b:Date)=> a.toDateString()===b.toDateString()
    if(isSameDay(r.from, lm.from) && isSameDay(r.to, lm.to)) return 'lastm'
    if(Math.abs(dayDiff-7)<=1) return '7d'
    if(Math.abs(dayDiff-30)<=1) return '30d'
    if(Math.abs(dayDiff-90)<=2) return '3m'
    if(Math.abs(dayDiff-180)<=3) return '6m'
    if(Math.abs(dayDiff-365)<=5) return '1y'
    return 'custom'
  }

  // Persist + restore settings
  useEffect(()=>{
    try{
      const k = localStorage.getItem('clients:presetKey') || matchPresetKey(range)
      const s = (localStorage.getItem('clients:sort') as any) || 'worst'
      const sd = (localStorage.getItem('clients:sortDir') as any) || 'desc'
      const f = (localStorage.getItem('clients:filter') as any) || 'all'
      const compact = (localStorage.getItem('clients:compact')||'false')==='true'
      const p = presets.find(p=>p.key===k)
      if(p){ setActiveKey(p.key); setRange(p.range) } else { setActiveKey(matchPresetKey(range)) }
      if(s) setSortBy(s)
      if(sd) setSortDir(sd)
      if(f) setStatusFilter(f)
      setShowPrev(!compact)
      const h = localStorage.getItem('clients:highlightId') || undefined
      if(h) setHighlightId(h)
    }catch{}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(()=>{ try{ localStorage.setItem('clients:presetKey', activeKey) }catch{} }, [activeKey])
  useEffect(()=>{ try{ localStorage.setItem('clients:sort', sortBy) }catch{} }, [sortBy])
  useEffect(()=>{ try{ localStorage.setItem('clients:sortDir', sortDir) }catch{} }, [sortDir])
  useEffect(()=>{ try{ localStorage.setItem('clients:filter', statusFilter) }catch{} }, [statusFilter])
  useEffect(()=>{ try{ localStorage.setItem('clients:compact', String(!showPrev)) }catch{} }, [showPrev])
  useEffect(()=>{ try{ if(highlightId) localStorage.setItem('clients:highlightId', highlightId); else localStorage.removeItem('clients:highlightId') }catch{} }, [highlightId])
  useEffect(()=>{ setActiveKey(matchPresetKey(range)) }, [range.from, range.to])
  useEffect(()=>{ try{ localStorage.setItem('clients:autoApply', String(autoApply)) }catch{} }, [autoApply])
  // Load Google ranking updates once
  useEffect(()=>{
    let done=false
    const run=async()=>{
      try{ setUpdatesLoading(true); const r=await fetch('/api/google/updates'); const j=await r.json().catch(()=>null); if(!done && j?.ok){ setUpdates(j.updates||[]) } }
      finally{ if(!done) setUpdatesLoading(false) }
    }
    run(); return ()=>{ done=true }
  }, [])

  const sites = useMemo(()=> loadSites(), [])
  const rangeKey = useMemo(()=> matchPresetKey(range), [range.from, range.to])
  const SNAP_TTL_MS = 6*60*60*1000 // 6 hours
  const SNAP_VER = 'v2' // snapshot format/version
  const snapKey = (key: string)=> `clients:snapshot:${key}`
  const readSnapshot = (key:string)=>{
    try{
      const raw = localStorage.getItem(snapKey(key)); if(!raw) return null;
      const j = JSON.parse(raw);
      // Accept both v2 and older snapshots (fallback)
      if(!Array.isArray(j.rows)) return null; return j as { ts:number, rows: Row[], ver?:string }
    }catch{ return null }
  }
  const writeSnapshot = (key:string, data: { ts:number, rows: Row[] })=>{ try{ localStorage.setItem(snapKey(key), JSON.stringify({ ...data, ver: SNAP_VER })) }catch{} }
  const relTime = (ts:number)=>{ const d=Math.max(0, Date.now()-ts); const s=Math.floor(d/1000); if(s<60) return `${s}s ago`; const m=Math.floor(s/60); if(m<60) return `${m}m ago`; const h=Math.floor(m/60); if(h<24) return `${h}h ago`; const dy=Math.floor(h/24); return `${dy}d ago` }

  async function fetchGscTotals(siteUrl: string, start: string, end: string, siteLabel?: string, email?: string){
    const res = await fetch(`/api/google/gsc/search?site=${encodeURIComponent(siteUrl)}&start=${start}&end=${end}${email? `&email=${encodeURIComponent(email)}`:''}`)
    if(res.status===401 || res.status===403){
      setGscAuthNeeded(true)
      if(siteLabel) setGscAuthFailures(prev=> Array.from(new Set([...(prev||[]), siteLabel])))
      return { clicks:0, impressions:0, position:0, rows:0 }
    }
    if(!res.ok) return { clicks:0, impressions:0, position:0, rows:0 }
    const data = await res.json()
    const rows:any[] = data.rows||[]
    const clicks = rows.reduce((a,r)=> a + (r.clicks||0), 0)
    const impressions = rows.reduce((a,r)=> a + (r.impressions||0), 0)
    const position = rows.length ? rows.reduce((a,r)=> a + (r.position||0), 0) / rows.length : 0
    return { clicks, impressions, position, rows: rows.length }
  }

  async function fetchGa4OrganicSessions(property: string, start: string, end: string, siteLabel?: string, email?: string){
    try{
      const res = await fetch('/api/google/ga4/acquisition', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property, start, end, email }) })
      if(res.status===401 || res.status===403){ if(siteLabel) setGa4AuthFailures(prev=> Array.from(new Set([...(prev||[]), siteLabel]))); return 0 }
      if(!res.ok) return 0
      const data = await res.json()
      const rows = (data.rows||[]) as any[]
      let total = 0
      rows.forEach((r:any)=>{
        const channel = r.dimensionValues?.[0]?.value || ''
        if(channel === 'Organic Search') total += Number(r.metricValues?.[0]?.value || 0)
      })
      return total
    }catch{ return 0 }
  }

  async function fetchGa4OrganicUsers(property: string, start: string, end: string, siteLabel?: string, email?: string){
    try{
      const res = await fetch('/api/google/ga4/user-acquisition', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property, start, end }) })
      if(res.status===401 || res.status===403){ if(siteLabel) setGa4AuthFailures(prev=> Array.from(new Set([...(prev||[]), siteLabel]))); return 0 }
      if(!res.ok) return 0
      const data = await res.json()
      const rows = (data.rows||[]) as any[]
      let total = 0
      rows.forEach((r:any)=>{
        const channel = r.dimensionValues?.[0]?.value || ''
        if(channel === 'Organic Search') total += Number(r.metricValues?.[0]?.value || 0)
      })
      return total
    }catch{ return 0 }
  }

  function decideStatus(curr: { clicks:number, impressions:number }, prev: { clicks:number, impressions:number }): 'good'|'warn'|'bad'{
    const dClicks = pct(curr.clicks, prev.clicks)
    const dImpr = pct(curr.impressions, prev.impressions)
    if(dClicks < -20 || dImpr < -20) return 'bad'
    if(dClicks < -5 || dImpr < -5) return 'warn'
    return 'good'
  }

  const load = async (prevRows?: Row[]) => {
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

      const email = (()=>{ try{ const s = JSON.parse((sessionStorage.getItem('next-auth-session')||'null') as any) }catch{return undefined} })?.user?.email
      const out: Row[] = await Promise.all(sites.map(async(w)=>{
        const integ = loadIntegrations(w.id)
        const gscSite = integ.gscSite
        const ga4Prop = integ.ga4Property
        const [gCurr, gPrev] = await Promise.all([
          gscSite? fetchGscTotals(gscSite, start, end, w.name||w.url, email).catch(()=>({ clicks:0, impressions:0, position:0, rows:0 })) : Promise.resolve({ clicks:0, impressions:0, position:0, rows:0 }),
          gscSite? fetchGscTotals(gscSite, pStart, pEnd, w.name||w.url, email).catch(()=>({ clicks:0, impressions:0, position:0, rows:0 })) : Promise.resolve({ clicks:0, impressions:0, position:0, rows:0 })
        ])
        const [orgSessions, orgSessionsPrev, orgUsers, orgUsersPrev] = await Promise.all([
          ga4Prop? fetchGa4OrganicSessions(ga4Prop, start, end, w.name||w.url, email).catch(()=>0) : Promise.resolve(0),
          ga4Prop? fetchGa4OrganicSessions(ga4Prop, pStart, pEnd, w.name||w.url, email).catch(()=>0) : Promise.resolve(0),
          ga4Prop? fetchGa4OrganicUsers(ga4Prop, start, end, w.name||w.url, email).catch(()=>0) : Promise.resolve(0),
          ga4Prop? fetchGa4OrganicUsers(ga4Prop, pStart, pEnd, w.name||w.url, email).catch(()=>0) : Promise.resolve(0),
        ])
        const status = decideStatus({ clicks: gCurr.clicks, impressions: gCurr.impressions }, { clicks: gPrev.clicks, impressions: gPrev.impressions })
        return {
          id: w.id, name: w.name, url: w.url,
          gscClicks: gCurr.clicks, gscImpr: gCurr.impressions, gscPos: Math.round((gCurr.position||0)*10)/10,
          gscClicksPrev: gPrev.clicks, gscImprPrev: gPrev.impressions, gscPosPrev: Math.round((gPrev.position||0)*10)/10,
          organicUsers: orgUsers, organicUsersPrev: orgUsersPrev,
          organicSessions, organicSessionsPrev,
          status
        } as Row
      }))
      // Merge with previous rows per site to avoid wiping data when API returns zero/empty
      const basePrev = (prevRows && prevRows.length)? prevRows : (readSnapshot(rangeKey)?.rows||[])
      const prevMap = new Map((basePrev||[]).map((r:any)=> [r.id, r]))
      const merged = out.map(r=>{
        const p = prevMap.get(r.id)
        const hasGsc = (r.gscClicks||0)>0 || (r.gscImpr||0)>0
        if(!hasGsc && p && ((p.gscClicks||0)>0 || (p.gscImpr||0)>0)) return p
        return r
      })
      setRows(merged)
      const now = Date.now(); setSnapshotTs(now); writeSnapshot(rangeKey, { ts: now, rows: merged })
    } finally { setLoading(false) }
  }

  // On range change: show snapshot immediately if present, and check freshness in background
  useEffect(()=>{
    setUpdateReady(false); setPendingRows(null)
    const snap = readSnapshot(rangeKey)
    if(snap){ setRows(snap.rows||[]); setSnapshotTs(snap.ts||null) }
    // If no snapshot, try server cache first; else load live immediately
    if(!snap){
      (async()=>{
        try{
          const r = await fetch(`/api/cache/clients?key=${encodeURIComponent(snapKey(rangeKey))}`)
          if(r.ok){
            const j = await r.json(); const sv = j?.value as { ts:number, rows: Row[], ver?:string }|undefined
            if(sv && sv.ts && Array.isArray(sv.rows) && (Date.now()-sv.ts)<SNAP_TTL_MS){
              setRows(sv.rows); setSnapshotTs(sv.ts); writeSnapshot(rangeKey, sv); return
            }
          }
        }catch{}
        // Fallback to live load
        load()
      })()
      return
    }
    // Background check for freshness and diff
    (async()=>{
      try{
        const start = fmtDateISO(range.from)
        let endDate = range.to; const y = new Date(); y.setDate(y.getDate()-1); if(endDate>y) endDate=y
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
          let orgSessions = 0, orgSessionsPrev = 0
          let orgUsers = 0, orgUsersPrev = 0
          if(ga4Prop){
            try{ orgSessions = await fetchGa4OrganicSessions(ga4Prop, start, end) }catch{}
            try{ orgSessionsPrev = await fetchGa4OrganicSessions(ga4Prop, pStart, pEnd) }catch{}
            try{ orgUsers = await fetchGa4OrganicUsers(ga4Prop, start, end) }catch{}
            try{ orgUsersPrev = await fetchGa4OrganicUsers(ga4Prop, pStart, pEnd) }catch{}
          }
          const status = decideStatus(
            { clicks: gCurr.clicks, impressions: gCurr.impressions },
            { clicks: gPrev.clicks, impressions: gPrev.impressions }
          )
          out.push({
            id: w.id, name: w.name, url: w.url,
            gscClicks: gCurr.clicks, gscImpr: gCurr.impressions, gscPos: Math.round((gCurr.position||0)*10)/10,
            gscClicksPrev: gPrev.clicks, gscImprPrev: gPrev.impressions, gscPosPrev: Math.round((gPrev.position||0)*10)/10,
            organicUsers: orgUsers, organicUsersPrev: orgUsersPrev,
            organicSessions: orgSessions, organicSessionsPrev: orgSessionsPrev,
            status
          })
        }
        // Compare or TTL; avoid overwriting with empty/zero data
        const ttlExpired = !snap.ts || (Date.now() - snap.ts) > SNAP_TTL_MS
        const changed = JSON.stringify(out) !== JSON.stringify(snap.rows||[])
        const hasSignal = out.some(r=> (r.gscClicks||0)>0 || (r.gscImpr||0)>0 )
        if((ttlExpired || changed) && hasSignal){ setPendingRows(out); setUpdateReady(true) }
        else { const now = Date.now(); setSnapshotTs(now); writeSnapshot(rangeKey, { ts: now, rows: snap.rows }) }
      }catch{}
    })()
  }, [range.from, range.to, rangeKey, sites.length])

  const applyRefresh = () => {
    if(pendingRows){ const now = Date.now(); setRows(pendingRows); writeSnapshot(rangeKey, { ts: now, rows: pendingRows }); setSnapshotTs(now) }
    setPendingRows(null); setUpdateReady(false)
  }

  // Live ticker to refresh the relative time badge every 60s
  useEffect(()=>{
    const id = setInterval(()=> setClock(c=>c+1), 60000)
    return ()=> clearInterval(id)
  }, [])

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
      const severity = r.status==='bad'? 2 : r.status==='warn'? 1 : 0
      return severity*1000 + Math.max(0,-dClicks) + Math.max(0,-dImpr)
    }
    if(sortBy==='worst') list = list.sort((a,b)=> score(b)-score(a))
    if(sortBy==='clicks') list = list.sort((a,b)=> sortDir==='desc' ? (b.gscClicks - a.gscClicks) : (a.gscClicks - b.gscClicks))
    if(sortBy==='impressions') list = list.sort((a,b)=> sortDir==='desc' ? (b.gscImpr - a.gscImpr) : (a.gscImpr - b.gscImpr))
    if(sortBy==='position') list = list.sort((a,b)=> sortDir==='asc' ? (a.gscPos - b.gscPos) : (b.gscPos - a.gscPos))
    if(sortBy==='sessions') list = list.sort((a,b)=> sortDir==='desc' ? (b.organicSessions - a.organicSessions) : (a.organicSessions - b.organicSessions))
    if(sortBy==='users') list = list.sort((a,b)=> sortDir==='desc' ? (b.organicUsers - a.organicUsers) : (a.organicUsers - b.organicUsers))
    if(sortBy==='name') list = list.sort((a,b)=> a.name.localeCompare(b.name))
    // Keep highlighted on top
    if(highlightId){ list = list.sort((a,b)=> (a.id===highlightId? -1 : b.id===highlightId? 1 : 0)) }
    return list
  }, [rows, highlightId, sortBy, sortDir, statusFilter])

  return (
    <>
      {gscAuthNeeded && (
        <div className="card" style={{marginBottom:10, border:'1px dashed #ef4444', background:'#2a1212'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:10}}>
            <div className="muted" style={{color:'#fecaca'}}>
              Google authentication required to load Search Console data. Please re‑authenticate.
            </div>
            <div className="actions" style={{margin:0}}>
              <button className="btn" onClick={()=> signIn('google', { callbackUrl:'/clients' as any, prompt:'consent' as any })}>Re‑authenticate</button>
              <a className="btn secondary" href="/websites">Open Websites</a>
            </div>
          </div>
        </div>
      )}
      {(gscAuthFailures.length>0 || ga4AuthFailures.length>0) && (
        <div className="muted" style={{marginBottom:8, fontSize:12}}>
          {gscAuthFailures.length>0 && <span>GSC auth issues: {gscAuthFailures.join(', ')}.</span>}
          {ga4AuthFailures.length>0 && <span style={{marginLeft:12}}>GA4 auth issues: {ga4AuthFailures.join(', ')}.</span>}
        </div>
      )}
      <div className="sticky-wrap">
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
            <select value={sortBy} onChange={(e)=> { const v = e.target.value as any; setSortBy(v); if(v==='position'){ setSortDir('asc') } else { setSortDir('desc') } }} className="sel">
              <option value="worst">Worst first</option>
              <option value="clicks">Clicks</option>
              <option value="impressions">Impressions</option>
              <option value="position">Avg Position</option>
              <option value="sessions">Organic Sessions</option>
              <option value="users">Organic Users</option>
              <option value="name">Name</option>
            </select>
          </div>
          <div className="picker" style={{gap:8}}>
            <span className="muted" style={{fontSize:12}}>Filter</span>
            <select value={statusFilter} onChange={(e)=> setStatusFilter(e.target.value as any)} className="sel">
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
          <div className="muted" style={{fontSize:12, display:'flex', alignItems:'center', gap:6}}>
            {loading && <span className="spinner" title="Loading selected range" aria-label="Loading selected range"/>}
            {range.from.toLocaleDateString()} - {range.to.toLocaleDateString()} (vs previous period)
          </div>
        </div>
      </div>

      {/* Google Updates bar */}
      <div className="card" style={{padding:'8px 10px', marginBottom:10}}>
        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          <div className="muted" style={{fontSize:12}}>Google Updates</div>
          {updatesLoading && <span className="spinner"/>}
          {!updatesLoading && (()=>{
            const within = (u:any)=>{ const s=new Date(u.start); const e=u.end? new Date(u.end): s; return !(e<range.from || s>range.to) }
            const list = updates.filter(within).slice(0,8)
            if(list.length===0) return <div className="muted" style={{fontSize:12}}>No recorded updates in this period.</div>
            const color=(t:string)=> t==='core'? '#dc2626' : t==='spam'? '#ea580c' : t==='ranking'? '#16a34a' : '#64748b'
            return list.map((u,i)=> (
              <a key={i} className="badge" href={u.url||'#'} target="_blank" rel="noreferrer" title={`${u.title}\n${u.start}${u.end? ' - '+u.end:''}`} style={{borderColor:color(u.type), color:color(u.type)}}>
                {u.title.replace(/\s*\(.*?\)\s*$/,'')}
              </a>
            ))
          })()}
        </div>
      </div>

      {/* Acronym chips with status */}
      <div style={{display:'flex', flexWrap:'wrap', gap:8, marginBottom:10}}>
        {sites.map(s=>{
          const r = rows.find(x=>x.id===s.id)
          const st = r?.status || 'warn'
          const bg = st==='bad'? 'var(--err-bg)' : st==='warn'? 'var(--kw-warn-bg)' : 'var(--ok-bg)'
          const br = st==='bad'? 'var(--err-border)' : st==='warn'? 'var(--kw-warn-border)' : 'var(--ok-border)'
          const color = st==='bad'? 'var(--err-fg)' : st==='warn'? 'var(--kw-warn-fg)' : 'var(--ok-fg)'
          const blink = st!=='good'
          return (
            <div key={s.id} onClick={()=> setHighlightId(prev=> prev===s.id? undefined : s.id)} title={s.name}
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
      </div>

      <div className="card" style={{padding:12, position:'relative'}}>
        {loading && (
          <div style={{position:'absolute', inset:0, background:'rgba(15,15,32,0.45)', display:'grid', placeItems:'center', zIndex:1}}>
            <span className="spinner"/>
          </div>
        )}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:8}}>
          <div className="muted" style={{fontSize:12}}>
            Showing {sorted.length} clients • Range: {presets.find(p=>p.key===activeKey)?.label}
            {snapshotTs && <span className="badge" title={new Date(snapshotTs).toLocaleString()}>Updated {relTime(snapshotTs)}</span>}
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <label className="muted" style={{display:'flex', alignItems:'center', gap:6, cursor:'pointer'}} title="Automatically apply newer background data when available">
              <input type="checkbox" checked={autoApply} onChange={(e)=> setAutoApply(e.target.checked)} /> Auto-apply
            </label>
            <button className="btn secondary" disabled={refreshBusy} onClick={async()=>{ try{ setRefreshBusy(true); const prev = rows; try{ localStorage.removeItem(snapKey(rangeKey)) }catch{}; await load(prev) } finally { setRefreshBusy(false) } }} title="Force refresh current range">{refreshBusy? 'Refreshing…' : 'Refresh Data'}</button>
            <button className="btn secondary" disabled={warmBusy} onClick={async()=>{
              try{
                setWarmBusy(true)
                const y = new Date(); y.setDate(y.getDate()-1)
                const mk = (days:number)=> ({ from: new Date(y.getTime()-(days-1)*86400000), to: new Date(y) })
                const presetsLocal = [
                  { key:'7d', range: mk(7) },
                  { key:'30d', range: mk(30) },
                  { key:'3m', range: mk(90) },
                  { key:'lastm', range: { from: new Date(y.getFullYear(), y.getMonth()-1, 1), to: new Date(y.getFullYear(), y.getMonth(), 0) } },
                  { key:'6m', range: mk(180) },
                  { key:'1y', range: mk(365) },
                ]
                for(const p of presetsLocal){
                  const r = p.range
                  const start = r.from.toISOString().slice(0,10)
                  const endDate = r.to
                  const end = endDate.toISOString().slice(0,10)
                  const days = Math.max(1, Math.round((r.to.getTime()-r.from.getTime())/86400000)+1)
                  const prevEnd = new Date(r.from); prevEnd.setDate(prevEnd.getDate()-1)
                  const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate()-(days-1))
                  const pStart = prevStart.toISOString().slice(0,10)
                  const pEnd = prevEnd.toISOString().slice(0,10)
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
                    let orgSessions = 0, orgSessionsPrev = 0
                    let orgUsers = 0, orgUsersPrev = 0
                    if(ga4Prop){
                      try{ orgSessions = await fetchGa4OrganicSessions(ga4Prop, start, end) }catch{}
                      try{ orgSessionsPrev = await fetchGa4OrganicSessions(ga4Prop, pStart, pEnd) }catch{}
                      try{ orgUsers = await fetchGa4OrganicUsers(ga4Prop, start, end) }catch{}
                      try{ orgUsersPrev = await fetchGa4OrganicUsers(ga4Prop, pStart, pEnd) }catch{}
                    }
                    const status = decideStatus(
                      { clicks: gCurr.clicks, impressions: gCurr.impressions },
                      { clicks: gPrev.clicks, impressions: gPrev.impressions }
                    )
                    out.push({ id:w.id, name:w.name, url:w.url,
                      gscClicks:gCurr.clicks, gscImpr:gCurr.impressions, gscPos: Math.round((gCurr.position||0)*10)/10,
                      gscClicksPrev:gPrev.clicks, gscImprPrev:gPrev.impressions, gscPosPrev: Math.round((gPrev.position||0)*10)/10,
                      organicUsers: orgUsers, organicUsersPrev: orgUsersPrev,
                      organicSessions: orgSessions, organicSessionsPrev: orgSessionsPrev,
                      status })
                  }
                  const key = matchPresetKey(r as any)
                  const prevSnap = readSnapshot(key)
                  const prevMap = new Map((prevSnap?.rows||[]).map((rr:any)=> [rr.id, rr]))
                  const merged = out.map(rr=>{ const p0=prevMap.get(rr.id); const sig=(rr.gscClicks||0)>0||(rr.gscImpr||0)>0; if(!sig && p0) return p0; return rr })
                  writeSnapshot(key, { ts: Date.now(), rows: merged })
                }
                // Reload current range after warm
                await load(rows)
              } finally { setWarmBusy(false) }
            }} title="Refresh all preset ranges">{warmBusy? 'Refreshing all…' : 'Refresh All Presets'}</button>
            {updateReady && !autoApply && (
              <button className="btn secondary" onClick={applyRefresh} title="Newer data available">Refresh</button>
            )}
          </div>
        </div>
        <div className="clients-grid cols" style={{padding:'6px 8px', borderBottom:'1px solid #23233a'}}> 
          <div style={{opacity:.8}}>Client</div>
          <button className="th" onClick={()=>{ setSortBy('clicks'); setSortDir(sortBy==='clicks' && sortDir==='desc' ? 'asc':'desc') }}>
            GSC Clicks <span className="caret">{sortBy==='clicks' ? (sortDir==='desc'?'▼':'▲') : ''}</span>
          </button>
          <button className="th" onClick={()=>{ setSortBy('impressions'); setSortDir(sortBy==='impressions' && sortDir==='desc' ? 'asc':'desc') }}>
            GSC Impressions <span className="caret">{sortBy==='impressions' ? (sortDir==='desc'?'▼':'▲') : ''}</span>
          </button>
          <button className="th" onClick={()=>{ setSortBy('position'); setSortDir(sortBy==='position' && sortDir==='asc' ? 'desc':'asc') }}>
            GSC Avg Pos <span className="caret">{sortBy==='position' ? (sortDir==='asc'?'▲':'▼') : ''}</span>
          </button>
          <button className="th" title={'User Acquisition (Total Organic Users)\n\nNew users who first found your site via organic search.'} onClick={()=>{ setSortBy('users'); setSortDir(sortBy==='users' && sortDir==='desc' ? 'asc':'desc') }}>
            Organic Users <span className="caret">{sortBy==='users' ? (sortDir==='desc'?'▼':'▲') : ''}</span>
          </button>
          <button className="th" title={'Traffic Acquisition (Total Organic Sessions)\n\nAll visits from organic search, both new and returning.'} onClick={()=>{ setSortBy('sessions'); setSortDir(sortBy==='sessions' && sortDir==='desc' ? 'asc':'desc') }}>
            Organic Sessions <span className="caret">{sortBy==='sessions' ? (sortDir==='desc'?'▼':'▲') : ''}</span>
          </button>
          <div style={{opacity:.8, textAlign:'center'}}>Actions</div>
        </div>
        {sorted.map(r=>{
          const stColor = r.status==='bad'? '#ef4444' : r.status==='warn'? '#f59e0b' : '#10b981'
          const isHi = highlightId===r.id
          return (
            <div key={r.id} className="clients-grid cols" style={{
                padding:'8px 8px', borderRadius:10, margin:'4px 0', border:'1px dashed #2b2b47',
                background: isHi? '#121228' : '#0f0f20', outline: isHi? '2px solid var(--accent)' : undefined
              }}>
              <div className="client-cell" style={{display:'flex', alignItems:'center', gap:10, minWidth:0}}>
                <span style={{width:8,height:8,borderRadius:999,background:stColor, boxShadow:'0 0 10px rgba(0,0,0,.3)'}}/>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r.name}</div>
                  <div className="muted" style={{fontSize:12, overflowWrap:'anywhere'}}>{r.url}</div>
                </div>
              </div>
              <div className="metric-cell" style={{display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap'}}>
                <strong>{fmt(r.gscClicks)}</strong>
                {fmtDelta(r.gscClicks, r.gscClicksPrev)}
                {showPrev && <span className="muted" style={{fontSize:11}}>prev {fmt(r.gscClicksPrev)}</span>}
              </div>
              <div className="metric-cell" style={{display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap'}}>
                <strong>{fmt(r.gscImpr)}</strong>
                {fmtDelta(r.gscImpr, r.gscImprPrev)}
                {showPrev && <span className="muted" style={{fontSize:11}}>prev {fmt(r.gscImprPrev)}</span>}
              </div>
              <div className="metric-cell" style={{display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap'}}>
                <strong>{r.gscPos.toFixed(1)}</strong>
                {/* For position lower is better; invert */}
                <span>
                  <span className={`growth-badge ${r.gscPos <= r.gscPosPrev ? 'up':'down'}`}>
                    {(r.gscPos - r.gscPosPrev).toFixed(1)}
                  </span>
                </span>
                {showPrev && <span className="muted" style={{fontSize:11}}>prev {r.gscPosPrev.toFixed(1)}</span>}
              </div>
              <div className="metric-cell" style={{display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap'}}>
                <strong>{fmt(r.organicUsers)}</strong>
                {fmtDelta(r.organicUsers, r.organicUsersPrev)}
                {showPrev && <span className="muted" style={{fontSize:11}}>prev {fmt(r.organicUsersPrev)}</span>}
              </div>
              <div className="metric-cell" style={{display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap'}}>
                <strong>{fmt(r.organicSessions)}</strong>
                {fmtDelta(r.organicSessions, r.organicSessionsPrev)}
                {showPrev && <span className="muted" style={{fontSize:11}}>prev {fmt(r.organicSessionsPrev)}</span>}
              </div>
              <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
                <button
                  onClick={async()=>{
                    try{
                      setRefreshBusy(true)
                      const prev = rows
                      const resite = async ()=>{
                        // Build one-site update using same logic as load()
                        const y = new Date(); const yy=new Date(y); yy.setDate(yy.getDate()-1)
                        let start=new Date(range.from), end=new Date(range.to); if(end>yy) end=yy
                        const fmt=(d:Date)=> d.toISOString().slice(0,10)
                        const site = { id: r.id, name: r.name, url: r.url }
                        const integ = loadIntegrations(r.id)
                        let gCurr = { clicks:0, impressions:0, position:0, rows:0 }
                        let gPrev = { clicks:0, impressions:0, position:0, rows:0 }
                        const days = Math.max(1, Math.round((end.getTime()-start.getTime())/86400000)+1)
                        const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate()-1)
                        const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate()-(days-1))
                        const pStart = fmt(prevStart), pEnd = fmt(prevEnd)
                        if(integ.gscSite){
                          try{ gCurr = await fetchGscTotals(integ.gscSite, fmt(start), fmt(end), r.name||r.url) }catch{}
                          try{ gPrev = await fetchGscTotals(integ.gscSite, pStart, pEnd, r.name||r.url) }catch{}
                        }
                        let orgSessions=0, orgSessionsPrev=0, orgUsers=0, orgUsersPrev=0
                        if(integ.ga4Property){
                          try{ orgSessions = await fetchGa4OrganicSessions(integ.ga4Property, fmt(start), fmt(end), r.name||r.url) }catch{}
                          try{ orgSessionsPrev = await fetchGa4OrganicSessions(integ.ga4Property, pStart, pEnd, r.name||r.url) }catch{}
                          try{ orgUsers = await fetchGa4OrganicUsers(integ.ga4Property, fmt(start), fmt(end), r.name||r.url) }catch{}
                          try{ orgUsersPrev = await fetchGa4OrganicUsers(integ.ga4Property, pStart, pEnd, r.name||r.url) }catch{}
                        }
                        const status = decideStatus(
                          { clicks: gCurr.clicks, impressions: gCurr.impressions },
                          { clicks: gPrev.clicks, impressions: gPrev.impressions }
                        )
                        const updated = {
                          id: site.id, name: site.name, url: site.url,
                          gscClicks: gCurr.clicks, gscImpr: gCurr.impressions, gscPos: Math.round((gCurr.position||0)*10)/10,
                          gscClicksPrev: gPrev.clicks, gscImprPrev: gPrev.impressions, gscPosPrev: Math.round((gPrev.position||0)*10)/10,
                          organicUsers: orgUsers, organicUsersPrev: orgUsersPrev,
                          organicSessions: orgSessions, organicSessionsPrev: orgSessionsPrev,
                          status
                        } as Row
                        const merged = prev.map(x=> x.id===r.id? updated : x)
                        setRows(merged)
                        writeSnapshot(rangeKey, { ts: Date.now(), rows: merged })
                      }
                      await resite()
                    } finally { setRefreshBusy(false) }
                  }}
                  title="Refresh this site" className="icon-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 12a9 9 0 1 1-9-9" stroke="currentColor" strokeWidth="2" fill="none"/>
                    <path d="M21 3v7h-7" stroke="currentColor" strokeWidth="2" fill="none"/>
                  </svg>
                </button>
                <button
                  onClick={()=>{ try{ localStorage.setItem('activeWebsiteId', r.id) }catch{}; window.open('/dashboard', '_blank', 'noopener,noreferrer') }}
                  title="Open client dashboard"
                  className="icon-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 17L17 7M17 7H9M17 7V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {ga4AuthFailures.includes(r.name||r.url) && (
                  <button
                    onClick={async()=>{
                      try{
                        setRefreshBusy(true)
                        const prev = rows
                        const integ = loadIntegrations(r.id)
                        if(!integ.ga4Property){ alert('No GA4 property connected'); return }
                        const y=new Date(); const yy=new Date(y); yy.setDate(yy.getDate()-1)
                        let start=new Date(range.from), end=new Date(range.to); if(end>yy) end=yy
                        const fmt=(d:Date)=> d.toISOString().slice(0,10)
                        const days = Math.max(1, Math.round((end.getTime()-start.getTime())/86400000)+1)
                        const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate()-1)
                        const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate()-(days-1))
                        const pStart = fmt(prevStart), pEnd = fmt(prevEnd)
                        let orgSessions=0, orgSessionsPrev=0, orgUsers=0, orgUsersPrev=0
                        try{ orgSessions = await fetchGa4OrganicSessions(integ.ga4Property, fmt(start), fmt(end), r.name||r.url) }catch{}
                        try{ orgSessionsPrev = await fetchGa4OrganicSessions(integ.ga4Property, pStart, pEnd, r.name||r.url) }catch{}
                        try{ orgUsers = await fetchGa4OrganicUsers(integ.ga4Property, fmt(start), fmt(end), r.name||r.url) }catch{}
                        try{ orgUsersPrev = await fetchGa4OrganicUsers(integ.ga4Property, pStart, pEnd, r.name||r.url) }catch{}
                        const updated = prev.map(x=> x.id===r.id? { ...x, organicSessions: orgSessions, organicSessionsPrev: orgSessionsPrev, organicUsers: orgUsers, organicUsersPrev: orgUsersPrev } : x)
                        setRows(updated)
                        writeSnapshot(rangeKey, { ts: Date.now(), rows: updated })
                      } finally { setRefreshBusy(false) }
                    }}
                    title="Refresh GA4 only" className="icon-btn"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M4 4h4v16H4zM10 10h4v10h-4zM16 6h4v14h-4z" fill="currentColor"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {(!sorted.length && !loading) && (
          <div className="muted" style={{padding:12}}>No clients found. Add websites and connect GSC/GA4 in Websites.</div>
        )}
        {loading && (
          <div style={{display:'flex', alignItems:'center', gap:8, padding:10}}><span className="spinner"/> Loading.</div>
        )}
      </div>

      <style jsx global>{`
        @keyframes blink { 50% { opacity: .35 } }
        .icon-btn{ width:28px; height:28px; display:grid; place-items:center; border-radius:8px; border:1px solid #2b2b47; background:#121228; color: var(--accent); cursor:pointer; }
        .icon-btn:hover{ filter: brightness(1.1); }
        .clients-grid{ display:grid; gap:8px; align-items:center; }
        .clients-grid.cols{ grid-template-columns: minmax(280px, 2fr) repeat(3, minmax(130px, 1fr)) minmax(130px, 1fr) minmax(130px, 1fr) 72px; }
        @media (max-width: 1200px){ .clients-grid.cols{ grid-template-columns: minmax(260px, 2fr) repeat(3, minmax(120px, 1fr)) minmax(120px, 1fr) minmax(120px, 1fr) 68px } }
        @media (max-width: 1000px){ .clients-grid.cols{ grid-template-columns: minmax(240px, 2fr) repeat(3, minmax(110px, 1fr)) minmax(110px, 1fr) minmax(110px, 1fr) 64px } }
        @media (max-width: 860px){ .clients-grid.cols{ grid-template-columns: minmax(220px, 2fr) repeat(3, minmax(100px, 1fr)) minmax(100px, 1fr) minmax(100px, 1fr) 60px } }
        /* Styled selects for dark theme */
        .sel{ height:32px; border-radius:8px; border:1px solid #2b2b47; background:#121228; color:#e6e6f0; padding:0 8px; }
        .sel option{ background:#0f0f20; color:#e6e6f0; }
        .th{ background:transparent; color:#cbd0ea; border:0; text-align:left; padding:0; cursor:pointer; font:inherit; display:inline-flex; align-items:center; gap:6px; }
        .th .caret{ opacity:.8; }
        .sticky-wrap{ position: sticky; top: 0; z-index: 30; background: linear-gradient(180deg, rgba(15,15,32,0.98) 0%, rgba(15,15,32,0.94) 75%, rgba(15,15,32,0.0) 100%); padding-top:6px; }
      `}</style>
    </>
  )
}
