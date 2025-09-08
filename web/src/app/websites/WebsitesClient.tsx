"use client"
import WebsitePicker from "@/components/dashboard/WebsitePicker"
import AddWebsiteModal from "@/components/dashboard/AddWebsiteModal"
import SelectModal from "@/components/ui/SelectModal"
import { useEffect, useMemo, useState, FormEvent } from "react"
import { signIn } from "next-auth/react"

type Integration = { gscSite?: string, ga4Property?: string, wpEndpoint?: string, wpToken?: string }
type Website = { id: string; name: string; url: string; industry?: string; description?: string }

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

  useEffect(()=>{
    const s = loadSites(); setSites(s); const id = localStorage.getItem('activeWebsiteId') || s[0]?.id; setActiveId(id || undefined)
  },[])

  const active = useMemo(()=> sites.find(x=>x.id===activeId), [sites, activeId])
  const integ = useMemo(()=> loadIntegrations(activeId), [activeId])

  const addWebsite = (w: Website) => { const next = [...sites, w]; setSites(next); saveSites(next); setActiveId(w.id); setOpenAdd(false) }

  const connectGSC = async () => {
    try{
      const res = await fetch('/api/google/gsc/sites');
      if(res.status === 401 || res.status === 403){
        await signIn('google', { callbackUrl: '/websites' as any, prompt: 'consent' as any })
        return
      }
      const data = await res.json();
      if(!res.ok){
        alert(`GSC error ${res.status}: ${data?.error || 'Unknown error'}\nTips: Enable Search Console API for your Google Cloud project and sign in again to grant permissions.`)
        return
      }
      const items = Array.isArray(data.siteEntry) ? data.siteEntry : []
      if(items.length===0){
        alert('No GSC properties found for your Google account. Make sure your site is verified in Search Console.')
        return
      }
      setGscList(items); setShowGscModal(true)
    }catch(e:any){ alert(`Failed to load GSC sites: ${e?.message||e}`) }
  }
  const connectGA4 = async () => {
    try{
      const res = await fetch('/api/google/ga4/properties');
      if(res.status === 401 || res.status === 403){
        await signIn('google', { callbackUrl: '/websites' as any, prompt: 'consent' as any })
        return
      }
      const data = await res.json();
      if(!res.ok){
        alert(`GA4 error ${res.status}: ${data?.error || 'Unknown error'}\nTip: Enable Analytics Admin API and grant access to the property.`)
        return
      }
      const items = Array.isArray(data.accountSummaries) ? data.accountSummaries.flatMap((a:any)=> a.propertySummaries||[]) : []
      if(items.length===0){ alert('No GA4 properties found for your account.') ; return }
      setGa4List(items); setShowGa4Modal(true)
    }catch(e:any){ alert(`Failed to load GA4 properties: ${e?.message||e}`) }
  }

  const selectGsc = (key: string) => { if(!activeId) return; saveIntegrations(activeId, { ...integ, gscSite: key }); setShowGscModal(false) }
  const selectGa4 = (key: string) => { if(!activeId) return; saveIntegrations(activeId, { ...integ, ga4Property: key }); setShowGa4Modal(false) }
  const saveWp = (e: FormEvent)=>{ e.preventDefault(); if(!activeId) return; const form = e.target as HTMLFormElement; const fd = new FormData(form); const wpEndpoint = String(fd.get('wpEndpoint')||''); const wpToken = String(fd.get('wpToken')||''); saveIntegrations(activeId, { ...integ, wpEndpoint, wpToken }); alert('Saved WordPress integration'); }
  const testWp = async ()=>{
    if(!activeId) return
    const endpoint = integ.wpEndpoint; const token = integ.wpToken;
    if(!endpoint || !token){ alert('Please save endpoint and license key first.'); return }
    try{
      const res = await fetch('/api/integrations/wp/test', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ endpoint, token, testUrl: (active?.url||'').toString() }) })
      const out = await res.json()
      if(out?.ok){ alert(`Connection OK: ${out.message||out.status}`) } else { alert(`Connection failed: ${out?.error||out?.message||out?.status}`) }
    }catch(e:any){ alert(`Connection failed: ${e?.message||e}`) }
  }

  return (
    <>
      <div className="toolbar">
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <WebsitePicker/>
          <button className="btn secondary" onClick={()=>setOpenAdd(true)}>+ Add Website</button>
        </div>
      </div>

      <div className="card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div>
            <div style={{fontWeight:700}}>Selected Website</div>
            <div className="muted">{active ? `${active.name} • ${active.url}` : 'None selected'}</div>
          </div>
        </div>
        <div style={{height:12}}/>
        <div style={{display:'flex', gap:10}}>
          <button className="btn" title="Click to change or re-connect" onClick={connectGSC}>
            {integ.gscSite ? `GSC: ${new URL(integ.gscSite).hostname || integ.gscSite}` : 'Connect GSC'}
          </button>
          <button className="btn secondary" title="Click to change or re-connect" onClick={connectGA4}>
            {integ.ga4Property ? `GA4: ${integ.ga4Property}` : 'Connect GA4'}
          </button>
        </div>
      </div>

      <div className="card" style={{marginTop:16}}>
        <div className="panel-title"><strong>WordPress Integration</strong><span className="badge">ClickBloom</span></div>
        <form onSubmit={saveWp} className="form-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
          <label>Endpoint URL</label>
          <input name="wpEndpoint" className="input" placeholder="https://site.com/wp-json/clickbloom/v1/update" defaultValue={integ.wpEndpoint||''} />
          <label>License Key</label>
          <input name="wpToken" className="input" placeholder="CBL-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" defaultValue={integ.wpToken||''} />
          <div style={{gridColumn:'1 / -1', display:'flex', justifyContent:'space-between'}}>
            <button type="button" className="btn secondary" onClick={testWp}>Test Connection</button>
            <button className="btn" type="submit">Save Integration</button>
          </div>
        </form>
        <div className="muted" style={{marginTop:6}}>This is used by Apply to Site actions on Optimize pages.</div>
      </div>

      <AddWebsiteModal open={openAdd} onClose={()=>setOpenAdd(false)} onCreate={addWebsite}/>
      <SelectModal open={showGscModal} onClose={()=>setShowGscModal(false)} title="Select GSC Site"
        items={gscList} getKey={(x:any)=>x.siteUrl} getLabel={(x:any)=>`${x.siteUrl} (${x.permissionLevel})`} onSelect={selectGsc}/>
      <SelectModal open={showGa4Modal} onClose={()=>setShowGa4Modal(false)} title="Select GA4 Property"
        items={ga4List} getKey={(x:any)=>x.property || x.propertyName || x.name} getLabel={(x:any)=>`${x.displayName||x.property||x.name}`}
        onSelect={selectGa4}/>
    </>
  )
}
