"use client"
import RangeDropdown from "@/components/ui/RangeDropdown"
import RangePicker from "@/components/ui/RangePicker"
import WebsitePicker from "@/components/dashboard/WebsitePicker"
import { useEffect, useMemo, useState } from "react"
import { useDateRange } from "@/components/date-range"

type FieldStatus = 'OPTIMIZED'|'NOT_OPTIMIZED'|'MISSING'
type Row = { url: string, clicks?: number, impressions?: number, ctr?: number, position?: number, changePct?: number, status?: 'OPTIMIZED'|'NOT_OPTIMIZED'|'NOT_ANALYZED',
  titleTag?: FieldStatus, metaDescription?: FieldStatus, imageAlt?: FieldStatus, schema?: FieldStatus, headings?: FieldStatus, content?: FieldStatus }

function activeSiteId(){ return (typeof window!=='undefined' && localStorage.getItem('activeWebsiteId')) || undefined }
function gscSiteUrl(id?: string){ if(!id) return undefined; try{ return JSON.parse(localStorage.getItem('integrations:'+id)||'{}').gscSite as string|undefined }catch{ return undefined } }
function loadSaved(id?: string): Row[]{ if(!id) return [] as Row[]; try{ return JSON.parse(localStorage.getItem('optimize:'+id)||'[]') as Row[] }catch{ return [] as Row[] } }
function saveSaved(id: string, rows: Row[]){ localStorage.setItem('optimize:'+id, JSON.stringify(rows)) }

