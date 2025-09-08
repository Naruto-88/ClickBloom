"use client"
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import WebsitePicker from '@/components/dashboard/WebsitePicker'
import RangeDropdown, { DateRange } from '@/components/ui/RangeDropdown'
import KpiCard from '@/components/dashboard/KpiCard'
import Modal from '@/components/ui/Modal'

type Point = { date: string, clicks: number, impressions: number, ctr: number, position: number }

function activeSite(){ return localStorage.getItem('activeWebsiteId') || undefined }
function gscSiteUrl(id?:string){ if(!id) return undefined; try{ return JSON.parse(localStorage.getItem('integrations:'+id)||'{}').gscSite as string|undefined }catch{ return undefined } }
function fromB64(s:string){ try{ return atob(s) }catch{ return decodeURIComponent(s) } }
function capitalize(s:string){ return s? s.charAt(0).toUpperCase()+s.slice(1) : s }
function trimBrand(t:string){ if(!t) return ''; const parts=t.split('|').map(s=>s.trim()); return parts[parts.length-1] || t }

export default function PageClient(){
  const params = useSearchParams(); const router = useRouter()
  const u = params?.get('u') || ''
  const url = useMemo(()=> u? fromB64(u) : '', [u])
  const [range, setRange] = useState<DateRange>(()=>{ const y=new Date(); y.setDate(y.getDate()-1); const s=new Date(y); s.setDate(y.getDate()-27); return { from:s,to:y } })
  const [points, setPoints] = useState<Point[]>([])
  const [scan, setScan] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [applied, setApplied] = useState<{ title?: string, description?: string, canonical?: string }|null>(null)
  const [activeTab, setActiveTab] = useState<'title'|'description'|'image'|'schema'>('title')
  const [queries, setQueries] = useState<Array<{ query: string, clicks: number, impressions: number, ctr: number, position: number }>>([])
  const [ideas, setIdeas] = useState<string[]>([])
  const [showIdeas, setShowIdeas] = useState(false)
  const [mainKw, setMainKw] = useState("")
  const [proposedMeta, setProposedMeta] = useState<string>("")
  const [proposedSchema, setProposedSchema] = useState<string>("")
  const [metaEdited, setMetaEdited] = useState(false)
  const [schemaEdited, setSchemaEdited] = useState(false)
  const [keepEdits, setKeepEdits] = useState(true)
  const [metaBusy, setMetaBusy] = useState(false)
  const [schemaBusy, setSchemaBusy] = useState(false)
  const [imgBusy, setImgBusy] = useState<Record<string, boolean>>({})
  const [imgAlts, setImgAlts] = useState<Record<string,string>>({})
  const [imgKw, setImgKw] = useState<Record<string,string>>({})
  const [imgApplied, setImgApplied] = useState<Record<string, boolean>>({})
  const [imgVariant, setImgVariant] = useState<Record<string, number>>({})
  const [bulkBusy, setBulkBusy] = useState<'gen'|'apply'|'genapply'|null>(null)
  const [bulkKw, setBulkKw] = useState("")
  const [pageBusy, setPageBusy] = useState(false)
  const [wpPostId, setWpPostId] = useState<string>("")
  const [integrationsChanged, setIntegrationsChanged] = useState(0)
  const [qcOpen, setQcOpen] = useState(false)
  const [qcEndpoint, setQcEndpoint] = useState('')
  const [qcToken, setQcToken] = useState('')
  const [qcBusy, setQcBusy] = useState<'save'|'test'|null>(null)

  const siteId = activeSite(); const siteUrl = gscSiteUrl(siteId)
  const fmt = (d:Date)=> d.toISOString().slice(0,10)
  const qs = (p:any)=> Object.entries(p).map(([k,v])=>`${k}=${encodeURIComponent(String(v))}`).join('&')

  const loadTrend = async ()=>{
    if(!siteUrl || !url) return
    setLoading(true)
    try{
      let start = new Date(range.from); let end = new Date(range.to)
      const y = new Date(); y.setDate(y.getDate()-1)
      if(end>y) end = y
      const res = await fetch(`/api/google/gsc/page?${qs({ site: siteUrl, page: url, start: fmt(start), end: fmt(end), dimension: 'date', rowLimit: 10000 })}`)
      let data: any = {}
      if(!res.ok){
        const txt = await res.text().catch(()=> '')
        console.warn('GSC date fetch error', res.status, txt)
        setPoints([]); return
      }
      try{ data = await res.json() }catch{
        const txt = await res.text().catch(()=> '')
        console.warn('GSC date non-JSON', txt)
        data = {}
      }
      const rows: any[] = data.rows || []
      const pts: Point[] = rows.map(r=> ({ date: r.keys?.[0], clicks: r.clicks||0, impressions: r.impressions||0, ctr: Math.round((r.ctr||0)*1000)/10, position: Math.round((r.position||0)*10)/10 }))
      setPoints(pts)
    }finally{ setLoading(false) }
  }

  const runScan = async ()=>{
    if(!url) return
    const res = await fetch('/api/optimize/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ url }) })
    const out = await res.json(); setScan(out?.data || null)
  }

  const loadQueries = async ()=>{
    if(!siteUrl || !url) return
    let start = new Date(range.from); let end = new Date(range.to)
    const y = new Date(); y.setDate(y.getDate()-1)
    if(end>y) end = y
    const res = await fetch(`/api/google/gsc/page?${qs({ site: siteUrl, page: url, start: fmt(start), end: fmt(end), dimension: 'query', rowLimit: 100 })}`)
    let data: any = {}
    if(!res.ok){ const txt = await res.text().catch(()=> ''); console.warn('GSC query fetch error', res.status, txt); setQueries([]); return }
    try{ data = await res.json() }catch{ const txt = await res.text().catch(()=> ''); console.warn('GSC query non-JSON', txt); data = {} }
    const rows: any[] = data.rows || []
    const list = rows.map(r=> ({
      query: r.keys?.[0] || '',
      clicks: r.clicks||0,
      impressions: r.impressions||0,
      ctr: Math.round((r.ctr||0)*1000)/10,
      position: Math.round((r.position||0)*10)/10
    }))
    setQueries(list)
  }

  useEffect(()=>{ loadTrend(); loadQueries() }, [siteUrl, url, range.from, range.to])
  useEffect(()=>{ runScan() }, [url])
  useEffect(()=>{ if(siteId && url){ const a = localStorage.getItem(`apply:${siteId}:${url}`); if(a) setApplied(JSON.parse(a)) } }, [siteId, url])

  // live Apply/Revert implemented later in file

  const sum = (k:keyof Point)=> points.reduce((a,p)=> a + (p[k] as any || 0), 0)
  const avg = (k:keyof Point)=> points.length? Math.round(points.reduce((a,p)=> a + (p[k] as any || 0), 0)/points.length*10)/10 : 0

  const titleIdeas = useMemo(()=>{
    const base = scan?.details?.title || ''
    const topQueries = queries.slice(0,5).map(q=>q.query)
    const uniq = Array.from(new Set(topQueries))
    const ideas: string[] = []
    if(uniq[0]) ideas.push(`${capitalize(uniq[0])} | ${trimBrand(base)}`.trim())
    if(uniq[1]) ideas.push(`${capitalize(uniq[1])} ${uniq[2]? '| '+capitalize(uniq[2]) : ''} | ${trimBrand(base)}`.trim())
    if(base) ideas.push(`${base} ${new Date().getFullYear()}`.trim())
    return ideas.filter(Boolean)
  }, [scan?.details?.title, queries])

  const estimateLift = (t: string) => {
    const len = (t||'').trim().length
    let lift = 0
    if(len>=50 && len<=60) lift += 15
    else if(len>=40 && len<=65) lift += 8
    else lift -= 10
    return lift
  }

  const getWpConfig = () => {
    try{
      if(siteId){
        const integ = JSON.parse(localStorage.getItem('integrations:'+siteId)||'{}')
        if(integ.wpEndpoint && integ.wpToken){ return { endpoint: integ.wpEndpoint as string, token: integ.wpToken as string } }
      }
      // Fallback: scan all integrations and use the first with endpoint+token
      for(let i=0;i<localStorage.length;i++){
        const key = localStorage.key(i) || ''
        if(key.startsWith('integrations:')){
          try{
            const obj = JSON.parse(localStorage.getItem(key)||'{}')
            if(obj.wpEndpoint && obj.wpToken){ return { endpoint: obj.wpEndpoint as string, token: obj.wpToken as string } }
          }catch{}
        }
      }
    }catch{}
    const endpoint = localStorage.getItem('wpEndpoint')||undefined
    const token = localStorage.getItem('wpToken')||undefined
    return endpoint && token ? { endpoint, token } : null
  }

  // Load saved postId for this page/site
  useEffect(()=>{
    try{
      if(siteId && url){
        const k = `wpPostId:${siteId}:${url}`
        const v = localStorage.getItem(k)||''
        setWpPostId(v)
      }
    }catch{}
  }, [siteId, url])

  // Helper to open Quick Connect prefilled with current values
  const openQuickConnect = () => {
    const cfg = getWpConfig()
    setQcEndpoint(cfg?.endpoint || '')
    setQcToken(cfg?.token || '')
    setQcOpen(true)
  }

  const saveQuickConnect = () => {
    if(!qcEndpoint || !qcToken){ alert('Please enter both Endpoint and License Key'); return }
    if(!siteId){ alert('Select a website first'); return }
    try{
      const key = 'integrations:'+siteId
      const obj = JSON.parse(localStorage.getItem(key)||'{}')
      obj.wpEndpoint = qcEndpoint
      obj.wpToken = qcToken
      localStorage.setItem(key, JSON.stringify(obj))
      setIntegrationsChanged(x=>x+1)
      alert('Saved WordPress integration for this site')
      setQcOpen(false)
    }catch(e:any){ alert(e?.message||'Failed to save integration') }
  }

  const testConnection = async (ep?: string, tok?: string) => {
    try{
      setQcBusy('test')
      const cfg = ep && tok ? { endpoint: ep, token: tok } : getWpConfig()
      if(!cfg){ alert('No WordPress integration configured'); return }
      const r = await fetch('/api/integrations/wp/test', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ endpoint: cfg.endpoint, token: cfg.token, testUrl: url }) })
      const out = await r.json().catch(()=>null)
      if(out?.ok){ alert(`Connection OK: ${out.message||out.status}`) } else { alert(`Connection failed: ${out?.error||out?.status||'unknown'}`) }
    }finally{ setQcBusy(null) }
  }

  const applyToSite = async (title: string) => {
    const cfg = getWpConfig()
    if(!cfg){
      setApplied({ title, description: scan?.details?.meta, canonical: scan?.details?.canonical })
      if(siteId) localStorage.setItem(`apply:${siteId}:${url}`, JSON.stringify({ title, description: scan?.details?.meta, canonical: scan?.details?.canonical }))
      alert('Applied locally. To push to your website, add your WordPress endpoint and token in integrations.')
      return
    }
    try{
      const res = await fetch('/api/optimize/apply-title', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ endpoint: cfg.endpoint, token: cfg.token, pageUrl: url, title, postId: (Number(wpPostId)>0? Number(wpPostId): undefined) }) })
      const out = await res.json()
      if(!out?.ok){ alert(out?.error || 'Failed to apply on site'); return }
      setApplied({ title, description: scan?.details?.meta, canonical: scan?.details?.canonical })
      if(siteId) localStorage.setItem(`apply:${siteId}:${url}`, JSON.stringify({ title, description: scan?.details?.meta, canonical: scan?.details?.canonical }))
    }catch(e:any){ alert(e?.message || 'Failed to apply') }
  }

  const revertOnSite = async () => {
    const original = scan?.details?.title || ''
    if(!original){ revertChanges(); return }
    const cfg = getWpConfig()
    if(!cfg){ revertChanges(); return }
    try{
      const res = await fetch('/api/optimize/apply-title', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ endpoint: cfg.endpoint, token: cfg.token, pageUrl: url, title: original, postId: (Number(wpPostId)>0? Number(wpPostId): undefined) }) })
      await res.json().catch(()=>null)
    }catch{}
    revertChanges()
  }

  const applyMeta = async (desc: string) => {
    const cfg = getWpConfig(); if(!cfg) { alert('Add WordPress endpoint + key in Websites > WordPress Integration'); return }
    const res = await fetch('/api/optimize/apply', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ endpoint: cfg.endpoint, token: cfg.token, pageUrl: url, description: desc, postId: (Number(wpPostId)>0? Number(wpPostId): undefined) }) })
    const out = await res.json(); if(!out?.ok){ alert(out?.error||'Apply failed') } else { setApplied(prev=> ({ ...(prev||{}), description: desc })) }
  }
  const applySchema = async (schema: string) => {
    const cfg = getWpConfig(); if(!cfg){ alert('Add WordPress endpoint + key'); return }
    const res = await fetch('/api/optimize/apply', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ endpoint: cfg.endpoint, token: cfg.token, pageUrl: url, schema, postId: (Number(wpPostId)>0? Number(wpPostId): undefined) }) })
    const out = await res.json(); if(!out?.ok){ alert(out?.error||'Apply failed') } else { /* ok */ }
  }
  const applyImages = async (pairs: Array<{src:string, alt:string}>, markApplied: boolean = true) => {
    const cfg = getWpConfig(); if(!cfg){ alert('Add WordPress endpoint + key'); return }
    const res = await fetch('/api/optimize/apply', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ endpoint: cfg.endpoint, token: cfg.token, pageUrl: url, images: pairs, postId: (Number(wpPostId)>0? Number(wpPostId): undefined) }) })
    const out = await res.json(); if(!out?.ok){ alert(out?.error||'Apply failed') } else {
      setImgApplied(prev => { const next = { ...prev }; for(const p of pairs){ next[p.src] = markApplied } return next })
    }
  }

  const generateAltOnce = async (abs: string, kw?: string, variant?: number) => {
    const r = await fetch('/api/ai/image-alt', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ images:[abs], keywords: kw? [kw]: [], variant }) })
    const out = await r.json(); return out?.alts?.[abs] as string|undefined
  }

  const generateAltSmart = async (abs: string, current?: string, kw?: string) => {
    // try up to 3 variants until alt differs from current and non-empty
    for(let i=1;i<=3;i++){
      const text = await generateAltOnce(abs, kw, (imgVariant[abs]||0)+i)
      if(text && text.trim() && text.trim()!==current){
        setImgVariant(prev=> ({...prev, [abs]: (prev[abs]||0)+i }))
        return text
      }
    }
    return ''
  }

  const applyChanges = async () => {
    if(!scan) return
    const cfg = getWpConfig()
    if(!cfg){
      alert('Applied locally. To push to your website, add your WordPress endpoint and token in Websites → WordPress Integration.')
      const payload = { title: scan.details?.title, description: scan.details?.meta, canonical: scan.details?.canonical }
      setApplied(payload); if(siteId) localStorage.setItem(`apply:${siteId}:${url}`, JSON.stringify(payload))
      return
    }
    try{
      setPageBusy(true)
      const body: any = {
        endpoint: cfg.endpoint,
        token: cfg.token,
        pageUrl: url,
        title: (applied?.title || scan.details?.title) || undefined,
        description: (proposedMeta || scan.details?.meta) || undefined,
        canonical: scan.details?.canonical || undefined,
        postId: (Number(wpPostId)>0? Number(wpPostId) : undefined)
      }
      const res = await fetch('/api/optimize/apply', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
      const out = await res.json().catch(()=>null)
      if(!out?.ok){ alert(out?.error || 'Apply failed') }
      else {
        setApplied({ title: body.title, description: body.description, canonical: body.canonical })
        if(siteId) localStorage.setItem(`apply:${siteId}:${url}`, JSON.stringify({ title: body.title, description: body.description, canonical: body.canonical }))
      }
    }finally{ setPageBusy(false) }
  }

  const revertChanges = async () => {
    if(!scan) return
    const cfg = getWpConfig()
    if(!cfg){ setApplied(null); if(siteId) localStorage.removeItem(`apply:${siteId}:${url}`); return }
    try{
      setPageBusy(true)
      const body: any = {
        endpoint: cfg.endpoint,
        token: cfg.token,
        pageUrl: url,
        title: scan.details?.title || undefined,
        description: scan.details?.meta || undefined,
        canonical: scan.details?.canonical || undefined,
        postId: (Number(wpPostId)>0? Number(wpPostId) : undefined)
      }
      const res = await fetch('/api/optimize/apply', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
      await res.json().catch(()=>null)
      setApplied(null); if(siteId) localStorage.removeItem(`apply:${siteId}:${url}`)
    }finally{ setPageBusy(false) }
  }

  return (
    <>
      {/* Quick Connect banner when no integration */}
      {!getWpConfig() && (
        <div className="card" style={{border:'1px dashed #eab308', background:'#141427', marginBottom:12}}>
          <div className="panel-title"><strong>WordPress Not Connected</strong></div>
          <div className="muted">To apply changes live, add your WordPress endpoint and license key for this site.</div>
          <div className="actions" style={{justifyContent:'flex-start'}}>
            <button className="btn" onClick={openQuickConnect}>Quick Connect</button>
            <button className="btn secondary" onClick={()=>testConnection()}>Test Now</button>
            <a className="btn secondary" href="/websites">Go to Websites → WordPress Integration</a>
          </div>
        </div>
      )}
      <div className="page-topbar"><WebsitePicker/></div>
      <div className="page-header">
        <h2 style={{margin:0}}>Page SEO Optimization</h2>
        <div className="breadcrumb">Home - <strong>Page SEO Optimization</strong></div>
        <div style={{marginLeft:'auto'}}>
          <RangeDropdown value={range} onChange={setRange}/>
        </div>
      </div>

      <section className="grid" style={{gridTemplateColumns:'repeat(4,1fr)', marginBottom:16}}>
        <KpiCard title="Clicks" current={sum('clicks')} previous={0} format={(n)=>String(n)} color="#a78bfa" series={points.map(p=>p.clicks)} />
        <KpiCard title="Impressions" current={sum('impressions')} previous={0} format={(n)=>String(n)} color="#22d3ee" series={points.map(p=>p.impressions)} />
        <KpiCard title="CTR" current={points.length? (sum('clicks')/Math.max(1,sum('impressions'))*100):0} previous={0} format={(n)=>`${n.toFixed(1)}%`} color="#fbbf24" series={points.map(p=>p.ctr)} />
        <KpiCard title="Avg. Position" current={avg('position')} previous={0} format={(n)=>n.toFixed(1)} color="#22c55e" invert series={points.map(p=>p.position)} />
      </section>

      <section className="grid" style={{gridTemplateColumns:'1fr .8fr', marginBottom:16}}>
        <div className="card">
          <div className="panel-title"><strong>Page Card</strong><div className="muted">Optimize your page title and description</div></div>
          <div className="form-grid">
            <label>Page URL</label>
            <input className="input" value={url} readOnly/>
            <label>Page Original Title</label>
            <input className="input" value={scan?.details?.title || ''} readOnly/>
            <label>Page Original Description</label>
            <textarea className="textarea" value={scan?.details?.meta || ''} readOnly/>
            <label>WordPress Post ID (optional)</label>
            <input className="input" value={wpPostId} onChange={e=>{ setWpPostId(e.target.value); try{ if(siteId && url){ localStorage.setItem(`wpPostId:${siteId}:${url}`, e.target.value) } }catch{} }} placeholder="e.g., 123"/>
          </div>
          <div className="actions">
            <button className="btn secondary" onClick={runScan}>Recrawl</button>
            <button className="btn secondary" onClick={()=>testConnection()} title="Test WordPress Connection">Test Now</button>
            {!applied && <button className="btn" onClick={applyChanges}>{pageBusy? <span className="spinner"/> : 'Apply'}</button>}
            {applied && <button className="btn secondary" onClick={revertChanges}>{pageBusy? <span className="spinner"/> : 'Revert'}</button>}
          </div>
        </div>
        <div className="card">
          <div className="panel-title"><strong>Page Health Score</strong><span className="badge">Optimize Your Page Health Score</span></div>
          <div style={{display:'grid', gridTemplateColumns:'240px 1fr', gap:16, alignItems:'center'}}>
            <Donut value={Number(scan?.healthScore||0)} />
            <div className="health-list">
              {(scan?.issues||[]).map((i:any)=> (
                <div key={i.id} className={`hl-item ${i.status==='ISSUE'?'bad':'ok'}`}>
                  <span className="hl-icon" aria-hidden>{i.status==='ISSUE'?'✖':'✔'}</span>
                  <span>{i.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="actions" style={{marginTop:16}}>
            <button className="btn" style={{width:'100%'}} onClick={()=>router.push(`/optimize/page?u=${encodeURIComponent(u)}`)}>Auto Optimize</button>
          </div>
        </div>
      </section>

      <section className="grid" style={{gridTemplateColumns:'1.1fr .9fr', gap:16}}>
        <div className="card">
          <div className="panel-title">
            <div><strong>Page SEO Optimization</strong><div className="muted">Let's Improve Your Page Organic Traffic</div></div>
            <button className="btn secondary" style={{height:32}}>Activity Log</button>
          </div>
          <div className="opt-tabs">
            <button className={`opt-tab ${activeTab==='title'?'active':''}`} onClick={()=>setActiveTab('title')}>
              <div className="opt-icon">🏷️</div>
              <div>Title Tag</div>
            </button>
            <button className={`opt-tab ${activeTab==='description'?'active':''}`} onClick={()=>setActiveTab('description')}>
              <div className="opt-icon">≡</div>
              <div>Description</div>
            </button>
            <button className={`opt-tab ${activeTab==='image'?'active':''}`} onClick={()=>setActiveTab('image')}>
              <div className="opt-icon">🖼️</div>
              <div>Image Alt</div>
            </button>
            <button className={`opt-tab ${activeTab==='schema'?'active':''}`} onClick={()=>setActiveTab('schema')}>
              <div className="opt-icon">{`{}`}</div>
              <div>Schema</div>
            </button>
          </div>

          {/* Pitch (content depends on tab) */}
          <div className="pitch-card">
            {activeTab==='title' && (<>
              Optimize your titles effortlessly with ClickBloom. Our AI analyzes your top‑performing keywords from Google Search Console and suggests data‑driven, SEO‑friendly titles that increase visibility and boost your click‑through rates.
            </>)}
            {activeTab==='description' && (<>
              Enhance your meta descriptions with precision. ClickBloom reviews your Google Search Console data, identifying top keywords and crafting compelling, SEO‑friendly meta descriptions that drive clicks and boost your search rankings.
            </>)}
            {activeTab==='image' && (<>
              Optimize your images for search effortlessly. ClickBloom uses AI to analyze your images and automatically generate SEO‑friendly alt text and title tag based on relevant keywords from your Google Search Console data.
            </>)}
            {activeTab==='schema' && (<>
              Schema.org provides shared vocabularies that help search engines understand your pages. Use AI to generate structured data for Google, Microsoft, Yandex and Yahoo!
            </>)}
            <div style={{marginTop:6}}><a href="#" style={{textDecoration:'underline'}}>Find out more.</a></div>
          </div>

          {/* Main keyword input */}
          <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center'}}>
            <input className="input" placeholder="Main keyword (optional)" value={mainKw} onChange={e=>setMainKw(e.target.value)} />
            <button className="btn" style={{display: activeTab==='title'? 'inline-flex':'none'}} onClick={async()=>{
              try{
                const payload: any = { url }
                const kw = (mainKw||'').trim(); if(kw) payload.keywords = [kw]
                const res = await fetch('/api/ai/titles', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) })
                const out = await res.json()
                if(out?.ok){ setIdeas(out.ideas||[]); setShowIdeas(true) } else { alert(out?.error||'Failed to generate titles') }
              }catch(e:any){ alert(e?.message || 'Failed to generate') }
            }}>Auto Optimize Page Title</button>
            <button className="btn" style={{display: activeTab==='description'? 'inline-flex':'none'}} onClick={async()=>{
              try{
                setMetaBusy(true)
                const res = await fetch('/api/ai/meta', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ url, keywords: mainKw? [mainKw]: [] }) })
                const out = await res.json();
                if(out?.ok){ if(!(keepEdits && metaEdited)) setProposedMeta(out.meta); await applyMeta(out.meta) } else { alert(out?.error||'Generate failed') }
              } finally{ setMetaBusy(false) }
            }}>{metaBusy? <span className="spinner"/> : 'Auto Optimize Meta Description'}</button>
            <button className="btn" style={{display: activeTab==='schema'? 'inline-flex':'none'}} onClick={async()=>{
              try{
                setSchemaBusy(true)
                const r = await fetch('/api/ai/schema', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ url, keywords: mainKw? [mainKw]: [] }) })
                const out = await r.json(); if(out?.ok){ if(!(keepEdits && schemaEdited)) setProposedSchema(out.schema); await applySchema(out.schema) } else { alert(out?.error||'Generate failed') }
              } finally{ setSchemaBusy(false) }
            }}>{schemaBusy? <span className="spinner"/> : 'Auto Schema Markup Generation'}</button>
          </div>

          {/* Titles list */}
          {activeTab==='title' && (
            <div className="title-block" style={{marginTop:12}}>
              <div className="badge-tag">Original Title</div>
              <div className="title-card">{scan?.details?.title || '-'}</div>
            </div>
          )}
          {activeTab==='title' && showIdeas && (
            <div style={{marginTop:12}}>
              {(ideas.length? ideas : titleIdeas).slice(0,7).map((t0,i)=> {
                const t = t0 || ''
                return (
                  <div key={i} className="title-card" style={{marginTop:12, position:'relative', paddingRight:160}}>
                    <input className="input" style={{width:'100%'}} value={t} onChange={e=>{
                      const next=[...(ideas.length? ideas : titleIdeas)]; next[i]=e.target.value; setIdeas(next)
                    }} />
                    {(()=>{ const isActive = (applied?.title||'') === t; return (
                      <div style={{position:'absolute', right:10, top:10, display:'flex', gap:6}}>
                        {!isActive && <button className="btn" style={{height:36}} onClick={()=>applyToSite((ideas.length? ideas:titleIdeas)[i])}>Apply to Site</button>}
                        {isActive && <button className="btn secondary" style={{height:36}} onClick={revertOnSite}>Revert</button>}
                      </div>
                    ) })()}
                    <div style={{position:'absolute', left:10, bottom:10}}>
                      <span className={`growth-badge ${estimateLift(t)>=0? 'up':'down'}`}>{estimateLift(t)>=0? '+':''}{estimateLift(t)}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {activeTab==='description' && (
            <div style={{marginTop:12}}>
              <div className="title-block" style={{marginTop:12}}>
                <div className="badge-tag">Original Description</div>
                <div className="title-card">{scan?.details?.meta || <span className="muted">Missing</span>}</div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:10, marginTop:10}}>
                <label className="muted" style={{display:'flex', alignItems:'center', gap:6}}>
                  <input type="checkbox" checked={keepEdits} onChange={e=>setKeepEdits(e.target.checked)} /> Regenerate and keep edits
                </label>
              </div>
              {proposedMeta && (
                <div style={{marginTop:10}}>
                  <div className="badge" style={{marginBottom:6}}>Proposed Description</div>
                  <textarea className="textarea" value={proposedMeta} onChange={e=>{ setProposedMeta(e.target.value); setMetaEdited(true) }} />
                  <div className="actions"><button className="btn" onClick={()=>applyMeta(proposedMeta)}>Apply to Site</button></div>
                </div>
              )}
            </div>
          )}

          {activeTab==='image' && (
            <div style={{marginTop:12}}>
              <div className="alt-list">
                {(scan?.details?.images||[]).map((im:any, idx:number)=>{
                  const src = (im.src||''); const abs = src.startsWith('http')? src : (new URL(src, url).toString())
                  const prop = imgAlts[abs]||im.alt||''
                  const kw = imgKw[abs]||''
                  return (
                    <div key={idx} className="alt-row" style={{gridTemplateColumns:'80px 1fr 220px auto'}}>
                      <div className="alt-thumb" onClick={()=> window.open(abs, '_blank')} title="Open original">
                        <img src={abs} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                        <div className="hover">Open</div>
                      </div>
                      <input className="input" value={prop} onChange={e=> setImgAlts(prev=> ({...prev, [abs]: e.target.value})) } />
                      <input className="input" placeholder="Focus KW (optional)" value={kw} onChange={e=> setImgKw(prev=> ({...prev, [abs]: e.target.value})) } />
                      <div className="alt-actions">
                        {imgBusy[abs] ? <span className="spinner"/> : (
                          <>
                            <button className="icon-btn" title="Generate" onClick={async()=>{
                              setImgBusy(prev=> ({...prev, [abs]: true}))
                              try{
                                const kw = imgKw[abs] || bulkKw || mainKw
                                const alt = await generateAltSmart(abs, imgAlts[abs]||im.alt||'', kw)
                                if(alt) setImgAlts(prev=> ({...prev, [abs]: alt }))
                                else alert('Could not generate variation. Try again or use a focus keyword.')
                              }finally{ setImgBusy(prev=> ({...prev, [abs]: false})) }
                            }}>🤖</button>
                            <button className="icon-btn" title="Open" onClick={()=> window.open(abs, '_blank')}>🌐</button>
                            {!imgApplied[abs] && (
                              <button className="icon-btn" title="Apply" onClick={()=> applyImages([{ src: abs, alt: imgAlts[abs]||im.alt||'' }], true)}>✔</button>
                            )}
                            {imgApplied[abs] && (
                              <button className="icon-btn" title="Revert to original" onClick={async()=>{
                                await applyImages([{ src: abs, alt: im.alt||'' }], false);
                                setImgAlts(prev=> ({...prev, [abs]: im.alt||'' }))
                              }}>↩</button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="actions" style={{marginTop:10, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                <input className="input" placeholder="Focus KW for all (optional)" style={{maxWidth:260}} value={bulkKw} onChange={e=>setBulkKw(e.target.value)} />
                <button className="btn secondary" disabled={bulkBusy!==null} onClick={async()=>{
                  setBulkBusy('gen')
                  const imgs = (scan?.details?.images||[]).map((im:any)=> (im.src||'').startsWith('http')? im.src : new URL(im.src||'', url).toString())
                  // mark all rows busy
                  setImgBusy(prev=>{ const next={...prev}; imgs.forEach((s:string)=> next[s]=true); return next })
                  const kw = bulkKw || mainKw
                  const r = await fetch('/api/ai/image-alt', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ images: imgs, keywords: kw? [kw]: [] }) })
                  const out = await r.json(); if(out?.ok){ setImgAlts(out.alts||{}) } else { alert(out?.error||'Generate failed') }
                  setImgBusy(prev=>{ const next={...prev}; imgs.forEach((s:string)=> next[s]=false); return next })
                  setBulkBusy(null)
                }}>{bulkBusy==='gen'? <span className="spinner"/> : 'Generate All'}</button>
                <button className="btn" disabled={bulkBusy!==null} onClick={()=>{
                  setBulkBusy('apply')
                  const pairs = (scan?.details?.images||[]).map((im:any)=>{ const abs = (im.src||'').startsWith('http')? im.src : new URL(im.src||'', url).toString(); return { src: abs, alt: imgAlts[abs]||im.alt||'' } })
                  applyImages(pairs, true).finally(()=> setBulkBusy(null))
                }}>{bulkBusy==='apply'? <span className="spinner"/> : 'Apply All'}</button>
                <button className="btn" disabled={bulkBusy!==null} onClick={async()=>{
                  setBulkBusy('genapply')
                  const imgs = (scan?.details?.images||[]).map((im:any)=> (im.src||'').startsWith('http')? im.src : new URL(im.src||'', url).toString())
                  setImgBusy(prev=>{ const next={...prev}; imgs.forEach((s:string)=> next[s]=true); return next })
                  const kw = bulkKw || mainKw
                  const r = await fetch('/api/ai/image-alt', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ images: imgs, keywords: kw? [kw]: [] }) })
                  const out = await r.json(); if(out?.ok){ setImgAlts(out.alts||{})
                    const pairs = imgs.map((abs:string)=> ({ src: abs, alt: out.alts?.[abs]||'' }))
                    await applyImages(pairs, true)
                  } else { alert(out?.error||'Generate failed') }
                  setImgBusy(prev=>{ const next={...prev}; imgs.forEach((s:string)=> next[s]=false); return next })
                  setBulkBusy(null)
                }}>{bulkBusy==='genapply'? <span className="spinner"/> : 'Generate + Apply All'}</button>
              </div>
            </div>
          )}

          {activeTab==='schema' && (
            <div style={{marginTop:12}}>
              <div className="badge" style={{marginBottom:6}}>Existing Schema</div>
              <div className="title-card" style={{whiteSpace:'pre-wrap', overflowX:'auto', maxHeight:200}}>
                {(scan?.details?.schemas?.[0]||'None')}
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center', marginTop:10}}>
                <input className="input" placeholder="Main keyword (optional)" value={mainKw} onChange={e=>setMainKw(e.target.value)} />
                <button className="btn" onClick={async()=>{
                  const r = await fetch('/api/ai/schema', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ url, keywords: mainKw? [mainKw]: [] }) })
                  const out = await r.json(); if(out?.ok){ setProposedSchema(out.schema) } else { alert(out?.error||'Generate failed') }
                }}>Generate JSON-LD</button>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:10, marginTop:10}}>
                <label className="muted" style={{display:'flex', alignItems:'center', gap:6}}>
                  <input type="checkbox" checked={keepEdits} onChange={e=>setKeepEdits(e.target.checked)} /> Regenerate and keep edits
                </label>
              </div>
              {proposedSchema && (
                <div style={{marginTop:10}}>
                  <textarea className="textarea" value={proposedSchema} onChange={e=>{ setProposedSchema(e.target.value); setSchemaEdited(true) }} style={{minHeight:160}}/>
                  <div className="actions"><button className="btn" onClick={()=>applySchema(proposedSchema)}>Apply to Site</button></div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Queries column */}
        <div className="card">
          <div className="panel-title"><div><strong>Queries</strong><div className="muted">Page Top Queries</div></div></div>
          <div className="q-list">
            {queries.slice(0,12).map((q,i)=> (
              <div key={i} className="q-row">
                <div className="q-name">{q.query}</div>
                <div className="q-metrics">
                  <span className="q-metric" title="Clicks">● {q.clicks}</span>
                  <span className="q-metric" title="Impressions">◉ {q.impressions}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card" style={{marginTop:16}}>
        <div className="panel-title"><strong>How to Publish Changes to WordPress</strong></div>
        <div className="muted">
          To apply changes live, install a small WordPress plugin that exposes a secure endpoint to update a post/page title, meta description, and canonical. The plugin should:
          <ul>
            <li>Register a REST route e.g., <code>/wp-json/seo-tool/v1/update</code> protected by a token.</li>
            <li>Given a page URL or post ID, update post_title and add/update Yoast/RankMath meta fields.</li>
            <li>Support revert by storing a backup of previous values in post meta.</li>
          </ul>
          After installing, add the endpoint URL and token to this app (we can add a connection form), then the Apply/Revert buttons will call the site directly.
        </div>
      </section>

      {/* Quick Connect Modal (moved here from Donut to access PageClient state) */}
      <Modal open={qcOpen} onClose={()=>setQcOpen(false)}>
        <h3>Quick Connect</h3>
        <div className="form-grid" style={{gridTemplateColumns:'1fr'}}>
          <label>Endpoint URL</label>
          <input className="input" value={qcEndpoint} onChange={e=>setQcEndpoint(e.target.value)} placeholder="https://site.com/wp-json/clickbloom/v1/update" />
          <label>License Key</label>
          <input className="input" value={qcToken} onChange={e=>setQcToken(e.target.value)} placeholder="CBL-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" />
        </div>
        <div className="actions" style={{justifyContent:'space-between'}}>
          <button className="btn secondary" onClick={()=>testConnection(qcEndpoint, qcToken)} disabled={qcBusy!==null}>{qcBusy==='test'? <span className="spinner"/> : 'Test Now'}</button>
          <button className="btn" onClick={saveQuickConnect} disabled={qcBusy!==null}>{qcBusy==='save'? <span className="spinner"/> : 'Save'}</button>
        </div>
      </Modal>
    </>
  )
}

function Donut({ value }: { value: number }){
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const r = 90
  const c = 2*Math.PI*r
  const off = c * (1 - pct/100)
  return (
    <div className="donut-wrap" style={{position:'relative', width:220, height:220}}>
      <svg viewBox="0 0 220 220" width={220} height={220}>
        <defs>
          <linearGradient id="donutGrad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#8b5cf6"/>
            <stop offset="100%" stopColor="#6d28d9"/>
          </linearGradient>
        </defs>
        <circle cx="110" cy="110" r={r} fill="none" stroke="#1b1b33" strokeWidth="16" strokeLinecap="round" />
        <circle cx="110" cy="110" r={r} fill="none" stroke="url(#donutGrad)" strokeWidth="16" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={off} transform="rotate(-90 110 110)" />
      </svg>
      <div style={{position:'absolute', inset:0, display:'grid', placeItems:'center'}}>
        <div style={{fontSize:36, fontWeight:800}}>{pct}%</div>
      </div>
    </div>
  )
}
