"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

type Kw = {
  id: string
  query: string
  targetUrl?: string
  targetDomain?: string
  notes?: string
  history: Array<{ date: string, position: number | null }>
}

type TrackerMode = 'api' | 'gsc'

type TimelinePoint = {
  position: number | null
  clicks?: number
  impressions?: number
}

type TimelineCell = {
  position: number | null
  delta: number | null
  clicks?: number
  impressions?: number
}

type GscSummaryEntry = {
  clicks: number
  impressions: number
  position: number
}

const MAX_TIMELINE_DAYS = 180
const GSC_DELAY_DAYS = 2
const TOP_LIMIT = 20
const STICKY_BG = '#0c1024'
// Fixed column widths to keep sticky alignment consistent with scrollable dates
const COL_KEYWORD = 260
const COL_CLICKS = 110
const COL_VOLUME = 140

function activeSite(){
  try{ return localStorage.getItem('activeWebsiteId') || '' }catch{ return '' }
}

const today = ()=> new Date().toISOString().slice(0,10)
function fmtDate(d: Date){ return d.toISOString().slice(0,10) }
function shortLabel(date: string){
  try{
    const [y,m,d] = date.split('-').map(Number)
    const composed = new Date(Date.UTC(y,(m||1)-1,d||1))
    return composed.toLocaleDateString(undefined,{day:'numeric',month:'short'}).toUpperCase()
  }catch{ return date }
}
function normalizeQuery(v: string){ return v.trim().toLowerCase() }
function safeNumber(v: unknown): number | null{
  if(typeof v==='number' && Number.isFinite(v)) return v
  if(typeof v==='string'){ const n = Number(v); if(!Number.isNaN(n)) return n }
  return null
}

const SPECIAL_REGEX = /[\^$.*+?()[\]{}|]/g
function escapeRegex(v: string){ return v.replace(SPECIAL_REGEX,'\\$&') }
function buildRegexPattern(queries: string[]): string | null{
  const tokens = queries.map(q=> escapeRegex(q)).filter(Boolean)
  if(!tokens.length) return null
  const pattern = tokens.join('|')
  if(pattern.length > 4000) return null
  // Do not use inline flags like (?i) because GSC's RE2 disallows them.
  // Case-insensitivity is handled by the backend or tolerated by GSC.
  return `(${pattern})`
}

function buildSequentialDates(days: number, endDate: Date){
  const clamped = Math.max(1, Math.min(MAX_TIMELINE_DAYS, Math.floor(days)))
  const start = new Date(endDate)
  start.setHours(0,0,0,0)
  const out: string[] = []
  for(let i=0;i<clamped;i++){
    const d = new Date(start)
    d.setDate(start.getDate()-i)
    out.push(fmtDate(d))
  }
  return out
}

function buildTimelineCells(dates: string[], source: Record<string, TimelinePoint>){
  const cells: Record<string, TimelineCell> = {}
  for(let i=0;i<dates.length;i++){
    const date = dates[i]
    const pt = source[date]
    const position = safeNumber(pt?.position) ?? null
    const olderDate = dates[i+1]
    const olderPt = olderDate ? source[olderDate] : undefined
    const olderPosition = safeNumber(olderPt?.position)
    let delta: number | null = null
    if(olderDate && position!==null && olderPosition!==null){
      delta = Number((olderPosition - position).toFixed(1))
    }
    cells[date] = {
      position,
      delta,
      clicks: safeNumber(pt?.clicks) ?? undefined,
      impressions: safeNumber(pt?.impressions) ?? undefined
    }
  }
  return cells
}

function formatPosition(value: number | null){
  if(value===null) return '--'
  if(Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value))
  return value.toFixed(1)
}
function formatNumber(value: number | null | undefined){
  if(value===null || value===undefined) return '--'
  return new Intl.NumberFormat().format(Math.round(value))
}
function cellStyle(position: number | null){
  if(position===null) return { background:'#101228', border:'#2b2b47', color:'#d1d5f9' }
  if(position<=3) return { background:'#11291c', border:'#1f5138', color:'#34d399' }
  if(position<=10) return { background:'#112533', border:'#1f4370', color:'#60a5fa' }
  if(position<=20) return { background:'#32220f', border:'#5b3b17', color:'#facc15' }
  return { background:'#181825', border:'#2b2b47', color:'#e6e6f0' }
}

