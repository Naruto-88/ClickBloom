"use client"
import AddWebsiteModal, { Website as WebsiteType } from "@/components/dashboard/AddWebsiteModal"
import SiteSettingsModal from "@/components/dashboard/SiteSettingsModal"
import Modal from "@/components/ui/Modal"
import SelectModal from "@/components/ui/SelectModal"
import { useEffect, useMemo, useState, FormEvent } from "react"
import { signIn } from "next-auth/react"

type Integration = { gscSite?: string, gscLabel?: string, ga4Property?: string, ga4Label?: string, wpEndpoint?: string, wpToken?: string }
type Website = WebsiteType

function loadSites(): Website[]{ try{ return JSON.parse(localStorage.getItem('websites')||'[]') }catch{ return [] } }
function saveSites(list: Website[]){ localStorage.setItem('websites', JSON.stringify(list)) }
function loadIntegrations(id?: string): Integration{ if(!id) return {}; try{ return JSON.parse(localStorage.getItem('integrations:'+id)||'{}') }catch{ return {} } }
function saveIntegrations(id: string, data: Integration){ localStorage.setItem('integrations:'+id, JSON.stringify(data)) }

export default function WebsitesClient(){
  const [sites, setSites] = useState<Website[]>([])
  const [activeId, setActiveId] = useState<string|undefined>()
  const [openAdd, setOpenAdd] = useState(false)
  const [gscList, setGscList] = useState<any[]>([])
  const [ga4List, setGa4List] = useState<any[]>([])
  const [showGscModal, setShowGscModal] = useState(false)
  const [showGa4Modal, setShowGa4Modal] = useState(false)
  const [integVer, setIntegVer] = useState(0)
  const [q, setQ] = useState("")
  const [pagesCount, setPagesCount] = useState<Record<string, number>>({})
  const [openInteg, setOpenInteg] = useState(false)
  const [openSettings, setOpenSettings] = useState(false)
  const [keyInput, setKeyInput] = useState("")
  const [overrideEp, setOverrideEp] = useState("")
  const [connecting, setConnecting] = useState<'connect'|'recheck'|null>(null)
  const [localDev, setLocalDev] = useState(false)
  const [crawlBusy, setCrawlBusy] = useState(false)
  const [credits, setCredits] = useState<string>('')
  const [autoGoogle, setAutoGoogle] = useState<boolean>(()=> (localStorage.getItem('autoConnectGoogle')||'true')==='true')
  const [autoBusy, setAutoBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [fileKey, setFileKey] = useState<number>(0)

  useEffect(()=>{
    const s = loadSites(); setSites(s); const id = localStorage.getItem('activeWebsiteId') || s[0]?.id; setActiveId(id || undefined)
  },[])

  const active = useMemo(()=> sites.find(x=>x.id===activeId), [sites, activeId])
  const integ = useMemo(()=> loadIntegrations(activeId), [activeId, integVer])
  // AI Provider UI moved to topbar; keep integrations only for Google/WordPress.
  useEffect(()=>{ setKeyInput(integ.wpToken||''); if(integ.wpToken){
    // Load remaining credits for display
    fetch('/api/license/validate', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ key: integ.wpToken, site_url: active?.url||'' }) })
      .then(r=> r.json()).then(j=>{ const c = j?.crawl_credits; setCredits(c===undefined? 'Unlimited' : String(c)) }).catch(()=> setCredits(''))
  } else { setCredits('') }
  }, [integ.wpToken, active?.url])
  useEffect(()=>{ setKeyInput(integ.wpToken||'') }, [integ.wpToken])
  const filtered = useMemo(()=>{ const s=(q||"").toLowerCase().trim(); if(!s) return sites; return sites.filter(w=> (w.name||"").toLowerCase().includes(s) || (w.url||"").toLowerCase().includes(s)) }, [sites, q])
  const isVerified = (id: string)=>{ const i=loadIntegrations(id); return !!(i.wpEndpoint && i.wpToken) }
  const fmtDate = (n?:number)=>{ if(!n) return '—'; try{ return new Date(n).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}) }catch{ return '—' } }

  // Fetch page counts via GSC when connected
  useEffect(()=>{
    (async()=>{
      const now = new Date(); const end = new Date(now); end.setDate(end.getDate()-1); const start = new Date(end); start.setDate(end.getDate()-27)
      const fmt = (d:Date)=> d.toISOString().slice(0,10)
      for(const w of sites){
        if(pagesCount[w.id]) continue
        const integW = loadIntegrations(w.id)
        if(!integW.gscSite) continue
        try{
          const url = `/api/google/gsc/pages?site=${encodeURIComponent(integW.gscSite)}&start=${fmt(start)}&end=${fmt(end)}&rowLimit=25000`
          const res = await fetch(url)
          if(!res.ok) continue
          const data = await res.json(); const n = Array.isArray(data.rows)? data.rows.length : 0
          setPagesCount(pc=> ({ ...pc, [w.id]: n }))
        }catch{}
      }
    })()
  }, [sites])

  const addWebsite = (w: Website) => { const next = [...sites, w]; setSites(next); saveSites(next); setActiveId(w.id); setOpenAdd(false); if(autoGoogle){ setTimeout(()=> autoConnectGoogle(w.id).catch(()=>{}), 0) } }
  useEffect(()=>{ if(autoGoogle && activeId){ const integ = loadIntegrations(activeId); if(!(integ.gscSite || integ.ga4Property)) autoConnectGoogle(activeId).catch(()=>{}) } }, [activeId, autoGoogle])

  const parseImportLines = (text: string): Website[] => {
    const lines = text.split(/\r?\n/).map(l=> l.trim()).filter(Boolean)
    const out: Website[] = []
    const makeId = ()=> (typeof crypto!=='undefined' && (crypto as any).randomUUID)? (crypto as any).randomUUID() : String(Date.now()+Math.floor(Math.random()*100000))
    const ensureUrl = (s:string)=>{ const t=s.trim(); if(!t) return ''; try{ new URL(t); return t }catch{ return 'https://'+t.replace(/^https?:\/\//,'') } }
    for(const line of lines){
      const parts = line.split(':')
      if(parts.length<2) continue
      const left = parts[0].trim(); const right = parts.slice(1).join(':').trim()
      const url = ensureUrl(left); const name = right || left
      if(!url) continue
      out.push({ id: makeId(), name, url, createdAt: Date.now() })
    }
    return out
  }

  // basic CSV line splitter supporting quoted commas
  const splitCsvLine = (s: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for(let i=0;i<s.length;i++){
      const ch = s[i]
      if(ch==='"'){
        if(inQuotes && s[i+1]==='"'){ cur+='"'; i++; continue }
        inQuotes = !inQuotes; continue
      }
      if(ch===',' && !inQuotes){ out.push(cur.trim()); cur=''; continue }
      cur += ch
    }
    out.push(cur.trim())
    return out
  }

  const parseImportCsv = (text: string): Website[] => {
    const rows = text.split(/\r?\n/).map(l=> l.trim()).filter(Boolean)
    if(rows.length===0) return []
    const header = splitCsvLine(rows[0]).map(h=> h.toLowerCase())
    const urlIdx = header.findIndex(h=> h==='url' || h==='website' || h==='site')
    const nameIdx = header.findIndex(h=> h==='name' || h==='website name')
    const indIdx = header.findIndex(h=> h==='industry')
    if(urlIdx<0) return []
    const makeId = ()=> (typeof crypto!=='undefined' && (crypto as any).randomUUID)? (crypto as any).randomUUID() : String(Date.now()+Math.floor(Math.random()*100000))
    const ensureUrl = (s:string)=>{ const t=s.trim(); if(!t) return ''; try{ new URL(t); return t }catch{ return 'https://'+t.replace(/^https?:\/\//,'') } }
    const out: Website[] = []
    for(let i=1;i<rows.length;i++){
      const cells = splitCsvLine(rows[i])
      const raw = (cells[urlIdx]||'').trim(); if(!raw) continue
      const url = ensureUrl(raw)
      const name = (nameIdx>=0? (cells[nameIdx]||'').trim(): '') || url
      const industry = indIdx>=0? (cells[indIdx]||'').trim(): undefined
      out.push({ id: makeId(), name, url, industry, createdAt: Date.now() })
    }
    return out
  }

  const dedupeMerge = (curr: Website[], add: Website[]): Website[] => {
    const norm = (u:string)=>{ try{ const x=new URL(u); return x.hostname.replace(/^www\./,'')+x.pathname.replace(/\/$/,''); }catch{ return u.trim().toLowerCase() } }
    const seen = new Set(curr.map(s=> norm(s.url)))
    const merged = [...curr]
    for(const w of add){ const k=norm(w.url); if(!seen.has(k)){ merged.push(w); seen.add(k) } }
    return merged
  }

  const onImportFile = async (file: File) => {
    try{
      setImportBusy(true)
      const text = await file.text()
      const ext = (file.name.split('.').pop()||'').toLowerCase()
      const list = ext==='csv' ? parseImportCsv(text) : parseImportLines(text)
      if(list.length===0){
        alert(ext==='csv'? 'No valid rows found. Expected headers: url,name,industry' : 'No valid lines found. Expected: URL : Website Name')
        return
      }
      const next = dedupeMerge(sites, list)
      setSites(next); saveSites(next)
      // Optionally auto-connect first imported site
      if(autoGoogle){
        const newly = next.filter(n=> !sites.find(s=> s.id===n.id))
        setTimeout(()=> newly.slice(0,5).forEach(w=> autoConnectGoogle(w.id).catch(()=>{})), 0)
      }
      alert(`Imported ${list.length} site(s). ${next.length - sites.length} added, ${sites.length + list.length - next.length} skipped (duplicates).`)
    }catch(e:any){ alert(`Import failed: ${e?.message||e}`) }
    finally{ setImportBusy(false); setFileKey(k=>k+1) }
  }

  const downloadTxtTemplate = () => {
    const sample = [
      'https://example.com : Example Inc',
      'mysite.com : My Site',
    ].join('\n')
    const blob = new Blob([sample], { type:'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'websites_template.txt'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  async function autoConnectGoogle(id: string){
    const site = (sites.find(s=>s.id===id) || loadSites().find(s=>s.id===id)) as Website|undefined
    if(!site) return
    const integNow = loadIntegrations(id)
    const normHost = (u:string)=>{ try{ const h=new URL(u).hostname.toLowerCase().replace(/^www\./,''); return h }catch{ return '' } }
    const host = normHost(site.url)
    // GSC
    try{
      if(!integNow.gscSite){
        const r = await fetch('/api/google/gsc/sites'); if(r.status===401 || r.status===403){ await signIn('google', { callbackUrl:'/websites' as any, prompt:'consent' as any }); return }
        if(r.ok){
          const j = await r.json(); const items = (j.siteEntry||[]) as any[]
          // build candidate url-prefix forms (with/without www, http/https, with trailing slash)
          const hostNoWww = host.replace(/^www\./,'')
          const hostWww = hostNoWww.startsWith('www.')? hostNoWww : `www.${hostNoWww}`
          const forms = new Set<string>([
            `https://${hostNoWww}/`,`http://${hostNoWww}/`,`https://${hostWww}/`,`http://${hostWww}/`
          ])
          const norm = (s:string)=>{
            const ss = (s||'').toLowerCase()
            if(ss.startsWith('sc-domain:')) return ss
            // ensure trailing slash for url-prefix
            return ss.endsWith('/')? ss : (ss+'/')
          }
          let pick = items.find((x:any)=> forms.has(norm(x.siteUrl||'')))
          // try sc-domain apex match as fallback
          if(!pick){
            const apex = hostNoWww.split('.').slice(-2).join('.')
            pick = items.find((x:any)=> norm(x.siteUrl||'')===`sc-domain:${apex}` || norm(x.siteUrl||'')===`sc-domain:${hostNoWww}`)
          }
          // final fallback: contains host fragment
          if(!pick){ pick = items.find((x:any)=> (String(x.siteUrl||'').toLowerCase()).includes(hostNoWww)) }
          if(pick){ saveIntegrations(id, { ...integNow, gscSite: pick.siteUrl, gscLabel: `${pick.siteUrl} (${pick.permissionLevel||''})` }); setIntegVer(v=>v+1) }
        }
      }
    }catch{}
    // GA4
    try{
      const integ = loadIntegrations(id)
      if(!integ.ga4Property){
        const r = await fetch('/api/google/ga4/properties'); if(r.status===401 || r.status===403){ await signIn('google', { callbackUrl:'/websites' as any, prompt:'consent' as any }); return }
        if(r.ok){
          const j = await r.json(); const props = (j.accountSummaries||[]).flatMap((a:any)=> a.propertySummaries||[])
          let best: any = null
          // 1) Try exact match via web stream defaultUri host
          for(const p of props){
            const name = p.property || p.name
            if(!name) continue
            try{
              const s = await fetch(`/api/google/ga4/streams?property=${encodeURIComponent(name)}`)
              if(s.ok){
                const sj = await s.json()
                const streams: any[] = sj.dataStreams||[]
                const webStreams = streams.filter((ds:any)=> (ds.webStreamData?.defaultUri))
                for(const ws of webStreams){
                  const h = normHost(ws.webStreamData.defaultUri||'')
                  if(h===host){ best = { name, label: p.displayName||name }; break }
                }
                if(best) break
              }
            }catch{}
          }
          // 2) Fallback: match displayName to host or site name
          if(!best){
            const hostPlain = host.replace(/\./g,'')
            const sitePlain = (site.name||'').toLowerCase().replace(/[^a-z0-9]+/g,'')
            const matches = props.filter((p:any)=>{
              const dn = String(p.displayName||'').toLowerCase().replace(/[^a-z0-9]+/g,'')
              return dn.includes(hostPlain) || (sitePlain && dn.includes(sitePlain))
            })
            if(matches.length===1){ const p = matches[0]; best = { name: p.property || p.name, label: p.displayName || (p.property||p.name) } }
            else if(matches.length>1){
              // prefer one with exact host token in displayName
              const exact = matches.find((p:any)=> (p.displayName||'').toLowerCase().includes(host))
              if(exact){ best = { name: exact.property||exact.name, label: exact.displayName|| (exact.property||exact.name) } }
            }
          }
          // 3) Fallback: probe each property via GA4 Data API for host presence
          if(!best && props.length){
            try{
              const today = new Date(); const y=new Date(today); y.setDate(today.getDate()-1); const start=new Date(y); start.setDate(y.getDate()-27)
              const fmt=(d:Date)=> d.toISOString().slice(0,10)
              for(const p of props){
                const name = p.property || p.name
                if(!name) continue
                const r = await fetch('/api/google/ga4/report', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: name, start: fmt(start), end: fmt(y) }) })
                if(!r.ok) continue
                const j2 = await r.json(); const rows:any[] = j2.rows||[]
                const found = rows.some((row:any)=> String(row.dimensionValues?.[0]?.value||'').toLowerCase().includes(host))
                if(found){ best = { name, label: p.displayName||name }; break }
              }
            }catch{}
          }
          // 4) Fallback: only one property available
          if(!best && props.length===1){ const p = props[0]; best = { name: p.property||p.name, label: p.displayName|| (p.property||p.name) } }
          if(best){ saveIntegrations(id, { ...loadIntegrations(id), ga4Property: best.name, ga4Label: best.label }); setIntegVer(v=>v+1) }
        }
      }
    }catch{}
  }

  const connectGSC = async () => {
    try{
      const res = await fetch('/api/google/gsc/sites');
      if(res.status === 401 || res.status === 403){ await signIn('google', { callbackUrl: '/websites' as any, prompt:'consent' as any }); return }
      const data = await res.json();
      if(!res.ok){ alert(`GSC error ${res.status}: ${data?.error || 'Unknown error'}\nTips: Enable Search Console API for your Google Cloud project and sign in again to grant permissions.`); return }
      const items = Array.isArray(data.siteEntry) ? data.siteEntry : []
      if(items.length===0){ alert('No GSC properties found for your Google account. Make sure your site is verified in Search Console.'); return }
      setGscList(items); setShowGscModal(true)
    }catch(e:any){ alert(`Failed to load GSC sites: ${e?.message||e}`) }
  }
  const connectGA4 = async () => {
    try{
      const res = await fetch('/api/google/ga4/properties');
      if(res.status === 401 || res.status === 403){ await signIn('google', { callbackUrl: '/websites' as any, prompt:'consent' as any }); return }
      const data = await res.json();
      if(!res.ok){ alert(`GA4 error ${res.status}: ${data?.error || 'Unknown error'}\nTip: Enable Analytics Admin API and grant access to the property.`); return }
      const items = Array.isArray(data.accountSummaries) ? data.accountSummaries.flatMap((a:any)=> a.propertySummaries||[]) : []
      if(items.length===0){ alert('No GA4 properties found for your account.'); return }
      setGa4List(items); setShowGa4Modal(true)
    }catch(e:any){ alert(`Failed to load GA4 properties: ${e?.message||e}`) }
  }

  const selectGsc = (key: string) => {
    if(!activeId) return;
    const it = gscList.find((x:any)=> (x.siteUrl||x.url)===key) || {} as any
    const label = `${(it.siteUrl||key)}${it.permissionLevel? ` (${it.permissionLevel})`: ''}`
    saveIntegrations(activeId, { ...integ, gscSite: key, gscLabel: label });
    setIntegVer(v=>v+1); setShowGscModal(false); setOpenInteg(false);
  }
  const selectGa4 = (key: string) => {
    if(!activeId) return;
    const it = ga4List.find((x:any)=> (x.property||x.propertyName||x.name)===key) || {} as any
    const label = (it.displayName||it.property||it.name||key)
    saveIntegrations(activeId, { ...integ, ga4Property: key, ga4Label: label });
    setIntegVer(v=>v+1); setShowGa4Modal(false); setOpenInteg(false);
  }
  const saveWp = (e: FormEvent)=>{ e.preventDefault(); if(!activeId) return; const form = e.target as HTMLFormElement; const fd = new FormData(form); const wpEndpoint = String(fd.get('wpEndpoint')||''); const wpToken = String(fd.get('wpToken')||''); saveIntegrations(activeId, { ...integ, wpEndpoint, wpToken }); setIntegVer(v=>v+1); alert('Saved WordPress integration'); }
  const testWp = async ()=>{
    if(!activeId) return
    const latest = loadIntegrations(activeId)
    const endpoint = latest.wpEndpoint || integ.wpEndpoint; const token = latest.wpToken || integ.wpToken;
    if(!endpoint || !token){ alert('Please save endpoint and license key first.'); return }
    try{
      setConnecting('recheck')
      const res = await fetch('/api/integrations/wp/test', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ endpoint, token, testUrl: (active?.url||'').toString() }) })
      const out = await res.json(); if(out?.ok){ alert(`Connection OK: ${out.message||out.status}`) } else { alert(`Connection failed: ${out?.error||out?.message||out?.status}`) }
    }catch(e:any){ alert(`Connection failed: ${e?.message||e}`) }
    finally{ setConnecting(null) }
  }

  const connectAuto = async ()=>{
    if(!activeId || !active?.url){ alert('Select a website first'); return }
    if(!keyInput){ alert('Enter your license key first'); return }
    try{
      setConnecting('connect')
      const body:any = { siteUrl: active.url, key: keyInput, localDev }
      if(overrideEp) body.overrideEndpoint = overrideEp
      const res = await fetch('/api/integrations/wp/auto-connect', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
      const out = await res.json()
      if(!out?.ok){ alert(out?.error||'Auto-connect failed'); return }
      const updateEp = out?.endpoints?.update || overrideEp
      if(!updateEp){ alert('No endpoint returned'); return }
      saveIntegrations(activeId, { ...integ, wpEndpoint: updateEp, wpToken: keyInput })
      setIntegVer(v=>v+1)
      alert(out?.activated ? 'Connected and verified' : 'Connected (verification pending or not configured)')
    }catch(e:any){ alert(`Connect failed: ${e?.message||e}`) }
    finally{ setConnecting(null) }
  }

  return (
    <>
      {/* Dark Websites list */}
      <div style={{background:'#0b0f1a', color:'#e5e7eb', borderRadius:12, padding:16, boxShadow:'0 1px 2px rgba(0,0,0,.4)'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
          <div>
            <div style={{fontSize:22, fontWeight:800}}>Websites</div>
            <div style={{color:'#94a3b8'}}>Manage your websites and handle integrations with ease</div>
          </div>
          <div style={{display:'flex', gap:8}}>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search" style={{background:'#0f172a', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius:10, padding:'10px 12px'}}/>
            <button className="btn" onClick={()=>setOpenAdd(true)} style={{background:'#6d28d9'}}>+ Add</button>
            <label className="btn secondary" style={{display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer'}}>
              {importBusy? 'Importing…' : 'Import .txt/.csv'}
              <input key={fileKey} type="file" accept=".txt,.csv" style={{display:'none'}} onChange={(e)=>{ const f=e.target.files?.[0]; if(f) onImportFile(f) }} />
            </label>
            <button className="btn secondary" onClick={downloadTxtTemplate}>Download .txt template</button>
          </div>
        </div>
        <div style={{border:'1px solid #1f2937', borderRadius:10, overflow:'hidden'}}>
          <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 160px', gap:0, background:'#0f172a', padding:'10px 12px', color:'#94a3b8', fontSize:12, fontWeight:700}}>
            <div>NAME</div><div>PAGES</div><div>STATUS</div><div>CREATED AT</div><div style={{textAlign:'right'}}>ACTIONS</div>
          </div>
          {filtered.map(w=> (
            <div key={w.id} style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 160px', padding:'14px 12px', borderTop:'1px solid #1f2937', alignItems:'center'}}>
              <div>
                <div style={{fontWeight:700, color:'#e5e7eb'}}>{w.name}</div>
                <a href={w.url} target="_blank" rel="noreferrer" style={{color:'#93c5fd', textDecoration:'none'}}>{(()=>{ try{ return new URL(w.url).hostname }catch{ return w.url } })()}</a>
              </div>
              <div style={{fontWeight:700, color:'#e5e7eb'}}>{ pagesCount[w.id]!=null ? `${pagesCount[w.id]} Pages` : '—' }</div>
              <div>
                {isVerified(w.id) ? (<span style={{background:'#064e3b', color:'#a7f3d0', border:'1px solid #065f46', borderRadius:999, padding:'4px 10px', fontSize:12, fontWeight:800}}>VERIFIED</span>) : (<span style={{background:'#3f1d1d', color:'#fecaca', border:'1px solid #7f1d1d', borderRadius:999, padding:'4px 10px', fontSize:12, fontWeight:800}}>NOT CONNECTED</span>)}
              </div>
              <div>
                <div style={{fontWeight:800}}>{fmtDate((w as any).createdAt)}</div>
              </div>
              <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
                <button className="btn secondary" title="Website Settings" onClick={()=>{ setActiveId(w.id); setOpenSettings(true) }}>
                  ⚙️
                </button>
                <button className="btn" title="WordPress Integration" onClick={()=>{ setActiveId(w.id); setIntegVer(v=>v+1); setOpenInteg(true) }}>
                  🔌
                </button>
              </div>
            </div>
          ))}
          {filtered.length===0 && (
            <div style={{padding:16, borderTop:'1px solid #1f2937', color:'#94a3b8'}}>No websites found.</div>
          )}
        </div>
      </div>
 
      {/* Integration modal */}
      <Modal open={openInteg} onClose={()=>setOpenInteg(false)}>
        <h3>Integrations</h3>
        <div style={{display:'grid', gap:12}}>
          {/* GSC */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #1f2937', borderRadius:12, padding:12}}>
            <div>
              <div style={{fontWeight:700}}>Google Search Console</div>
              <div className="muted">Connect to your Search Console account.</div>
              {integ.gscSite && (
                <div className="muted" style={{marginTop:4, fontSize:12}}>Connected: {integ.gscLabel || integ.gscSite}</div>
              )}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              {integ.gscSite && <span className="badge" style={{color:'#10b981', borderColor:'#1e3d2f'}}>Connected</span>}
              <button className="btn" onClick={connectGSC}>{integ.gscSite? 'Change' : 'Connect'}</button>
              {integ.gscSite && (
                <button className="btn secondary" onClick={()=>{ if(activeId){ saveIntegrations(activeId, { ...integ, gscSite: undefined, gscLabel: undefined }); setIntegVer(v=>v+1) } }}>Disconnect</button>
              )}
            </div>
          </div>
          {/* GA4 */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #1f2937', borderRadius:12, padding:12}}>
            <div>
              <div style={{fontWeight:700}}>Google Analytics (GA4)</div>
              <div className="muted">Connect to your GA4 property.</div>
              {integ.ga4Property && (
                <div className="muted" style={{marginTop:4, fontSize:12}}>Connected: {integ.ga4Label || integ.ga4Property}</div>
              )}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              {integ.ga4Property && <span className="badge" style={{color:'#10b981', borderColor:'#1e3d2f'}}>Connected</span>}
              <button className="btn" onClick={connectGA4}>{integ.ga4Property? 'Change' : 'Connect'}</button>
              {integ.ga4Property && (
                <button className="btn secondary" onClick={()=>{ if(activeId){ saveIntegrations(activeId, { ...integ, ga4Property: undefined, ga4Label: undefined }); setIntegVer(v=>v+1) } }}>Disconnect</button>
              )}
            </div>
          </div>
        {/* WordPress */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #1f2937', borderRadius:12, padding:12}}>
          <div>
            <div style={{fontWeight:700}}>WordPress</div>
            <div className="muted">Securely publish changes to your site.</div>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            {(integ.wpEndpoint && integ.wpToken) && <span className="badge" style={{color:'#10b981', borderColor:'#1e3d2f'}}>Verified</span>}
          </div>
        </div>
        {/* AI Provider moved to topbar Add Integration button */}
          <div className="muted" style={{display:'flex', alignItems:'center', gap:8}}>
            <input type="checkbox" checked={autoGoogle} onChange={(e)=>{ setAutoGoogle(e.target.checked); localStorage.setItem('autoConnectGoogle', String(e.target.checked)) }} />
            Auto-connect Google (GSC & GA4) for new/active sites
          </div>
          <div className="actions" style={{justifyContent:'flex-start'}}>
            <button className="btn" disabled={autoBusy || !activeId} onClick={async()=>{
              if(!activeId) return; setAutoBusy(true)
              try{ await autoConnectGoogle(activeId); const integ = loadIntegrations(activeId); alert(`Auto-connect finished.\nGSC: ${integ.gscSite? 'Connected':'Not found'}\nGA4: ${integ.ga4Property? 'Connected':'Not found'}`) } finally { setAutoBusy(false) }
            }}>{autoBusy? 'Running…' : 'Run Google Auto-Connect Now'}</button>
          </div>
        </div>
        <div style={{height:10}}/>
        {/* WordPress Quick Connect */}
        <div className="form-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
          <label>License Key</label>
          <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:8}}>
            <input className="input" value={keyInput} onChange={e=>setKeyInput(e.target.value)} placeholder="CBL-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" />
            <button className="btn secondary" type="button" title="Copy key" onClick={()=>{ if(keyInput){ navigator.clipboard?.writeText(keyInput).catch(()=>{}); } }} style={{height:44}}>Copy</button>
          </div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:12, marginTop:10}}>
          <span className={`badge ${integ.wpEndpoint && integ.wpToken ? 'ok':'warn'}`}>{integ.wpEndpoint && integ.wpToken ? 'VERIFIED':'NOT CONNECTED'}</span>
          <button className="btn" onClick={connectAuto} disabled={connecting!==null}>{connecting==='connect'? <span className="spinner"/> : 'Connect WordPress'}</button>
          <button className="btn secondary" onClick={testWp} disabled={connecting!==null}>{connecting==='recheck'? <span className="spinner"/> : 'Recheck'}</button>
          {credits && (<span className="badge">Credits: {credits}</span>)}
        </div>
        <div style={{marginTop:8}}>
          <label className="muted" style={{display:'flex', alignItems:'center', gap:8}}>
            <input type="checkbox" checked={localDev} onChange={e=>setLocalDev(e.target.checked)} /> Local dev: skip license server (don’t set API Base)
          </label>
        </div>
        <details style={{marginTop:12}}>
          <summary className="muted">Advanced: Override Endpoint</summary>
          <input className="input" value={overrideEp} onChange={e=>setOverrideEp(e.target.value)} placeholder="https://site.com/wp-json/clickbloom/v1/update" />
        </details>
        <div className="muted" style={{marginTop:10}}>Your key and endpoint are used server-side for secure publishing.</div>
      </Modal>

      <AddWebsiteModal open={openAdd} onClose={()=>setOpenAdd(false)} onCreate={addWebsite}/>
      <SiteSettingsModal open={openSettings} onClose={()=>setOpenSettings(false)} site={active} credits={credits}
        onSave={(updated)=>{ const idx = sites.findIndex(s=>s.id===updated.id); if(idx>=0){ const next=[...sites]; next[idx]=updated; setSites(next); saveSites(next); } setOpenSettings(false) }}
        onDelete={(id)=>{ const next = sites.filter(s=>s.id!==id); setSites(next); saveSites(next); if(activeId===id){ setActiveId(next[0]?.id) } setOpenSettings(false) }}
        onRecrawl={async(id)=>{ const s = sites.find(x=>x.id===id); if(!s) return; try{ setCrawlBusy(true); const lic = loadIntegrations(id).wpToken||''; const res = await fetch('/api/crawl/start', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ siteId:id, url:s.url, key: lic, maxPages: 200, maxDepth: 3 }) }); const out = await res.json(); if(out?.ok){ alert(`Crawled ${out.count} pages`) } else { alert(out?.error||'Recrawl failed') } }catch(e:any){ alert(`Recrawl failed: ${e?.message||e}`) } finally { setCrawlBusy(false) } }}
        onOpenIntegrations={()=>{ setOpenSettings(false); setTimeout(()=> setOpenInteg(true), 50) }}
      />
      <Modal open={crawlBusy} onClose={()=>{}}>
        <h3>Crawling website...</h3>
        <div className="muted">This may take a minute for larger sites.</div>
        <div style={{display:'grid', placeItems:'center', padding:20}}><span className="spinner"/></div>
      </Modal>
      <SelectModal open={showGscModal} onClose={()=>setShowGscModal(false)} title="Select GSC Site"
        items={gscList} getKey={(x:any)=>x.siteUrl} getLabel={(x:any)=>`${x.siteUrl} (${x.permissionLevel})`} onSelect={selectGsc}/>
      <SelectModal open={showGa4Modal} onClose={()=>setShowGa4Modal(false)} title="Select GA4 Property"
        items={ga4List} getKey={(x:any)=>x.property || x.propertyName || x.name} getLabel={(x:any)=>`${x.displayName||x.property||x.name}`}
        onSelect={selectGa4}/>
    </>
  )
}