export default function OptimizeClient(){
  const { range, setRange } = useDateRange()
  const [rows, setRows] = useState<Row[]>([])
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<'ALL'|'OPTIMIZED'|'NOT_OPTIMIZED'|'NOT_ANALYZED'>('ALL')
  const [filters, setFilters] = useState<{[k:string]: 'ALL'|FieldStatus}>({ titleTag:'ALL', metaDescription:'ALL', imageAlt:'ALL', schema:'ALL', headings:'ALL', content:'ALL' })
  const setFilter = (k: keyof typeof filters, v: 'ALL'|FieldStatus)=> setFilters(prev => ({ ...prev, [k]: v }))
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [openRange, setOpenRange] = useState(false)
  const [crawlMerged, setCrawlMerged] = useState<Row[]>([])

  const siteId = activeSiteId()
  const siteUrl = gscSiteUrl(siteId)
  const ga4Property = (typeof window!=='undefined' && siteId ? (JSON.parse(localStorage.getItem('integrations:'+siteId)||'{}').ga4Property as string|undefined) : undefined)

  useEffect(()=>{ setRows(loadSaved(siteId)) }, [siteId])

  // Load crawled pages for this site and merge into the grid (in addition to GSC)
  useEffect(()=>{
    if(!siteId) return
    fetch(`/api/crawl/results?siteId=${encodeURIComponent(siteId)}`)
      .then(r=> r.ok? r.json(): null)
      .then(j=>{
        if(!j?.pages){ setCrawlMerged([]); return }
        const list = (j.pages as any[]).map(p=> ({ url: String(p.url||'') })) as Row[]
        setCrawlMerged(list)
      })
      .catch(()=> setCrawlMerged([]))
  }, [siteId])

  const fmt = (d:Date)=> d.toISOString().slice(0,10)
  const qs = (p:any)=> Object.entries(p).map(([k,v])=>`${k}=${encodeURIComponent(String(v))}`).join('&')

  const fetchPages = async ()=>{
    if(!siteUrl) return
    setLoading(true)
    try{
      // Clamp date to yesterday to avoid GSC delay
      let start = new Date(range.from)
      let end = new Date(range.to)
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1)
      if(end > yesterday) end = yesterday
      if(start > end) start = new Date(end)

      const res = await fetch(`/api/google/gsc/pages?${qs({site:siteUrl, start: fmt(start), end: fmt(end), rowLimit: 1000})}`)
      const data = await res.json()
      const arr = (data.rows||[]).map((r:any)=> ({ url: r.keys?.[0], clicks: r.clicks||0, impressions: r.impressions||0, ctr: Math.round((r.ctr||0)*1000)/10, position: Math.round((r.position||0)*10)/10 })) as Row[]
      const days = Math.max(1, Math.round((end.getTime()-start.getTime())/86400000)+1)
      const prevEnd = new Date(start); prevEnd.setDate(start.getDate()-1)
      const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate()-(days-1))
      const prevRes = await fetch(`/api/google/gsc/pages?${qs({site:siteUrl, start: fmt(prevStart), end: fmt(prevEnd), rowLimit: 1000})}`)
      const prev = await prevRes.json()
      const prevMap = new Map<string, any>((prev.rows||[]).map((r:any)=> [r.keys?.[0], r]))
      arr.forEach(r=>{
        const p = prevMap.get(r.url)
        if(p){
          const pct = (r.clicks! - (p.clicks||0)) / Math.max(1,(p.clicks||0)) * 100
          r.changePct = Math.round(pct*10)/10
        }
      })

      // Merge with saved rows: update metrics for existing URLs instead of keeping old values
      const saved = loadSaved(siteId)
      const arrMap = new Map<string, Row>(arr.map(a => [a.url, a]))
      const merged: Row[] = saved.map((s: Row) => ({ ...s, ...(arrMap.get(s.url) || {}) }))
      // add any new URLs not in saved
      arr.forEach(a => { if(!merged.find(m => m.url === a.url)) merged.push(a) })

      // Merge any pages from crawl results not present yet
      crawlMerged.forEach(c=>{ if(c.url && !merged.find(m=> m.url===c.url)) merged.push(c) })

      // Optionally load GA4 sessions and merge by pageLocation (full URL)
      if(ga4Property){
        try{
          const rep = await fetch('/api/google/ga4/report', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: ga4Property, start: fmt(start), end: fmt(end) }) })
          const r = await rep.json()
          const ga4map = new Map<string, number>((r.rows||[]).map((x:any)=> [x.dimensionValues?.[0]?.value, Number(x.metricValues?.[0]?.value||0)]) )
          merged.forEach(m=>{ const v = ga4map.get(m.url); if(v!==undefined) (m as any).sessions = v })
        }catch{}
      }
      setRows(merged)
      if(siteId) saveSaved(siteId!, merged)
    }finally{ setLoading(false) }
  }

  useEffect(()=>{ fetchPages(); setPage(1) }, [siteUrl, range.from, range.to, crawlMerged.length])

  const addUrl = () => {
    const u = prompt('Enter page URL')
    if(!u) return
    const next: Row[] = [...rows, { url: u, status: 'NOT_ANALYZED' as Row['status'] }]
    setRows(next); if(siteId) saveSaved(siteId, next)
  }

  const analyze = async (u: string) => {
    // quick on-page check: populate field statuses; leave overall status unchanged until user marks as optimized
    try{
      const res = await fetch('/api/optimize/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ url: u }) })
      const out = await res.json()
      if(out?.ok){
        const f = out.data.fields as any
        const next = rows.map(r=> r.url===u ? { ...r, ...f } : r)
        setRows(next); if(siteId) saveSaved(siteId!, next)
      } else {
        alert(`Scan failed: ${out?.error || 'Unknown error'}`)
      }
    }catch(e:any){ alert(`Scan failed: ${e?.message || e}`) }
  }

  const analyzeAI = async (u: string) => {
    const res = await fetch('/api/ai/optimize', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ url: u }) })
    const data = await res.json()
    const ok = data?.ok
    if(siteId){ localStorage.setItem(`optimizeResult:${siteId}:${u}`, JSON.stringify(data)) }
    // Flip status automatically after successful AI optimize
    const next: Row[] = rows.map(r=> r.url===u ? { ...r, status: (ok? 'OPTIMIZED' : 'NOT_OPTIMIZED') as Row['status'] } : r)
    setRows(next); if(siteId) saveSaved(siteId!, next)
  }

  const analyzeAll = async () => {
    for(const r of rows){ await analyze(r.url) }
  }

  const remove = (u:string) => { const next = rows.filter(r=> r.url!==u); setRows(next); if(siteId) saveSaved(siteId,next) }
  const markOptimized = (u:string, val:boolean) => { const next: Row[] = rows.map(r=> r.url===u ? { ...r, status: (val? 'OPTIMIZED' : 'NOT_OPTIMIZED') as Row['status'] } : r); setRows(next); if(siteId) saveSaved(siteId!, next) }

  const filtered = useMemo(()=> rows.filter(r=> {
      if(query && !r.url.toLowerCase().includes(query.toLowerCase())) return false
      if(!(status==='ALL' || r.status===status)) return false
      const names = ['titleTag','metaDescription','imageAlt','schema','headings','content'] as const
      for(const n of names){
        const want = filters[n]
        if(want!=='ALL' && (r[n]||'') !== want) return false
      }
      return true
    }), [rows, query, status, filters])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = useMemo(()=> {
    const start = (page-1)*pageSize
    return filtered.slice(start, start+pageSize)
  }, [filtered, page, pageSize])

  useEffect(()=>{ if(page>pageCount) setPage(1) }, [pageCount])

  const formatRange = (r:{from:Date,to:Date}) => { const f=(d:Date)=> d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}); return `${f(r.from)} - ${f(r.to)}` }

  return (
    <>
      <div className="page-topbar">
        <WebsitePicker/>
      </div>
      <div className="page-header">
        <h2 style={{margin:0}}>Optimize</h2>
        <div className="breadcrumb">Home – <strong>Optimize</strong></div>
        <div style={{marginLeft:'auto'}}>
          <div className="picker" style={{gap:8}}>
            <button onClick={()=>setOpenRange(true)} style={{background:'transparent', border:0, color:'inherit', cursor:'pointer'}}>{formatRange(range)}</button>
          </div>
        </div>
        <RangePicker open={openRange} onClose={()=>setOpenRange(false)} value={range} onApply={setRange} />
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="opt-top">
          <div className="searchbar" style={{width:'100%'}}>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search" style={{background:'transparent', border:0, color:'inherit', outline:'none', width:'100%'}} />
          </div>
          <div className="seg">
            <button className={status==='ALL'? 'active':''} onClick={()=>setStatus('ALL')}>All</button>
            <button className={status==='OPTIMIZED'? 'active':''} onClick={()=>setStatus('OPTIMIZED')}>Optimized</button>
            <button className={status==='NOT_OPTIMIZED'? 'active':''} onClick={()=>setStatus('NOT_OPTIMIZED')}>Not Optimized</button>
          </div>
        </div>
        <div style={{height:14}}/>
        <div className="filter-row filters-inline">
          <div>
            <div style={{marginBottom:6}}>Title Tag</div>
            <select className="select" value={filters.titleTag} onChange={e=>setFilter('titleTag', e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="OPTIMIZED">Optimized</option>
              <option value="NOT_OPTIMIZED">Not Optimized</option>
              <option value="MISSING">Missing</option>
            </select>
          </div>
          <div>
            <div style={{marginBottom:6}}>Meta Description</div>
            <select className="select" value={filters.metaDescription} onChange={e=>setFilter('metaDescription', e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="OPTIMIZED">Optimized</option>
              <option value="NOT_OPTIMIZED">Not Optimized</option>
              <option value="MISSING">Missing</option>
            </select>
          </div>
          <div>
            <div style={{marginBottom:6}}>Image Alt</div>
            <select className="select" value={filters.imageAlt} onChange={e=>setFilter('imageAlt', e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="OPTIMIZED">Optimized</option>
              <option value="NOT_OPTIMIZED">Not Optimized</option>
              <option value="MISSING">Missing</option>
            </select>
          </div>
          <div>
            <div style={{marginBottom:6}}>Schema</div>
            <select className="select" value={filters.schema} onChange={e=>setFilter('schema', e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="OPTIMIZED">Optimized</option>
              <option value="NOT_OPTIMIZED">Not Optimized</option>
              <option value="MISSING">Missing</option>
            </select>
          </div>
          <div>
            <div style={{marginBottom:6}}>Headings</div>
            <select className="select" value={filters.headings} onChange={e=>setFilter('headings', e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="OPTIMIZED">Optimized</option>
              <option value="NOT_OPTIMIZED">Not Optimized</option>
              <option value="MISSING">Missing</option>
            </select>
          </div>
          <div>
            <div style={{marginBottom:6}}>Content</div>
            <select className="select" value={filters.content} onChange={e=>setFilter('content', e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="OPTIMIZED">Optimized</option>
              <option value="NOT_OPTIMIZED">Not Optimized</option>
              <option value="MISSING">Missing</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="panel-title"><div><strong>Optimize</strong><div className="muted">Start optimizing your website pages</div></div><div>{loading? 'Loading…' : ''}</div></div>
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>URL</th>
              <th>CLICKS</th>
              <th>IMPRESSIONS</th>
              <th>POSITION</th>
              <th className="col-ctr">CTR</th>
              <th className="col-change">CHANGE %</th>
              <th>STATUS</th>
              <th style={{textAlign:'right'}}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {current.map(r=> (
              <tr key={r.url}>
                <td className="url"><a href={`/optimize/page?u=${encodeURIComponent(btoa(r.url))}`}>{r.url}</a></td>
                <td>{r.clicks ?? '-'}</td>
                <td>{r.impressions ?? '-'}</td>
                <td>{r.position?.toFixed?.(1) ?? '-'}</td>
                <td className="col-ctr">{r.ctr!==undefined ? `${r.ctr.toFixed(1)}%` : '-'}</td>
                <td className="col-change">{r.changePct!==undefined ? `${r.changePct>0?'+':''}${r.changePct.toFixed(1)}%` : '-'}</td>
                <td className="status">{r.status ? (
                  <span className={`badge-pill ${r.status==='OPTIMIZED'?'status-ok':'status-bad'}`}>{r.status.replace('_',' ')}</span>
                ) : '-'}</td>
                <td style={{textAlign:'right'}}>
                  <div className="row-actions">
                    <button className="icon-btn" title="Scan On‑Page" onClick={()=>analyze(r.url)}>🔍</button>
                    <button className="icon-btn" title="AI Optimize" onClick={()=>{ analyzeAI(r.url); window.location.href = `/optimize/page?u=${encodeURIComponent(btoa(r.url))}` }}>✨</button>
                    <button className="icon-btn" title={r.status==='OPTIMIZED'?'Mark Not Optimized':'Mark Optimized'} onClick={()=>markOptimized(r.url, !(r.status==='OPTIMIZED'))}>✅</button>
                    <button className="icon-btn" title="Remove" onClick={()=>remove(r.url)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="pagination">
          <div>
            <label className="muted" style={{marginRight:8}}>Rows per page</label>
            <select className="page-size" value={pageSize} onChange={e=>{ const newSize = Math.min(100, Number(e.target.value)); const maxPage = Math.max(1, Math.ceil(filtered.length / newSize)); setPage(Math.min(page, maxPage)); setPageSize(newSize); }}>
              {[10,25,50,100].map(n=> <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="muted" style={{marginLeft:10}}>{(page-1)*pageSize + 1}-{Math.min(page*pageSize, filtered.length)} of {filtered.length}</span>
          </div>
          <div className="pages">
            <button className="page-btn" onClick={()=>setPage(p=> Math.max(1, p-1))} disabled={page===1}>{'<'}</button>
            {Array.from({length: pageCount}).slice(0,7).map((_,i)=>{
              const n = i+1
              return <button key={n} className={`page-btn ${page===n? 'active':''}`} onClick={()=>setPage(n)}>{n}</button>
            })}
            {pageCount>7 && <span className="muted">…</span>}
            <button className="page-btn" onClick={()=>setPage(p=> Math.min(pageCount, p+1))} disabled={page===pageCount}>{'>'}</button>
          </div>
        </div>
      </div>
    </>
  )
}