export default function KeywordsClient(){
  // Core state
  const [siteId, setSiteId] = useState('')
  const [sites, setSites] = useState<Array<{ id:string, name:string, url:string }>>([])
  const [list, setList] = useState<Kw[]>([])
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'list'|'history'>('list')
  const [trackerMode, setTrackerMode] = useState<TrackerMode>('api')
  const [timelineDays, setTimelineDays] = useState(30)
  // Distribution / filter bar like the previous UI
  const [posFilter, setPosFilter] = useState<'all'|'top1'|'top3'|'top10'|'top20'|'top50'|'gt50'|'unknown'>('all')
  const [posMin, setPosMin] = useState(1)
  const [posMax, setPosMax] = useState(100)

  // Add/bulk
  const [q, setQ] = useState('')
  const [target, setTarget] = useState('')
  const [domain, setDomain] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [busy, setBusy] = useState<'check'|'add'|null>(null)

  // SERP API key (API tracker only)
  const [serpProvider, setSerpProvider] = useState<'serper'|'serpapi'>('serper')
  const [serpHasKey, setSerpHasKey] = useState(false)
  const [serpKey, setSerpKey] = useState('')

  // GSC data (used in both modes for clicks/volume; and positions in GSC mode)
  const [gscSummary, setGscSummary] = useState<Record<string, GscSummaryEntry>>({})
  const [gscTimeline, setGscTimeline] = useState<Record<string, Record<string, TimelinePoint>>>({})
  const [gscDates, setGscDates] = useState<string[]>([])
  const [gscError, setGscError] = useState<string|null>(null)
  const [gscLoading, setGscLoading] = useState(false)
  const gscRunId = useRef(0)
  // Horizontal scroll containers (dates area)
  const listScrollRef = useRef<HTMLDivElement|null>(null)
  const historyScrollRef = useRef<HTMLDivElement|null>(null)

  // Helpers to read integrations
  const getSiteDomain = useCallback(()=>{
    try{
      if(!siteId) return ''
      const integ = JSON.parse(localStorage.getItem('integrations:'+siteId) || '{}')
      const g = integ.gscSite as string | undefined
      if(g){ try{ const u = new URL(g); return u.hostname.replace(/^www\./,'') }catch{} }
    }catch{}
    return ''
  }, [siteId])

  const getGscSite = useCallback(()=>{
    try{
      if(!siteId) return ''
      const integ = JSON.parse(localStorage.getItem('integrations:'+siteId) || '{}')
      return integ.gscSite as string | undefined || ''
    }catch{ return '' }
  }, [siteId])

  // Init site + list of websites
  useEffect(()=>{
    setSiteId(activeSite())
    try{
      const stored = JSON.parse(localStorage.getItem('websites') || '[]')
      if(Array.isArray(stored)) setSites(stored)
    }catch{}
  }, [])
  // React to active website changes (external)
  useEffect(()=>{
    let mounted = true
    let last = activeSite()
    const tick = ()=>{
      const cur = activeSite()
      if(mounted && cur!==last){ last=cur; setSiteId(cur) }
    }
    const id = setInterval(tick, 800)
    const onFocus = ()=> tick()
    window.addEventListener('focus', onFocus)
    return ()=>{ mounted=false; clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [])

  // Load global SERP settings
  useEffect(()=>{ (async()=>{
    const r = await fetch('/api/settings/serp-global')
    const j = await r.json().catch(()=>null)
    if(j?.ok){ setSerpProvider(j.provider||'serper'); setSerpHasKey(!!j.hasKey) }
  })() }, [])

  // Load keywords for selected site
  useEffect(()=>{ (async()=>{
    if(!siteId) return
    const r = await fetch(`/api/keywords?siteId=${encodeURIComponent(siteId)}`)
    const j = await r.json().catch(()=>null)
    setList(j?.ok && Array.isArray(j.data) ? j.data : [])
  })() }, [siteId])

  // Build timeline dates for the table (always end at "today" visually)
  const todayKey = today()
  const displayEndDate = useMemo(()=> new Date(todayKey), [todayKey])
  const timelineDates = useMemo(()=> buildSequentialDates(timelineDays, displayEndDate), [timelineDays, displayEndDate])

  // GSC fetch (used for both modes: clicks/volume always; positions when in GSC mode)
  const loadGscData = useCallback(async()=>{
    const siteUrl = getGscSite()
    const keywords = list.map(k=>k.query.trim()).filter(Boolean)
    if(!keywords.length){ setGscSummary({}); setGscTimeline({}); setGscDates([]); setGscError(null); return }
    if(!siteUrl){ setGscError('Connect Google Search Console to this website to view GSC data.'); setGscSummary({}); setGscTimeline({}); setGscDates([]); return }

    const run = ++gscRunId.current
    setGscLoading(true); setGscError(null)
    // Fetch window ends at GSC-available day (today - delay), but UI shows up to today
    const fetchEndDate = new Date()
    fetchEndDate.setDate(fetchEndDate.getDate() - GSC_DELAY_DAYS)
    const startDate = new Date(fetchEndDate)
    startDate.setDate(startDate.getDate() - (timelineDays - 1))
    const start = fmtDate(startDate)
    const end = fmtDate(fetchEndDate)

    const queryMap = new Map<string,string>()
    list.forEach(item=>{ const norm = normalizeQuery(item.query); if(norm && !queryMap.has(norm)) queryMap.set(norm, item.query) })
    const regex = buildRegexPattern(Array.from(queryMap.values()))
    try{
      const summaryUrl = `/api/google/gsc/queries?site=${encodeURIComponent(siteUrl)}&start=${start}&end=${end}&rowLimit=25000${regex ? `&includeRegex=${encodeURIComponent(regex)}` : ''}`
      const summaryRes = await fetch(summaryUrl)
      if(run !== gscRunId.current) return
      if(!summaryRes.ok) throw new Error(`GSC summary failed (${summaryRes.status})`)
      let summaryJson = await summaryRes.json().catch(()=>({}))
      let rowsRaw: any[] = Array.isArray(summaryJson.rows) ? summaryJson.rows : []
      if(rowsRaw.length === 0 && regex){
        const fbUrl = `/api/google/gsc/queries?site=${encodeURIComponent(siteUrl)}&start=${start}&end=${end}&rowLimit=25000`
        const fbRes = await fetch(fbUrl)
        if(run !== gscRunId.current) return
        if(fbRes.ok){
          const fbJson = await fbRes.json().catch(()=>({}))
          rowsRaw = Array.isArray(fbJson.rows) ? fbJson.rows : []
        }
      }

      const summary: Record<string, GscSummaryEntry> = {}
      for(const row of rowsRaw){
        const query = row?.keys?.[0]
        if(!query) continue
        const norm = normalizeQuery(query)
        if(!queryMap.has(norm)) continue
        summary[norm] = {
          clicks: Number(row.clicks || 0),
          impressions: Number(row.impressions || 0),
          position: Number(row.position || 0)
        }
      }

      const timeline: Record<string, Record<string, TimelinePoint>> = {}
      const entries = Array.from(queryMap.entries())
      let index = 0
      const concurrency = Math.min(4, entries.length)
      const errors: string[] = []
      await Promise.all(Array.from({ length: concurrency }).map(async()=>{
        while(true){
          const current = index++
          if(current >= entries.length) break
          const [norm, qStr] = entries[current]
          try{
            const url = `/api/google/gsc/query-trend?site=${encodeURIComponent(siteUrl)}&start=${start}&end=${end}&query=${encodeURIComponent(qStr)}`
            const res = await fetch(url)
            if(run !== gscRunId.current) return
            if(!res.ok) throw new Error(`HTTP ${res.status}`)
            const json = await res.json().catch(()=>({}))
            const byDate: Record<string, TimelinePoint> = {}
            for(const row of json.rows || []){
              const d = row?.keys?.[0]
              if(!d) continue
              byDate[d] = {
                position: safeNumber(row.position),
                clicks: safeNumber(row.clicks) ?? undefined,
                impressions: safeNumber(row.impressions) ?? undefined
              }
            }
            timeline[norm] = byDate
          }catch(err:any){
            errors.push(`${qStr}: ${err?.message || 'error'}`)
          }
        }
      }))
      if(run !== gscRunId.current) return
      if(errors.length){
        setGscError(`Some keywords could not load (${errors.slice(0,3).join(', ')}${errors.length>3?'...':''})`)
      }
      // Fallback: if summary is empty or missing entries, derive from timeline sums
      const derived: Record<string, GscSummaryEntry> = { ...summary }
      Object.keys(timeline).forEach(norm => {
        if(!derived[norm]){
          let clicks = 0
          let impressions = 0
          let posSum = 0
          let posCount = 0
          const byDate = timeline[norm] || {}
          Object.keys(byDate).forEach(d => {
            const pt = byDate[d]
            if(typeof pt.clicks === 'number') clicks += pt.clicks
            if(typeof pt.impressions === 'number') impressions += pt.impressions
            if(typeof pt.position === 'number' && Number.isFinite(pt.position!)){
              posSum += pt.position as number
              posCount += 1
            }
          })
          derived[norm] = {
            clicks,
            impressions,
            position: posCount ? Number((posSum/posCount).toFixed(1)) : 0
          }
        }
      })
      setGscSummary(derived)
      setGscTimeline(timeline)
      setGscDates(buildSequentialDates(timelineDays, displayEndDate))
    }catch(err:any){
      if(run !== gscRunId.current) return
      setGscSummary({}); setGscTimeline({}); setGscDates([]); setGscError(err?.message || 'Failed to load GSC data')
    }finally{
      if(run === gscRunId.current) setGscLoading(false)
    }
  // Load whenever site/keywords/dates change
  }, [siteId, list, timelineDays, displayEndDate, getGscSite])

  useEffect(()=>{ loadGscData() }, [loadGscData])

  // Convert vertical wheel scrolling into horizontal scroll when hovering the dates area
  useEffect(()=>{
    const attach = (el: HTMLDivElement | null, stickyWidth: number)=>{
      if(!el) return () => {}
      const onWheel = (e: WheelEvent)=>{
        if(el.scrollWidth <= el.clientWidth) return
        // Only translate vertical to horizontal when the pointer is over the date columns
        const rect = el.getBoundingClientRect()
        const xWithin = (e.clientX - rect.left) + el.scrollLeft
        if(xWithin <= stickyWidth) return // let the page scroll vertically
        if(Math.abs(e.deltaY) > Math.abs(e.deltaX)){
          e.preventDefault()
          el.scrollLeft += e.deltaY
        }
      }
      el.addEventListener('wheel', onWheel, { passive:false })
      return ()=> el.removeEventListener('wheel', onWheel as any)
    }
    const detachList = attach(listScrollRef.current, COL_KEYWORD + COL_CLICKS + COL_VOLUME)
    const detachHist = attach(historyScrollRef.current, COL_KEYWORD)
    return ()=>{ detachList && detachList(); detachHist && detachHist() }
  }, [viewMode])

  // Search filter
  const filtered = useMemo(()=>{
    const term = search.trim().toLowerCase()
    if(!term) return list
    return list.filter(item => item.query.toLowerCase().includes(term))
  }, [list, search])

  // Build rows for the table
  const rows = useMemo(()=>{
    if(trackerMode==='gsc'){
      return filtered.map(kw=>{
        const norm = normalizeQuery(kw.query)
        const summary = gscSummary[norm]
        const source = gscTimeline[norm] || {}
        return { keyword: kw, clicks: summary?.clicks ?? null, impressions: summary?.impressions ?? null, timeline: buildTimelineCells(timelineDates, source) }
      })
    }
    // API mode: positions from keyword.history, clicks/impressions from gscSummary
    return filtered.map(kw=>{
      const norm = normalizeQuery(kw.query)
      const summary = gscSummary[norm]
      const byDate: Record<string,TimelinePoint> = {}
      kw.history.forEach(h=>{ if(h.date){ byDate[h.date] = { position: h.position ?? null } } })
      return { keyword: kw, clicks: summary?.clicks ?? null, impressions: summary?.impressions ?? null, timeline: buildTimelineCells(timelineDates, byDate) }
    })
  }, [filtered, trackerMode, gscSummary, gscTimeline, timelineDates])

  // Stats bar (use latest available day for each mode)
  const stats = useMemo(()=>{
    const refOffset = trackerMode === 'gsc' ? GSC_DELAY_DAYS : 0
    const bucket = (v: number | null)=>{
      if(v===null) return 'unknown'
      if(v===1) return 'top1'
      if(v<=3) return 'top3'
      if(v<=10) return 'top10'
      if(v<=20) return 'top20'
      if(v<=50) return 'top50'
      return 'gt50'
    }
    const date0 = timelineDates[refOffset] || timelineDates[0]
    const date1 = timelineDates[refOffset+1] || timelineDates[1] || timelineDates[0]
    const counts: Record<string, number> = { all:0, top1:0, top3:0, top10:0, top20:0, top50:0, gt50:0, unknown:0 }
    const prev: Record<string, number> = { all:0, top1:0, top3:0, top10:0, top20:0, top50:0, gt50:0, unknown:0 }
    let improved = 0, dropped = 0
    const only: number[] = []
    rows.forEach(r=>{
      const p0 = r.timeline[date0]?.position ?? null
      const p1 = r.timeline[date1]?.position ?? null
      // Apply same range logic as row filtering so chip counts match what appears when clicked
      const inRange = (p0 === null) ? true : (p0 >= posMin && p0 <= posMax)
      if(inRange){
        counts[bucket(p0)] += 1
        counts.all += 1
      }
      // Previous counts are only used for deltas; ignore range for delta math to avoid oscillation
      prev[bucket(p1)] += 1
      prev.all += 1
      if(p0!==null) only.push(p0)
      if(p0!==null && p1!==null){ const d = Number((p1 - p0).toFixed(1)); if(d>0) improved++; else if(d<0) dropped++ }
    })
    const deltas: Record<string, number> = {}
    Object.keys(counts).forEach(k=>{ deltas[k] = (counts as any)[k] - (prev as any)[k] })
    const avgPos = only.length? Math.round((only.reduce((a,b)=>a+b,0)/only.length)*10)/10 : null
    return { counts, deltas, improved, dropped, avgPos }
  }, [rows, timelineDates, trackerMode])

  const displayedRows = useMemo(()=>{
    const refOffset = trackerMode === 'gsc' ? GSC_DELAY_DAYS : 0
    const matchesFilter = (v: number | null)=>{
      switch(posFilter){
        case 'top1': return v===1
        case 'top3': return typeof v==='number' && v<=3
        case 'top10': return typeof v==='number' && v<=10
        case 'top20': return typeof v==='number' && v<=20
        case 'top50': return typeof v==='number' && v<=50
        case 'gt50': return typeof v==='number' && v>50
        case 'unknown': return v===null
        default: return true
      }
    }
    const date0 = timelineDates[refOffset] || timelineDates[0]
    return rows.filter(r=>{
      const v = r.timeline[date0]?.position ?? null
      // If unknown, keep row visible regardless of range controls.
      const inRange = (v === null) ? true : (v >= posMin && v <= posMax)
      return matchesFilter(v) && inRange
    })
  }, [rows, timelineDates, posFilter, posMin, posMax, trackerMode])

  // Actions
  const upsertForDate = useCallback((hist: Kw['history'], date: string, position: number | null)=>{
    const idx = hist.findIndex(h=> h.date===date)
    if(idx>=0){ const clone=[...hist]; clone[idx]={...clone[idx], position}; return clone }
    return [{date, position}, ...hist].slice(0, MAX_TIMELINE_DAYS)
  }, [])

  const setManual = useCallback(async(id: string, position: number | null, date: string)=>{
    if(!siteId) return
    await fetch(`/api/keywords/${id}/position`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ siteId, position, source:'manual', date }) })
    setList(prev=> prev.map(k => k.id===id ? { ...k, history: upsertForDate(k.history, date, position) } : k))
  }, [siteId, upsertForDate])

  const handleManualForDate = useCallback((kw: Kw, date: string, cell?: TimelineCell)=>{
    const current = cell?.position ?? null
    const raw = window.prompt(`Set position for "${kw.query}" on ${date} (1-100, blank to clear)`, current===null? '' : String(current))
    if(raw===null) return
    const t = raw.trim(); const pos = t===''? null : Math.max(1, Math.min(100, Number(t)||1))
    setManual(kw.id, pos, date)
  }, [setManual])

  const checkOne = useCallback(async(kw: Kw)=>{
    setBusy('check')
    try{
      const r = await fetch('/api/keywords/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ q: kw.query, targetUrl: kw.targetUrl, targetDomain: kw.targetDomain, country:'au', lang:'en' }) })
      const j = await r.json().catch(()=>null)
      if(!j?.ok){ alert(j?.error || 'Check failed'); return }
      const pos: number | null = j.data?.position ?? null
      await fetch(`/api/keywords/${kw.id}/position`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ siteId, position: pos, source:'api', provider: j.data?.provider, foundUrl: j.data?.foundUrl }) })
      setList(prev=> prev.map(k => k.id===kw.id ? { ...k, history: upsertForDate(k.history, today(), pos) } : k))
    }finally{ setBusy(null) }
  }, [siteId, upsertForDate])

  const checkAll = useCallback(async()=>{ for(const kw of list){ await checkOne(kw) } }, [list, checkOne])

  // Export CSV (30-day window)
  const exportCsv = useCallback(()=>{
    const header = ['query','target','clicks','impressions', ...timelineDates]
    const lines = [header.join(',')]
    displayedRows.forEach(row => {
      const targetVal = row.keyword.targetUrl || row.keyword.targetDomain || ''
      const cells = timelineDates.map(d => {
        const v = row.timeline[d]?.position
        return v===null || v===undefined ? '' : String(v)
      })
      lines.push([
        JSON.stringify(row.keyword.query),
        JSON.stringify(targetVal),
        row.clicks ?? '',
        row.impressions ?? '',
        ...cells
      ].join(','))
    })
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'keywords-30d.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [displayedRows, timelineDates])

  const addKeyword = useCallback(async()=>{
    if(!q.trim() || !siteId) return
    setBusy('add')
    try{
      const dom = (domain.trim() || getSiteDomain() || '')
      const r = await fetch('/api/keywords', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ siteId, query:q.trim(), targetUrl: target.trim()||undefined, targetDomain: dom||undefined }) })
      const j = await r.json().catch(()=>null)
      if(j?.ok && j.data){ setList(prev=> [j.data, ...prev]); setQ(''); setTarget(''); setDomain('') } else { alert(j?.error||'Failed to add keyword') }
    }finally{ setBusy(null) }
  }, [q, siteId, target, domain, getSiteDomain])

  const removeKeyword = useCallback(async(id: string)=>{ if(!siteId) return; if(!confirm('Remove this keyword?')) return; await fetch(`/api/keywords/${id}?siteId=${encodeURIComponent(siteId)}`, { method:'DELETE' }); setList(prev=> prev.filter(x=> x.id!==id)) }, [siteId])

  const saveSerpKey = useCallback(async(action:'save'|'clear')=>{
    if(action==='save'){
      if(!serpProvider || !serpKey.trim()){ alert('Enter provider and API key'); return }
      const r = await fetch('/api/settings/serp-global', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ provider: serpProvider, apiKey: serpKey.trim() }) })
      const j = await r.json().catch(()=>null)
      if(j?.ok){ setSerpHasKey(true); setSerpKey('') } else { alert(j?.error||'Failed to save key') }
    }else{
      await fetch('/api/settings/serp-global', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ clear:true }) })
      setSerpHasKey(false); setSerpKey('')
    }
  }, [serpProvider, serpKey])

  // Rendering helpers
  const timelineHeader = useMemo(()=> timelineDates.map(date => (
    <th key={date} style={{padding:'8px 12px', textAlign:'center', fontWeight:600}}>{shortLabel(date)}</th>
  )), [timelineDates])

  const renderTimelineCell = useCallback((cell: TimelineCell | undefined)=>{
    const pos = cell?.position ?? null
    const delta = cell?.delta ?? null
    const style = cellStyle(pos)
    const showDelta = delta !== null && Math.abs(delta) >= 0.1
    const up = showDelta && delta! > 0
    return (
      <div style={{background:style.background, border:`1px solid ${style.border}`, borderRadius:10, padding:'6px 6px', minWidth:72, display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
        <span style={{color:style.color, fontWeight:600}}>{formatPosition(pos)}</span>
        {showDelta && (
          <span style={{fontSize:12, fontWeight:600, color: up? '#34d399':'#f87171'}}>{up? '\u25B2' : '\u25BC'} {Math.abs(Math.round(delta!))}</span>
        )}
      </div>
    )
  }, [])

  const stickyKeywordHeader: CSSProperties = { position:'sticky', left:0, top:0, zIndex:4, background:STICKY_BG }
  const stickyClicksHeader: CSSProperties = { position:'sticky', left:COL_KEYWORD, top:0, zIndex:4, background:STICKY_BG }
  const stickyVolumeHeader: CSSProperties = { position:'sticky', left:COL_KEYWORD+COL_CLICKS, top:0, zIndex:4, background:STICKY_BG }
  const stickyKeywordCell: CSSProperties = { position:'sticky', left:0, background:STICKY_BG, zIndex:1 }
  const stickyClicksCell: CSSProperties = { position:'sticky', left:COL_KEYWORD, background:STICKY_BG, zIndex:1 }
  const stickyVolumeCell: CSSProperties = { position:'sticky', left:COL_KEYWORD+COL_CLICKS, background:STICKY_BG, zIndex:1 }

  const handleSelectSite = (id:string)=>{ setSiteId(id); try{ localStorage.setItem('activeWebsiteId', id) }catch{} }

  return (
    <div className="card" style={{padding:16, display:'grid', gap:16}}>
      <header style={{display:'flex', flexWrap:'wrap', justifyContent:'space-between', gap:16}}>
        <div>
          <h2 style={{margin:0}}>Keywords Tracker</h2>
          <p className="muted" style={{margin:'4px 0 0'}}>30 day timeline, sticky columns, manual edits (doubleâ€‘click a cell).</p>
        </div>
        <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
          <div style={{display:'flex', gap:6}}>
            {[7,14,30].map(days => (
              <button
                key={days}
                className="btn secondary"
                style={{height:34, padding:'0 12px', background: timelineDays===days? '#1f1f3a':'#0f0f20', borderColor: timelineDays===days? '#3a3a5d':'#2b2b47', transition:'background 160ms, border-color 160ms'}}
                title={`Show last ${days} days`}
                onClick={()=> setTimelineDays(days)}
              >
                {days===7? '7D' : days===14? '14D' : '30D'}
              </button>
            ))}
          </div>
          <div className="chip" style={{background:'#162042', border:'1px solid #243266', padding:'8px 12px', borderRadius:12}}>
            <strong>{filtered.length}</strong>&nbsp;keywords
          </div>
          {/* GSC connectivity badge */}
          <div className="chip" style={{background:'#162042', border:'1px solid #243266', padding:'8px 12px', borderRadius:12}}>
            GSC: {getGscSite()? 'Connected' : 'Not connected'}
          </div>
          <button className={`btn ${trackerMode==='api' ? '' : 'secondary'}`} onClick={()=> setTrackerMode('api')} disabled={trackerMode==='api'}>API</button>
          <button className={`btn ${trackerMode==='gsc' ? '' : 'secondary'}`} onClick={()=> setTrackerMode('gsc')} disabled={trackerMode==='gsc' || !getGscSite()}>GSC</button>
        </div>
      </header>

      {sites.length>0 && (
        <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
          {sites.map(s=>{
            const parts = (s.name||'').split(/\s+|-/).filter(Boolean)
            const code = parts.length? (parts[0][0] + (parts[1]?.[0]||'') + (parts[2]?.[0]||'')).toUpperCase() : (s.name||'??').slice(0,3).toUpperCase()
            const active = s.id===siteId
            return (
              <div key={s.id} onClick={()=> handleSelectSite(s.id)} style={{ padding:'6px 10px', borderRadius:999, border:`1px solid ${active? '#3a3a5d':'#2b2b47'}`, background: active? '#1f1f3a':'#0f0f20', color: active? '#fff':'#cfd2e6', cursor:'pointer', fontWeight:700, letterSpacing:.3 }}>
                {code}
              </div>
            )
          })}
        </div>
      )}

      <div style={{display:'flex', flexWrap:'wrap', gap:12, alignItems:'center', justifyContent:'space-between'}}>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}></div>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <input className="input" placeholder="Search keywords..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:220}}/>
          {trackerMode==='gsc' && (
            <button className="btn secondary" onClick={()=> loadGscData()} disabled={gscLoading}>{gscLoading? 'Refreshing...' : 'Refresh GSC'}</button>
          )}
          {trackerMode==='api' && (
            <button className="btn secondary" onClick={checkAll} disabled={busy==='check' || !list.length}>{busy==='check'? 'Checking...' : 'Recheck All'}</button>
          )}
          <button className="btn secondary" onClick={exportCsv} disabled={!displayedRows.length}>Export</button>
          <select className="input" value={viewMode} onChange={e=> setViewMode(e.target.value as 'list'|'history')} style={{height:34, maxWidth:140}}>
            <option value="list">View: List</option>
            <option value="history">View: History</option>
          </select>
          <button className="btn secondary" onClick={()=> setBulkOpen(true)}>Bulk add</button>
        </div>
      </div>

      <form onSubmit={e=>{ e.preventDefault(); addKeyword() }} style={{display:'grid', gap:8, gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', alignItems:'center'}}>
        <input className="input" placeholder="Add keyword" value={q} onChange={e=>setQ(e.target.value)} required />
        <input className="input" placeholder="Target URL (optional)" value={target} onChange={e=>setTarget(e.target.value)} />
        <input className="input" placeholder={`Domain (optional) ${getSiteDomain()? '- ' + getSiteDomain():''}`} value={domain} onChange={e=>setDomain(e.target.value)} />
        <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
          <button className="btn" type="submit" disabled={busy==='add'}>{busy==='add'? 'Adding...' : 'Add'}</button>
          <button className="btn secondary" type="button" onClick={()=>{ setQ(''); setTarget(''); setDomain('') }}>Clear</button>
        </div>
      </form>

      {trackerMode==='api' && (
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <select className="input" value={serpProvider} onChange={e=> setSerpProvider(e.target.value as 'serper'|'serpapi')} style={{height:38, maxWidth:160}}>
            <option value="serper">Serper.dev</option>
            <option value="serpapi">SerpAPI</option>
          </select>
          <input className="input" placeholder={serpHasKey? 'Key stored - enter to replace' : 'API key'} value={serpKey} onChange={e=> setSerpKey(e.target.value)} style={{maxWidth:320}} />
          <button className="btn secondary" type="button" onClick={()=> saveSerpKey('save')}>Save key</button>
          <button className="btn secondary" type="button" onClick={()=> saveSerpKey('clear')} disabled={!serpHasKey}>Clear key</button>
          <span className="muted" style={{fontSize:12}}>{serpHasKey? 'Key stored.' : 'Add an API key to run live SERP checks.'}</span>
        </div>
      )}

      {/* Distribution / summary bar */}
      <div className="card" style={{marginTop:8, marginBottom:8, padding:'8px 10px', display:'grid', gridTemplateColumns:'1fr auto auto', alignItems:'center', gap:8}}>
        <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
          {[
            {key:'all', label:'All', color:'#6366f1'},
            {key:'top1', label:'Top 1', color:'#16a34a'},
            {key:'top3', label:'Top 3', color:'#22c55e'},
            {key:'top10', label:'Top 10', color:'#34d399'},
            {key:'top20', label:'Top 20', color:'#84cc16'},
            {key:'top50', label:'Top 50', color:'#f59e0b'},
            {key:'gt50', label:'>50', color:'#f97316'},
            {key:'unknown', label:'Unknown', color:'#94a3b8'},
          ].map((b:any)=>{
            const active = posFilter===b.key
            const n = (stats.counts as any)[b.key] as number
            const d = (stats.deltas as any)[b.key] as number
            return (
              <button
                key={b.key}
                className="btn secondary"
                onClick={()=> setPosFilter(b.key)}
                title="Counts respect current Search and Range filters; day = latest available (API: today, GSC: today−2)."
                style={{height:30, padding:'0 10px', background: active? '#1f1f3a':'#0f0f20', borderColor: active? '#3a3a5d':'#2b2b47', color: active? '#fff': b.color}}
              >
                {b.label}
                <span className="badge" style={{marginLeft:6, borderColor:b.color, color:b.color}}>{n}</span>
                <span style={{marginLeft:6, fontSize:12, color: d>0? '#34d399' : d<0? '#ef4444' : '#94a3b8'}}>{d>0? `+${d}` : d<0? `${d}` : '~0'}</span>
              </button>
            )
          })}
        </div>
        <div className="muted" style={{fontSize:12}}>Average position: <strong>{stats.avgPos ?? '--'}</strong> - In Top 10: <strong>{stats.counts.top10}</strong> - In Top 20: <strong>{stats.counts.top20}</strong></div>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <div className="muted" style={{fontSize:12}}>Changes: <span style={{color:'#34d399'}}>Up {stats.improved}</span> <span style={{marginLeft:8, color:'#ef4444'}}>Down {stats.dropped}</span></div>
          <div className="muted" style={{fontSize:12}}>Range:</div>
          <input type="number" className="input" value={posMin} onChange={e=> setPosMin(Math.max(1, Math.min(posMax, parseInt(e.target.value||'1')||1)))} style={{width:70, height:30}}/>
          <span className="muted" style={{fontSize:12}}>to</span>
          <input type="number" className="input" value={posMax} onChange={e=> setPosMax(Math.min(100, Math.max(posMin, parseInt(e.target.value||'100')||100)))} style={{width:70, height:30}}/>
        </div>
      </div>

      {viewMode==='list' && (
      <div ref={listScrollRef} style={{overflowX:'auto', position:'relative'}}>
        <table className="table" style={{minWidth: timelineDates.length ? (360 + timelineDates.length * 96) : '100%'}}>
          <thead>
            <tr>
              <th style={{padding:'8px 12px', minWidth:COL_KEYWORD, ...stickyKeywordHeader}}>Keyword</th>
              <th
                style={{padding:'8px 12px', minWidth:COL_CLICKS, textAlign:'center', ...stickyClicksHeader}}
                title={`Clicks from Google Search Console for the last ${timelineDays} days`}
              >
                Clicks
              </th>
              <th
                style={{padding:'8px 12px', minWidth:COL_VOLUME, textAlign:'center', ...stickyVolumeHeader}}
                title={`Impressions from Google Search Console for the last ${timelineDays} days`}
              >
                Impressions
              </th>
              {timelineHeader}
            </tr>
          </thead>
          <tbody>
            {displayedRows.map(row => (
              <tr key={row.keyword.id}>
                <td style={{padding:'12px', minWidth:COL_KEYWORD, ...stickyKeywordCell}}>
                  <div style={{display:'grid', gap:4}}>
                    <strong>{row.keyword.query}</strong>
                    {(row.keyword.targetUrl || row.keyword.targetDomain) && (
                      <span className="muted" style={{fontSize:12}}>{row.keyword.targetUrl || row.keyword.targetDomain}</span>
                    )}
                    <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                      <a
                        className="btn secondary"
                        style={{height:28, display:'inline-grid', placeItems:'center'}}
                        href={`https://www.google.com/search?q=${encodeURIComponent(row.keyword.query)}&gl=au&hl=en&pws=0&num=100`}
                        target="_blank" rel="noopener noreferrer"
                        title="Open in Google AU"
                      >Search AU</a>
                      {trackerMode==='api' && (
                        <button className="btn secondary" style={{height:28}} onClick={()=> checkOne(row.keyword)} disabled={busy==='check'}>{busy==='check'? 'Checking...' : 'Check'}</button>
                      )}
                      <button className="btn secondary" style={{height:28}} onClick={()=> removeKeyword(row.keyword.id)}>Delete</button>
                    </div>
                  </div>
                </td>
                <td style={{padding:'12px', minWidth:COL_CLICKS, textAlign:'center', ...stickyClicksCell}}>{formatNumber(row.clicks)}</td>
                <td style={{padding:'12px', minWidth:COL_VOLUME, textAlign:'center', ...stickyVolumeCell}}>{formatNumber(row.impressions)}</td>
                {timelineDates.map(date => (
                  <td key={date} style={{padding:'6px 8px', textAlign:'center'}} onDoubleClick={()=> handleManualForDate(row.keyword, date, row.timeline[date])} title="Double-click to set position">
                    {renderTimelineCell(row.timeline[date])}
                  </td>
                ))}
              </tr>
            ))}
            {displayedRows.length===0 && (
              <tr>
                <td colSpan={3 + timelineDates.length} style={{padding:'18px 12px', textAlign:'center'}} className="muted">No keywords yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {viewMode==='history' && (
        <div className="card" style={{padding:12}}>
          <div ref={historyScrollRef} style={{overflowX:'auto'}}>
            <div style={{display:'grid', gridTemplateColumns: `minmax(${COL_KEYWORD}px,2fr) ${timelineDates.map(()=> 'minmax(96px,1fr)').join(' ')}`, gap:8, alignItems:'center'}}>
              <div className="muted">Keyword</div>
              {timelineDates.map(date => (
                <div key={date} className="muted" style={{textAlign:'center'}}>{shortLabel(date)}</div>
              ))}
              {displayedRows.map(row => (
                <div key={row.keyword.id} style={{display:'contents'}}>
                  <div className="q-name" title={row.keyword.query}>{row.keyword.query}</div>
                  {timelineDates.map(date => (
                    <div key={`${row.keyword.id}-${date}`} style={{textAlign:'center'}} onDoubleClick={()=> handleManualForDate(row.keyword, date, row.timeline[date])}>
                      {renderTimelineCell(row.timeline[date])}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {trackerMode==='gsc' && !getGscSite() && (
        <div style={{padding:'12px 14px', borderRadius:8, border:'1px solid #4c2c2c', background:'#2b152b', color:'#f59e0b'}}>
          Connect Google Search Console to this website in Websites → Integrations to view GSC clicks, impressions and positions.
        </div>
      )}
      {trackerMode==='gsc' && getGscSite() && (
        <div className="muted" style={{fontSize:12}}>
          Clicks and impressions come from GSC for the last {timelineDays} days. Positions may lag by ~2 days.
        </div>
      )}

      {bulkOpen && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'grid', placeItems:'center', zIndex:50}} onClick={()=> setBulkOpen(false)}>
          <div className="card" style={{width:'min(720px, 92vw)', padding:16, display:'grid', gap:12}} onClick={e=> e.stopPropagation()}>
            <strong>Add keywords in bulk</strong>
            <textarea id="bulk-kws" className="input" rows={10} placeholder={'keyword one\nkeyword two\nkeyword three'} />
            <div style={{display:'grid', gap:8, gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))'}}>
              <input className="input" placeholder="Target URL (optional)" value={target} onChange={e=>setTarget(e.target.value)} />
              <input className="input" placeholder={`Domain (optional) ${getSiteDomain()? '- ' + getSiteDomain():''}`} value={domain} onChange={e=>setDomain(e.target.value)} />
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
              <button className="btn secondary" onClick={()=> setBulkOpen(false)}>Cancel</button>
              <button className="btn" onClick={async()=>{
                const ta = document.getElementById('bulk-kws') as HTMLTextAreaElement | null
                const lines = ta?.value?.split(/\r?\n/) || []
                for(const line of lines){
                  const keyword = line.trim(); if(!keyword) continue
                  const dom = (domain.trim() || getSiteDomain() || '')
                  const r = await fetch('/api/keywords', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ siteId, query: keyword, targetUrl: target.trim()||undefined, targetDomain: dom||undefined }) })
                  const j = await r.json().catch(()=>null)
                  if(j?.ok && j.data){ setList(prev=> [j.data, ...prev]) }
                }
                if(ta) ta.value = ''
                setBulkOpen(false)
              }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


