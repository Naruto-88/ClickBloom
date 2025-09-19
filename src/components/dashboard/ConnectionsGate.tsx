"use client"
import { ReactNode, useEffect, useState } from "react"

function getActiveSiteId(){ return localStorage.getItem('activeWebsiteId') || undefined }
function getIntegrations(siteId?: string){
  if(!siteId) return { gsc:false, ga4:false }
  try{
    const obj = JSON.parse(localStorage.getItem('integrations:'+siteId) || '{}')
    return { gsc: !!obj.gscSite, ga4: !!obj.ga4Property }
  }catch{ return { gsc:false, ga4:false } }
}

export default function ConnectionsGate({ children }: { children: ReactNode }){
  const [status, setStatus] = useState<{gsc:boolean, ga4:boolean}>({gsc:false,ga4:false})
  useEffect(()=>{
    const id = getActiveSiteId(); setStatus(getIntegrations(id))
  },[])
  if(!status.gsc){
    return (
      <div className="card" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
        <div>
          <div style={{fontWeight:700}}>Connect your data sources</div>
          <div className="muted">Connect Google Search Console for performance data in Dashboard. Manage connections per‑website in the Websites section.</div>
        </div>
        <a className="btn" href="/websites">Open Websites</a>
      </div>
    )
  }
  return <>{children}</>
}
