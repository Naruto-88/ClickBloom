"use client"
import WebsitePicker from "@/components/dashboard/WebsitePicker"
import Modal from "@/components/ui/Modal"
import RangeDropdown, { DateRange } from "@/components/ui/RangeDropdown"
import KpiCard from "@/components/dashboard/KpiCard"
import PerformancePanel, { Point } from "@/components/dashboard/PerformancePanel"
import { useEffect, useMemo, useRef, useState } from "react"
import { signIn } from "next-auth/react"

type Site = { id: string, name: string, url: string }
type Integ = { gscSite?: string, ga4Property?: string }

function loadSites(): Site[]{ if(typeof window==='undefined') return []; try{ return JSON.parse(localStorage.getItem('websites')||'[]') }catch{ return [] } }
function loadInteg(id: string): Integ{ try{ return JSON.parse(localStorage.getItem('integrations:'+id)||'{}') }catch{ return {} } }

const fmtNum = (n:number)=> n>=1000? (n/1000).toFixed(1)+'K' : String(n)

export default function PerformanceClient(){
  const [siteId, setSiteId] = useState<string|undefined>(undefined)
  const [range, setRange] = useState<DateRange>(()=>{ const y=new Date(); y.setDate(y.getDate()-1); const s=new Date(y); s.setDate(y.getDate()-29); return { from:s,to:y } })
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Record<string, any>>({})
  const [gscRangeBySite, setGscRangeBySite] = useState<Record<string, DateRange>>({})
  const [ga4RangeBySite, setGa4RangeBySite] = useState<Record<string, DateRange>>({})
  const [queryModal, setQueryModal] = useState<{ siteId: string, term: string }|null>(null)
  const [queryDetails, setQueryDetails] = useState<{ trend: Array<{date:string, clicks:number, impressions:number, position:number}>, pages: Array<{url:string, clicks:number, impressions:number}> }|null>(null)
  const [querySort, setQuerySort] = useState<Record<string, { key: 'query'|'impressions'|'clicks'|'position'|'deltaImpressions'|'deltaClicks'|'deltaPosition', dir: 'asc'|'desc' }>>({})
  const [aiOpen, setAiOpen] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState<string|undefined>(undefined)

  const sites = useMemo(()=> loadSites(), [])
  const selectedAll = siteId==='__ALL__'

  const fmtDate = (d:Date)=> d.toISOString().slice(0,10)
  const qs = (p:any)=> Object.entries(p).map(([k,v])=>`${k}=${encodeURIComponent(String(v))}`).join('&')

  useEffect(()=>{
    const run = async()=>{
      const ids = selectedAll? sites.map(s=>s.id) : (siteId? [siteId] : [])
      if(ids.length===0){ setData({}); return }
      setLoading(true)
      try{
        const today = new Date(); const y=new Date(today); y.setDate(today.getDate()-1)
        let start=new Date(range.from), end=new Date(range.to)
        if(end>y) end=y; if(start>end) start=new Date(end)
        const days = Math.max(1, Math.round((end.getTime()-start.getTime())/86400000)+1)
        const prevEnd = new Date(start); prevEnd.setDate(start.getDate()-1)
        const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate()-(days-1))

        const results: Record<string, any> = {}
        for(const id of ids){
          const integ = loadInteg(id)
          const site = sites.find(s=>s.id===id)!
          const gsc = integ.gscSite
          const ga4 = integ.ga4Property
          const item: any = { site, integ, points: [] as Point[], totals:{ clicks:0, impressions:0, ctr:0, position:0 }, prev:{ clicks:0, impressions:0, ctr:0, position:0 }, ga4:{ sessions:0, channels:{} as Record<string,number> }, queries: [] as Array<{ query:string, clicks:number, url?:string }>, errors:{} }
          if(gsc){
            const rG = gscRangeBySite[id] || { from:start, to:end }
            const gStart = rG.from, gEnd = rG.to
            // GSC daily
            const r = await fetch(`/api/google/gsc/search?${qs({ site:gsc, start: fmtDate(gStart), end: fmtDate(gEnd) })}`)
            if(!r.ok){
              item.errors.gsc = `GSC ${r.status}`
              try{ item.errors.gscText = await r.text() }catch{}
            }
            const cur = r.ok? await r.json(): { rows: [] }
            const rows:any[] = cur.rows||[]
            const pts: Point[] = rows.map(rr=> ({ date: rr.keys?.[0], clicks: rr.clicks||0, impressions: rr.impressions||0, ctr: Math.round((rr.ctr||0)*1000)/10, position: Math.round((rr.position||0)*10)/10 }))
            item.points = pts
            const sum=(k:string)=> rows.reduce((a,r)=> a+(r[k]||0),0)
            const totImpr = sum('impressions')
            item.totals.clicks = sum('clicks'); item.totals.impressions=totImpr
            item.totals.ctr = totImpr? (item.totals.clicks/totImpr*100):0
            const posWeighted = rows.reduce((a,r)=> a + (r.position||0)*(r.impressions||0), 0)
            item.totals.position = totImpr? (posWeighted / totImpr) : 0
            // previous window matched to GSC range
            const gDays = Math.max(1, Math.round((gEnd.getTime()-gStart.getTime())/86400000)+1)
            const gPrevEnd = new Date(gStart); gPrevEnd.setDate(gStart.getDate()-1)
            const gPrevStart = new Date(gPrevEnd); gPrevStart.setDate(gPrevEnd.getDate()-(gDays-1))
            const r2 = await fetch(`/api/google/gsc/search?${qs({ site:gsc, start: fmtDate(gPrevStart), end: fmtDate(gPrevEnd) })}`)
            const prev = r2.ok? await r2.json(): { rows: [] }
            const rows2:any[] = prev.rows||[]
            const sum2=(k:string)=> rows2.reduce((a,r)=> a+(r[k]||0),0)
            const prevImpr = sum2('impressions')
            item.prev.clicks=sum2('clicks'); item.prev.impressions=prevImpr
            item.prev.ctr = prevImpr? (item.prev.clicks/prevImpr*100):0
            const prevWeighted = rows2.reduce((a,r)=> a + (r.position||0)*(r.impressions||0), 0)
            item.prev.position = prevImpr? (prevWeighted / prevImpr) : 0
            // queries (current + previous for deltas)
            const qres = await fetch(`/api/google/gsc/queries?${qs({ site:gsc, start: fmtDate(gStart), end: fmtDate(gEnd), rowLimit: 25000 })}`)
            const qjson = qres.ok? await qres.json() : { rows: [] }
            const qrows = (qjson.rows||[]) as any[]
            const qprevRes = await fetch(`/api/google/gsc/queries?${qs({ site:gsc, start: fmtDate(gPrevStart), end: fmtDate(gPrevEnd), rowLimit: 25000 })}`)
            const qprev = qprevRes.ok? await qprevRes.json() : { rows: [] }
            const prevMap = new Map<string, any>((qprev.rows||[]).map((r:any)=> [r.keys?.[0], r]))
            const list = qrows.map((r:any)=>{
              const key = r.keys?.[0]
              const prev = prevMap.get(key) || {}
              return { query: key, clicks: r.clicks||0, impressions: r.impressions||0, position: Number(r.position||0), deltaClicks: (r.clicks||0) - (prev.clicks||0), deltaImpressions: (r.impressions||0) - (prev.impressions||0), deltaPosition: (prev.position!==undefined? Number(r.position||0) - Number(prev.position||0) : 0) }
            })
            list.sort((a:any,b:any)=> (b.clicks||0) - (a.clicks||0))
            item.queries = list
            item.queriesClicks = list.reduce((a:number,q:any)=> a + (q.clicks||0), 0)
          }
          if(ga4){
            const rA = ga4RangeBySite[id] || { from:start, to:end }
            const aStart = rA.from, aEnd = rA.to
            try{
              const gres = await fetch('/api/google/ga4/acquisition', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: ga4, start: fmtDate(aStart), end: fmtDate(aEnd) }) })
              const gjson = await gres.json()
              const rows:any[] = gjson.rows||[]
              const chan: Record<string,number> = {}
              rows.forEach(r=>{ const ch=r.dimensionValues?.[0]?.value||'Other'; const v=Number(r.metricValues?.[0]?.value||0); chan[ch]=(chan[ch]||0)+v })
              item.ga4.channels = chan
              item.ga4.sessions = Object.values(chan).reduce((a,b)=>a+(b||0),0)
            }catch(e:any){ item.errors.ga4 = 'GA4 error' }
          }
          results[id]=item
        }
        setData(results)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [siteId, range.from, range.to, sites.length, selectedAll, JSON.stringify(gscRangeBySite), JSON.stringify(ga4RangeBySite)])

  const blocks = useMemo(()=>{
    const ids = selectedAll? sites.map(s=>s.id) : (siteId? [siteId]: [])
    return ids.map(id=> data[id]).filter(Boolean)
  }, [data, siteId, selectedAll, sites])

  const gscLink = (siteUrl?:string)=> siteUrl? `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(siteUrl)}` : '#'
  const ga4Link = (prop?:string)=>{
    if(!prop) return '#'; const m = String(prop).match(/properties\/(\d+)/); const pid = m?.[1]||''; return pid? `https://analytics.google.com/analytics/web/#/p:${pid}` : '#'
  }
  const periodLabel = (r: DateRange)=>{
    const y = new Date(); y.setDate(y.getDate()-1)
    const days = Math.max(1, Math.round((r.to.getTime()-r.from.getTime())/86400000)+1)
    const sameEnd = r.to.toDateString()===y.toDateString()
    const map: Record<number,string> = {7:'Last 7 Days',28:'Last 28 Days',30:'Last 30 Days',90:'Last 3 Months',180:'Last 6 Months',365:'Last 12 Months'}
    if(sameEnd && map[days]) return map[days]
    const fmt = (d:Date)=> d.toLocaleDateString(undefined,{ day:'numeric', month:'short', year:'numeric' })
    return `${fmt(r.from)} - ${fmt(r.to)}`
  }

  function sortMarker(s: {key:string,dir:'asc'|'desc'}|undefined, key: string){ if(!s || s.key!==key) return ''; return s.dir==='asc'? '↑':'↓' }
  function toggleSort(id:string, key: 'query'|'impressions'|'clicks'|'position'|'deltaImpressions'|'deltaClicks'|'deltaPosition'){
    setQuerySort(prev=>{ const cur = prev[id]; const dir = cur && cur.key===key && cur.dir==='desc'? 'asc':'desc'; return { ...prev, [id]: { key, dir } } })
  }
  function sortQueries(arr:any[], s?: { key:string, dir:'asc'|'desc' }){
    if(!s) return arr
    const copy = [...arr]
    copy.sort((a:any,b:any)=>{
      const ka = (a[s.key] ?? (s.key==='query'? '' : 0))
      const kb = (b[s.key] ?? (s.key==='query'? '' : 0))
      const cmp = (typeof ka==='string')? String(ka).localeCompare(String(kb)) : (Number(ka)-Number(kb))
      return s.dir==='asc'? cmp : -cmp
    })
    return copy
  }

  async function summarize(kind: 'gsc'|'ga4', b: any){
    try{
      setAiBusy(`${b.site.id}:${kind}`)
      const per = kind==='gsc'? periodLabel(gscRangeBySite[b.site.id] || range) : periodLabel(ga4RangeBySite[b.site.id] || range)
      const payload: any = {
        kind,
        site: { name: b.site.name, url: b.site.url },
        period: per,
        totals: b.totals,
        prev: b.prev,
        queries: kind==='gsc'? (b.queries||[]).slice(0,20): [],
        channels: kind==='ga4'? (b.ga4?.channels||{}): {}
      }
      const r = await fetch('/api/ai/performance', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) })
      const j = await r.json(); if(!j?.ok) throw new Error(j?.error||'AI failed')
      setAiText(j.summary||'')
      setAiOpen(true)
    }catch(e:any){ alert(e?.message||'AI summary failed') }
    finally{ setAiBusy(undefined) }
  }

  return (
    <>
      <div className="page-topbar" style={{justifyContent:'space-between'}}>
        <WebsitePicker showAll onChange={(s)=> setSiteId(s? s.id : '__ALL__')} />
      </div>
      {loading && <div className="muted">Loading data…</div>}
      {blocks.length===0 && !loading && <div className="muted">Select a site, or choose All Sites.</div>}
      {blocks.map((b:any)=> (
        <div key={b.site.id} style={{marginTop:12}}>
          <div className="panel-title" style={{marginBottom:8}}>
            <div><strong>{b.site.name}</strong><div className="muted">{b.site.url}</div></div>
            <div className="actions">
              {b.integ.gscSite && <a className="btn secondary" href={gscLink(b.integ.gscSite)} target="_blank" rel="noreferrer">Open in GSC</a>}
              {b.integ.ga4Property && <a className="btn secondary" href={ga4Link(b.integ.ga4Property)} target="_blank" rel="noreferrer">Open in GA4</a>}
            </div>
          </div>
          {/* GSC Section */}
          <div className="panel-title" style={{marginTop:8}}>
            <div><strong>Google Search Console</strong><div className="muted">Search performance and queries</div></div>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <RangeDropdown value={gscRangeBySite[b.site.id] || range} onChange={(r)=> setGscRangeBySite(prev=> ({ ...prev, [b.site.id]: r }))} />
              <button className="btn secondary" onClick={()=> summarize('gsc', b)} disabled={aiBusy===`${b.site.id}:gsc`}>{aiBusy===`${b.site.id}:gsc`? 'Summarizing…':'AI Summary'}</button>
            </div>
          </div>
          {!!b.errors?.gsc && (
            <div className="card" style={{borderColor:'#432020', background:'#2a1212', color:'#ffb6b6', marginBottom:12}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
                <div>
                  <div><strong>Search Console Error</strong>: {b.errors.gsc}</div>
                  <div className="muted" style={{whiteSpace:'pre-wrap'}}>{String(b.errors.gscText||'').slice(0,260)}</div>
                  <div className="muted">Re-authenticate your Google account in Websites → Integrations.</div>
                </div>
                <button className="btn secondary" style={{height:36}} onClick={()=> signIn('google', { callbackUrl: '/performance', prompt: 'consent' as any })}>Reconnect</button>
              </div>
            </div>
          )}
          {!!b.errors?.ga4 && (
            <div className="card" style={{borderColor:'#3a2433', background:'#1b1520', color:'#ffb6b6', marginBottom:12}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
                <div>
                  <div><strong>GA4 Error</strong>: {b.errors.ga4}</div>
                  <div className="muted">Reconnect your Google account to refresh Analytics permissions.</div>
                </div>
                <button className="btn secondary" style={{height:36}} onClick={()=> signIn('google', { callbackUrl: '/performance', prompt: 'consent' as any })}>Reconnect</button>
              </div>
            </div>
          )}
          <section className="grid" style={{gridTemplateColumns:'repeat(3,1fr)', marginBottom:12}}>
            <KpiCard title="Total Clicks" current={b.totals.clicks} previous={b.prev.clicks} format={fmtNum} color="#a78bfa" series={b.points.map((p:Point)=>p.clicks)} />
            <KpiCard title="Total Impressions" current={b.totals.impressions} previous={b.prev.impressions} format={fmtNum} color="#22d3ee" series={b.points.map((p:Point)=>p.impressions)} />
            <KpiCard title="Average Position" current={b.totals.position} previous={b.prev.position} format={(n)=>n.toFixed(1)} color="#22c55e" invert series={b.points.map((p:Point)=>p.position)} />
          </section>
          <div className="split">
            <PerformancePanel points={b.points} hideCtr />
            <div className="card">
              <div className="panel-title">
                <div>
                  <strong>Queries</strong>
                  <div className="muted" style={{marginTop:4}}>Period: {periodLabel(gscRangeBySite[b.site.id] || range)}</div>
                </div>
                <a className="btn secondary" href={gscLink(b.integ.gscSite)} target="_blank" rel="noreferrer">See in GSC</a>
              </div>
              <div style={{marginBottom:8}}>
                <input className="input" placeholder="Search query" onChange={(e)=>{
                  const v = e.target.value.toLowerCase();
                  const copy = { ...data } as any; if(copy[b.site.id]){ copy[b.site.id].queryFilter=v; setData(copy) }
                }} />
              </div>
              {/* Header row */}
              <div className="table" style={{marginBottom:6}}>
                <div style={{display:'grid', gridTemplateColumns:'1.5fr 100px 100px 100px 100px 100px', gap:8, padding:'6px 8px'}}>
                  <button className="muted" style={{fontSize:12, textTransform:'uppercase', letterSpacing:'.04em', textAlign:'left', background:'transparent', border:0, cursor:'pointer'}} onClick={()=>toggleSort(b.site.id,'query')}>Query {sortMarker(querySort[b.site.id],'query')}</button>
                  <button className="muted" style={{fontSize:12, textTransform:'uppercase', letterSpacing:'.04em', textAlign:'center', background:'transparent', border:0, cursor:'pointer'}} onClick={()=>toggleSort(b.site.id,'impressions')}>Impressions {sortMarker(querySort[b.site.id],'impressions')}</button>
                  <button className="muted" style={{fontSize:12, textTransform:'uppercase', letterSpacing:'.04em', textAlign:'center', background:'transparent', border:0, cursor:'pointer'}} onClick={()=>toggleSort(b.site.id,'deltaImpressions')}>Δ Impr. {sortMarker(querySort[b.site.id],'deltaImpressions')}</button>
                  <button className="muted" style={{fontSize:12, textTransform:'uppercase', letterSpacing:'.04em', textAlign:'center', background:'transparent', border:0, cursor:'pointer'}} onClick={()=>toggleSort(b.site.id,'clicks')}>Clicks {sortMarker(querySort[b.site.id],'clicks')}</button>
                  <button className="muted" style={{fontSize:12, textTransform:'uppercase', letterSpacing:'.04em', textAlign:'center', background:'transparent', border:0, cursor:'pointer'}} onClick={()=>toggleSort(b.site.id,'deltaClicks')}>Δ Clicks {sortMarker(querySort[b.site.id],'deltaClicks')}</button>
                  <button className="muted" style={{fontSize:12, textTransform:'uppercase', letterSpacing:'.04em', textAlign:'center', background:'transparent', border:0, cursor:'pointer'}} onClick={()=>toggleSort(b.site.id,'position')}>Avg Pos {sortMarker(querySort[b.site.id],'position')}</button>
                </div>
              </div>
              <div style={{display:'grid', gap:8, maxHeight:320, overflowY:'auto'}}>
                {sortQueries((b.queries||[]), querySort[b.site.id]).filter((q:any)=>{
                  const f = (data[b.site.id]?.queryFilter||'');
                  if(!f) return true; return String(q.query||'').toLowerCase().includes(f)
                }).map((q:any,i:number)=> (
                  <div key={i} style={{display:'grid', gridTemplateColumns:'1.5fr 100px 100px 100px 100px 100px', alignItems:'center', gap:8}}>
                    <a href="#" onClick={(e)=>{ e.preventDefault(); setQueryModal({ siteId: b.site.id, term: q.query }); }} style={{color:'#93c5fd', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={q.query}>{q.query}</a>
                    <div style={{textAlign:'center'}}>{q.impressions||0}</div>
                    <div style={{textAlign:'center', color: (q.deltaImpressions||0)>=0? '#34d399':'#f87171' }}>{(q.deltaImpressions||0)>=0? `+${q.deltaImpressions||0}`: (q.deltaImpressions||0)}</div>
                    <div style={{textAlign:'center'}}>{q.clicks||0}</div>
                    <div style={{textAlign:'center', color: (q.deltaClicks||0)>=0? '#34d399':'#f87171' }}>{(q.deltaClicks||0)>=0? `+${q.deltaClicks||0}`: (q.deltaClicks||0)}</div>
                    <div style={{textAlign:'center'}}>{(q.position!==undefined? Number(q.position).toFixed(1): '-')}</div>
                  </div>
                ))}
                {(!b.queries || b.queries.length===0) && <div className="muted">No query data</div>}
              </div>
              {!!b.totals?.clicks && (
                <div className="muted" style={{marginTop:6}}>
                  Coverage: {Math.min(100, Math.round(((b.queriesClicks||0)/Math.max(1, b.totals.clicks))*100))}% of clicks captured in query rows ({b.queriesClicks||0} / {b.totals.clicks}).
                  Low‑volume or anonymized queries may be hidden by Search Console and not returned by the API.
                </div>
              )}
            </div>
          </div>
          {/* GA4 Section */}
          <div className="panel-title" style={{marginTop:12}}>
            <div><strong>Google Analytics 4</strong><div className="muted">User acquisition</div></div>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <RangeDropdown value={ga4RangeBySite[b.site.id] || range} onChange={(r)=> setGa4RangeBySite(prev=> ({ ...prev, [b.site.id]: r }))} />
              <button className="btn secondary" onClick={()=> summarize('ga4', b)} disabled={aiBusy===`${b.site.id}:ga4`}>{aiBusy===`${b.site.id}:ga4`? 'Summarizing…':'AI Summary'}</button>
              {b.integ.ga4Property && <a className="btn secondary" href={ga4Link(b.integ.ga4Property)} target="_blank" rel="noreferrer">Open in GA4</a>}
            </div>
          </div>
          <div className="card" style={{marginTop:8}}>
            <div className="panel-title"><strong>Acquisition Channels</strong></div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12}}>
              {['Organic Search','Paid Search','Direct'].map((k)=> (
                <div key={k} className="kpi-tile"><div><div className="value">{fmtNum(b.ga4.channels[k]||0)}</div><div className="muted">{k} Sessions</div></div></div>
              ))}
              <div className="kpi-tile"><div><div className="value">{fmtNum(b.ga4.sessions||0)}</div><div className="muted">All Sessions</div></div></div>
            </div>
          </div>
        </div>
      ))}

      {/* AI Summary modal */}
      <Modal open={aiOpen} onClose={()=>{ setAiOpen(false); setAiText('') }}>
        <h3 style={{marginTop:0}}>AI Summary</h3>
        <div className="card" style={{whiteSpace:'pre-wrap'}}>{aiText || 'No summary'}</div>
        <div className="actions">
          <button className="btn secondary" onClick={()=>{ navigator.clipboard?.writeText(aiText||'') }}>Copy</button>
          <button className="btn" onClick={()=>{ setAiOpen(false); setAiText('') }}>Close</button>
        </div>
      </Modal>

      {/* Query modal */}
      <Modal open={!!queryModal} onClose={()=>{ setQueryModal(null); setQueryDetails(null) }} fullscreen>
        {queryModal && (
          <div>
            <div className="panel-title"><strong>Query Insights</strong><div className="muted">{queryModal.term}</div></div>
            <QueryDetails siteId={queryModal.siteId} term={queryModal.term} range={gscRangeBySite[queryModal.siteId] || range} data={queryDetails} setData={setQueryDetails} gscSite={loadInteg(queryModal.siteId).gscSite}/>
          </div>
        )}
      </Modal>
    </>
  )
}

function QueryDetails({ siteId, term, range, data, setData, gscSite }:{ siteId:string, term:string, range:DateRange, data:any, setData:(x:any)=>void, gscSite?:string }){
  const [loading, setLoading] = useState(false)
  const fmtDate = (d:Date)=> d.toISOString().slice(0,10)
  const qs = (p:any)=> Object.entries(p).map(([k,v])=>`${k}=${encodeURIComponent(String(v))}`).join('&')
  const [showClicks, setShowClicks] = useState(true)
  const [showImpr, setShowImpr] = useState(true)
  const [showPos, setShowPos] = useState(true)
  const [qRange, setQRange] = useState<DateRange>(range)
  useEffect(()=>{ setQRange(range) }, [range.from, range.to])
  const setLastDays=(days:number)=>{ const y=new Date(); y.setDate(y.getDate()-1); const from=new Date(y.getTime()-(days-1)*86400000); setQRange({ from, to:y }) }
  useEffect(()=>{
    (async()=>{
      setLoading(true)
      try{
        const tr = await fetch(`/api/google/gsc/query-trend?${qs({ site:gscSite, start: fmtDate(qRange.from), end: fmtDate(qRange.to), query: term })}`)
        const tj = await tr.json()
        const rows:any[] = tj.rows||[]
        const trend = rows.map(r=> ({ date: r.keys?.[0], clicks: r.clicks||0, impressions: r.impressions||0, position: Math.round((r.position||0)*10)/10 }))
        const pr = await fetch(`/api/google/gsc/query-pages?${qs({ site:gscSite, start: fmtDate(qRange.from), end: fmtDate(qRange.to), query: term, rowLimit: 1000 })}`)
        const pj = await pr.json()
        const pages = (pj.rows||[]).map((r:any)=> ({ url: r.keys?.[0], clicks: r.clicks||0, impressions: r.impressions||0 }))
        setData({ trend, pages })
      }finally{ setLoading(false) }
    })()
  }, [siteId, term, qRange.from, qRange.to, gscSite])

  return (
    <div>
      {loading && <div className="muted">Loading…</div>}
      {data && (
        <div>
          <div className="panel-title" style={{marginTop:0}}>
            <div><strong>Performance Trend</strong><div className="muted">Toggle metrics and quick-select time period</div></div>
            <div style={{display:'flex', gap:10, alignItems:'center'}}>
              <div className="picker" style={{gap:6}}>
                <button className="btn secondary" style={{height:28, padding:'0 10px', background: (Math.round((qRange.to.getTime()-qRange.from.getTime())/86400000)+1)===30? '#1a1a33':'transparent'}} onClick={()=>setLastDays(30)}>1 mo</button>
                <button className="btn secondary" style={{height:28, padding:'0 10px', background: (Math.round((qRange.to.getTime()-qRange.from.getTime())/86400000)+1)===90? '#1a1a33':'transparent'}} onClick={()=>setLastDays(90)}>3 mo</button>
                <button className="btn secondary" style={{height:28, padding:'0 10px', background: (Math.round((qRange.to.getTime()-qRange.from.getTime())/86400000)+1)===180? '#1a1a33':'transparent'}} onClick={()=>setLastDays(180)}>6 mo</button>
              </div>
              <label className="muted" style={{color: showClicks? '#a78bfa': undefined}}><input type="checkbox" checked={showClicks} onChange={e=>setShowClicks(e.target.checked)} /> Clicks</label>
              <label className="muted" style={{color: showImpr? '#22c55e': undefined}}><input type="checkbox" checked={showImpr} onChange={e=>setShowImpr(e.target.checked)} /> Impressions</label>
              <label className="muted" style={{color: showPos? '#fbbf24': undefined}}><input type="checkbox" checked={showPos} onChange={e=>setShowPos(e.target.checked)} /> Avg Position</label>
            </div>
          </div>
          <div className="split">
            <QueryTrendChart series={data.trend} show={{ clicks: showClicks, impressions: showImpr, position: showPos }} />
            <div className="card" style={{maxHeight:'60vh', overflow:'auto'}}>
              <div className="panel-title"><strong>Ranking Pages</strong></div>
              <div className="table" style={{display:'grid', gap:8}}>
                <div style={{display:'grid', gridTemplateColumns:'1fr 120px 120px', gap:8, padding:'6px 8px'}}>
                  <div className="muted" style={{fontSize:12, textTransform:'uppercase', letterSpacing:'.04em'}}>Page</div>
                  <div className="muted" style={{fontSize:12, textTransform:'uppercase', letterSpacing:'.04em', textAlign:'center'}}>Impressions</div>
                  <div className="muted" style={{fontSize:12, textTransform:'uppercase', letterSpacing:'.04em', textAlign:'center'}}>Clicks</div>
                </div>
                {data.pages.map((p:any,i:number)=> (
                  <div key={i} style={{display:'grid', gridTemplateColumns:'1fr 120px 120px', gap:8, alignItems:'center'}}>
                    <a href={p.url} target="_blank" rel="noreferrer" style={{color:'#93c5fd', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={p.url}>{p.url}</a>
                    <div style={{textAlign:'center'}}>{p.impressions}</div>
                    <div style={{textAlign:'center'}}>{p.clicks}</div>
                  </div>
                ))}
                {(!data.pages || data.pages.length===0) && <div className="muted">No pages for this query</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QueryTrendChart({ series, show }:{ series: Array<{date:string, clicks:number, impressions:number, position:number}>, show?: { clicks?:boolean, impressions?:boolean, position?:boolean } }){
  const wrapRef = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<number|null>(null)
  const [dims, setDims] = useState<{w:number,h:number}>({w:0,h:0})

  useEffect(()=>{
    const el = wrapRef.current
    if(!el) return
    let ro: any = null
    const Rz = (typeof window !== 'undefined') ? (window as any).ResizeObserver : undefined
    if(typeof Rz !== 'undefined'){
      ro = new Rz((entries: any[]) => {
        const r = entries[0]?.contentRect
        if(r){ setDims({ w: Math.floor(r.width), h: Math.floor(r.height) }) }
      })
      try{ ro.observe(el) }catch{}
    }
    // initial measurement
    try{ const rect = el.getBoundingClientRect(); setDims({ w: Math.floor(rect.width), h: Math.floor(rect.height) }) }catch{}
    return ()=>{ try{ ro && ro.disconnect() }catch{} }
  }, [])

  useEffect(()=>{
    const cnv = ref.current; if(!cnv) return
    // set canvas to container size
    const pad = 34
    const cw = Math.max(320, dims.w - 0)
    const ch = Math.max(220, dims.h - 80)
    cnv.width = cw
    cnv.height = ch
    const ctx = cnv.getContext('2d')!
    const w = cnv.width, h = cnv.height
    ctx.clearRect(0,0,w,h)
    // grid
    ctx.strokeStyle = '#232343'; ctx.lineWidth = 1
    for(let i=0;i<5;i++){ const y = pad + (i*(h-pad*2))/4; ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke() }
    const xs=(i:number)=> pad + (i*(w-pad*2))/Math.max(1, series.length-1)
    const drawSmooth=(vals:number[], color:string, min:number, max:number, opts?:{fill?:boolean, dashed?:boolean})=>{
      ctx.lineWidth=2
      const val=(v:number)=> h-pad - ((v-min)/Math.max(1,(max-min)))*(h-pad*2)
      if(opts?.fill){
        const grad = ctx.createLinearGradient(0,pad,0,h-pad)
        grad.addColorStop(0, color+'55'); grad.addColorStop(1, '#0b0b16')
        ctx.fillStyle=grad
        ctx.beginPath()
        for(let i=0;i<vals.length;i++){
          const x=xs(i), y=val(vals[i])
          if(i===0) ctx.moveTo(x,y); else { const px=xs(i-1), py=val(vals[i-1]); const mx=(px+x)/2, my=(py+y)/2; ctx.quadraticCurveTo(px,py,mx,my) }
        }
        ctx.lineTo(w-pad,h-pad); ctx.lineTo(pad,h-pad); ctx.closePath(); ctx.fill()
      }
      ctx.beginPath(); ctx.strokeStyle=color; if(opts?.dashed) ctx.setLineDash([6,4])
      for(let i=0;i<vals.length;i++){
        const x=xs(i), y=val(vals[i])
        if(i===0) ctx.moveTo(x,y); else { const px=xs(i-1), py=val(vals[i-1]); const mx=(px+x)/2, my=(py+y)/2; ctx.quadraticCurveTo(px,py,mx,my) }
      }
      ctx.stroke(); ctx.setLineDash([])
      // markers
      for(let i=0;i<vals.length;i++){ const x=xs(i), y=val(vals[i]); ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.stroke() }
    }
    if(!Array.isArray(series) || series.length===0) return
    const flags = { clicks: show?.clicks ?? true, impressions: show?.impressions ?? true, position: show?.position ?? true }
    const clicks = series.map(s=>Number(s.clicks||0))
    const impr = series.map(s=>Number(s.impressions||0))
    const pos = series.map(s=>Number(s.position||0))
    if(flags.clicks){ const minC=Math.min(...clicks), maxC=Math.max(...clicks); drawSmooth(clicks,'#a78bfa',minC,maxC,{fill:true}) }
    if(flags.impressions){ const minI=Math.min(...impr), maxI=Math.max(...impr); drawSmooth(impr,'#22c55e',minI,maxI) }
    if(flags.position){ const minP=Math.min(...pos), maxP=Math.max(...pos); drawSmooth(pos,'#fbbf24',minP,maxP,{dashed:true}) }

    // X-axis dates
    ctx.fillStyle = '#a3a6c2'; ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto'; ctx.textAlign='center'
    const n = series.length
    if(n>0){ const target=8; const step=Math.max(1, Math.round(n/target)); for(let i=0;i<n;i+=step){ const x=xs(i); ctx.fillText(series[i].date, x, h-6) } }
  }, [series, show, dims.w, dims.h])

  const onMove=(e: React.MouseEvent<HTMLCanvasElement>)=>{
    const rect = e.currentTarget.getBoundingClientRect(); const x=e.clientX-rect.left; const w=e.currentTarget.width; const pad=34; const step=(w-pad*2)/Math.max(1,series.length-1); let idx=Math.round((x-pad)/step); if(idx<0) idx=0; if(idx>series.length-1) idx=series.length-1; setHover(idx)
  }
  return (
    <div className="card">
      <div className="chart" ref={wrapRef} style={{height:'60vh', position:'relative'}}>
        <canvas ref={ref} onMouseMove={onMove} onMouseLeave={()=>setHover(null)} />
        {hover!==null && series[hover] && (
          <>
            <div style={{position:'absolute', inset:0, pointerEvents:'none'}}>
              <div style={{position:'absolute', top:0, bottom:0, left:`calc(34px + ${(hover/(Math.max(1,series.length-1)))*100}% )`, width:0, borderLeft:'1px dashed #3b3b5e'}}/>
            </div>
            <div style={{position:'absolute', top:12, left:`calc(34px + ${(hover/(Math.max(1,series.length-1)))*100}% - 120px)`, background:'#141428', border:'1px solid #2b2b47', borderRadius:8, padding:'8px 10px', width:240, pointerEvents:'none'}}>
              <div style={{fontWeight:700, marginBottom:4}}>{series[hover].date}</div>
              <div>Clicks: <strong>{series[hover].clicks}</strong></div>
              <div>Impressions: <strong>{series[hover].impressions}</strong></div>
              <div>Avg Pos: <strong>{series[hover].position.toFixed(1)}</strong></div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
