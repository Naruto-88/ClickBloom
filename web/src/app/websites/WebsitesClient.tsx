"use client"
import WebsitePicker from "@/components/dashboard/WebsitePicker"
import AddWebsiteModal, { Website as WebsiteType } from "@/components/dashboard/AddWebsiteModal"
import SiteSettingsModal from "@/components/dashboard/SiteSettingsModal"
import Modal from "@/components/ui/Modal"
import SelectModal from "@/components/ui/SelectModal"
import { useEffect, useMemo, useState, FormEvent } from "react"
import { signIn } from "next-auth/react"

type Integration = { gscSite?: string, ga4Property?: string, wpEndpoint?: string, wpToken?: string }
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

  useEffect(()=>{
    const s = loadSites(); setSites(s); const id = localStorage.getItem('activeWebsiteId') || s[0]?.id; setActiveId(id || undefined)
  },[])

  const active = useMemo(()=> sites.find(x=>x.id===activeId), [sites, activeId])
  const integ = useMemo(()=> loadIntegrations(activeId), [activeId, integVer])
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

  const addWebsite = (w: Website) => { const next = [...sites, w]; setSites(next); saveSites(next); setActiveId(w.id); setOpenAdd(false) }

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
    if(!activeId) return; saveIntegrations(activeId, { ...integ, gscSite: key });
    setIntegVer(v=>v+1); setShowGscModal(false); setOpenInteg(false);
  }
  const selectGa4 = (key: string) => {
    if(!activeId) return; saveIntegrations(activeId, { ...integ, ga4Property: key });
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

      {/* Integrations card (Connected Accounts) */}
      <div className="card" style={{marginTop:16}}>
        <div className="panel-title"><strong>Connected Accounts</strong></div>
        <div style={{display:'grid', gap:12}}>
          {/* Google Search Console */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #1f2937', borderRadius:12, padding:12}}>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:36, height:36, borderRadius:10, background:'#0f172a', display:'grid', placeItems:'center'}}>G</div>
              <div>
                <div style={{fontWeight:700}}>Google Search Console</div>
                <div className="muted">Connect to your Google Search Console account.</div>
              </div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              {integ.gscSite && <span className="badge" style={{color:'#10b981', borderColor:'#1e3d2f'}}>Connected</span>}
              {integ.gscSite ? (
                <button className="btn secondary" onClick={()=>{ if(activeId){ saveIntegrations(activeId, { ...integ, gscSite: undefined }); setIntegVer(v=>v+1) } }}>Disconnect</button>
              ) : (
                <button className="btn" onClick={connectGSC}>Connect</button>
              )}
            </div>
          </div>
          {/* Google Analytics */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #1f2937', borderRadius:12, padding:12}}>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:36, height:36, borderRadius:10, background:'#0f172a', display:'grid', placeItems:'center'}}>A</div>
              <div>
                <div style={{fontWeight:700}}>Google Analytics (GA4)</div>
                <div className="muted">Connect to your Google Analytics property.</div>
              </div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              {integ.ga4Property && <span className="badge" style={{color:'#10b981', borderColor:'#1e3d2f'}}>Connected</span>}
              {integ.ga4Property ? (
                <button className="btn secondary" onClick={()=>{ if(activeId){ saveIntegrations(activeId, { ...integ, ga4Property: undefined }); setIntegVer(v=>v+1) } }}>Disconnect</button>
              ) : (
                <button className="btn" onClick={connectGA4}>Connect</button>
              )}
            </div>
          </div>
          {/* WordPress */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #1f2937', borderRadius:12, padding:12}}>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:36, height:36, borderRadius:10, background:'#0f172a', display:'grid', placeItems:'center'}}>W</div>
              <div>
                <div style={{fontWeight:700}}>WordPress</div>
                <div className="muted">Connect your WordPress site to publish changes.</div>
              </div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              {(integ.wpEndpoint && integ.wpToken) && <span className="badge" style={{color:'#10b981', borderColor:'#1e3d2f'}}>Connected</span>}
              {(integ.wpEndpoint && integ.wpToken) ? (
                <button className="btn secondary" onClick={()=>{ if(activeId){ saveIntegrations(activeId, { ...integ, wpEndpoint: undefined, wpToken: undefined }); setIntegVer(v=>v+1) } }}>Disconnect</button>
              ) : (
                <button className="btn" onClick={()=> setOpenInteg(true)}>Connect</button>
              )}
            </div>
          </div>
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
            </div>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              {integ.gscSite && <span className="badge" style={{color:'#10b981', borderColor:'#1e3d2f'}}>Connected</span>}
              {integ.gscSite ? (
                <button className="btn secondary" onClick={()=>{ if(activeId){ saveIntegrations(activeId, { ...integ, gscSite: undefined }); setIntegVer(v=>v+1) } }}>Disconnect</button>
              ) : (
                <button className="btn" onClick={connectGSC}>Connect</button>
              )}
            </div>
          </div>
          {/* GA4 */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #1f2937', borderRadius:12, padding:12}}>
            <div>
              <div style={{fontWeight:700}}>Google Analytics (GA4)</div>
              <div className="muted">Connect to your GA4 property.</div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              {integ.ga4Property && <span className="badge" style={{color:'#10b981', borderColor:'#1e3d2f'}}>Connected</span>}
              {integ.ga4Property ? (
                <button className="btn secondary" onClick={()=>{ if(activeId){ saveIntegrations(activeId, { ...integ, ga4Property: undefined }); setIntegVer(v=>v+1) } }}>Disconnect</button>
              ) : (
                <button className="btn" onClick={connectGA4}>Connect</button>
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
        </div>
        <div style={{height:10}}/>
        {/* WordPress Quick Connect */}
        <div className="form-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
          <label>License Key</label>
          <input className="input" value={keyInput} onChange={e=>setKeyInput(e.target.value)} placeholder="CBL-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" />
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
