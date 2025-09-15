"use client"
import { SessionProvider } from "next-auth/react"
import { ReactNode, useEffect } from "react"
import { DateRangeProvider } from "@/components/date-range"

export function Providers({ children }: { children: ReactNode }){
  // Background prefetch of Clients snapshot for current global range
  useEffect(()=>{
    const SNAP_TTL_MS = 6*60*60*1000 // 6 hours
    const fmt = (d:Date)=> d.toISOString().slice(0,10)
    const yesterday = ()=> { const y=new Date(); y.setDate(y.getDate()-1); return y }
    const matchPresetKey = (r:{from:Date,to:Date})=>{
      const dayDiff = Math.max(1, Math.round((r.to.getTime()-r.from.getTime())/86400000)+1)
      const y = new Date(); y.setDate(y.getDate()-1)
      const lm = { from: new Date(y.getFullYear(), y.getMonth()-1, 1), to: new Date(y.getFullYear(), y.getMonth(), 0) }
      const isSame=(a:Date,b:Date)=> a.toDateString()===b.toDateString()
      if(isSame(r.from, lm.from) && isSame(r.to, lm.to)) return 'lastm'
      if(Math.abs(dayDiff-7)<=1) return '7d'
      if(Math.abs(dayDiff-30)<=1) return '30d'
      if(Math.abs(dayDiff-90)<=2) return '3m'
      if(Math.abs(dayDiff-180)<=3) return '6m'
      if(Math.abs(dayDiff-365)<=5) return '1y'
      return 'custom'
    }
    const snapKey = (k:string)=> `clients:snapshot:${k}`
    const buildPresets = ()=>{
      const y = yesterday()
      const mk = (days:number)=> ({ from: new Date(y.getTime()-(days-1)*86400000), to: y })
      return [
        { key:'7d', range: mk(7) },
        { key:'30d', range: mk(30) },
        { key:'3m', range: mk(90) },
        { key:'lastm', range: { from: new Date(y.getFullYear(), y.getMonth()-1, 1), to: new Date(y.getFullYear(), y.getMonth(), 0) } },
        { key:'6m', range: mk(180) },
        { key:'1y', range: mk(365) },
      ]
    }
    const SNAP_VER = 'v2'
    const prefetchOne = async(from: Date, to: Date)=>{
      try{
        const y = yesterday(); if(to>y) to=y
        const key = matchPresetKey({ from, to })
        const snapRaw = localStorage.getItem(snapKey(key))
        if(snapRaw){ try{ const s = JSON.parse(snapRaw); if(s?.ts && Date.now()-s.ts < SNAP_TTL_MS) return }catch{} }
        // Try server cache first (shared)
        try{
          const r = await fetch(`/api/cache/clients?key=${encodeURIComponent(snapKey(key))}`)
          if(r.ok){
            const j = await r.json(); const snap = j?.value as any
            if(snap?.ts && (Date.now()-snap.ts) < SNAP_TTL_MS && Array.isArray(snap.rows) && snap.ver===SNAP_VER){
              localStorage.setItem(snapKey(key), JSON.stringify(snap))
              return
            }
          }
        }catch{}
        const websites = JSON.parse(localStorage.getItem('websites')||'[]') as Array<{id:string,name:string,url:string}>
        const start = fmt(from), end = fmt(to)
        const days = Math.max(1, Math.round((to.getTime()-from.getTime())/86400000)+1)
        const prevEnd = new Date(from); prevEnd.setDate(prevEnd.getDate()-1)
        const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate()-(days-1))
        const pStart = fmt(prevStart), pEnd = fmt(prevEnd)
        const out:any[] = []
        let hadSignal = false
        for(const w of websites){
          try{
            const integ = JSON.parse(localStorage.getItem('integrations:'+w.id)||'{}')
            const gsc = integ.gscSite as string|undefined
            const ga4 = integ.ga4Property as string|undefined
            let clicks=0, impr=0, pos=0, clicksP=0, imprP=0, posP=0
            if(gsc){
              const r1 = await fetch(`/api/google/gsc/search?site=${encodeURIComponent(gsc)}&start=${start}&end=${end}`)
              const j1 = r1.ok? await r1.json() : { rows:[] }
              const rows1:any[] = j1.rows||[]
              clicks = rows1.reduce((a,r)=>a+(r.clicks||0),0)
              impr = rows1.reduce((a,r)=>a+(r.impressions||0),0)
              pos = rows1.length? rows1.reduce((a,r)=>a+(r.position||0),0)/rows1.length : 0
              const r2 = await fetch(`/api/google/gsc/search?site=${encodeURIComponent(gsc)}&start=${pStart}&end=${pEnd}`)
              const j2 = r2.ok? await r2.json() : { rows:[] }
              const rows2:any[] = j2.rows||[]
              clicksP = rows2.reduce((a,r)=>a+(r.clicks||0),0)
              imprP = rows2.reduce((a,r)=>a+(r.impressions||0),0)
              posP = rows2.length? rows2.reduce((a,r)=>a+(r.position||0),0)/rows2.length : 0
            }
            let orgUsers=0, orgUsersP=0, orgSess=0, orgSessP=0
            if(ga4){
              const au = await fetch('/api/google/ga4/user-acquisition', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: ga4, start, end }) })
              const aju = await au.json(); const ur = (aju.rows||[]) as any[]; ur.forEach(r=>{ if((r.dimensionValues?.[0]?.value||'')==='Organic Search'){ orgUsers += Number(r.metricValues?.[0]?.value||0) } })
              const auP = await fetch('/api/google/ga4/user-acquisition', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: ga4, start: pStart, end: pEnd }) })
              const ajuP = await auP.json(); const urP = (ajuP.rows||[]) as any[]; urP.forEach(r=>{ if((r.dimensionValues?.[0]?.value||'')==='Organic Search'){ orgUsersP += Number(r.metricValues?.[0]?.value||0) } })
              const as = await fetch('/api/google/ga4/acquisition', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: ga4, start, end }) })
              const ajs = await as.json(); const sr = (ajs.rows||[]) as any[]; sr.forEach(r=>{ if((r.dimensionValues?.[0]?.value||'')==='Organic Search'){ orgSess += Number(r.metricValues?.[0]?.value||0) } })
              const asP = await fetch('/api/google/ga4/acquisition', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: ga4, start: pStart, end: pEnd }) })
              const ajsP = await asP.json(); const srP = (ajsP.rows||[]) as any[]; srP.forEach(r=>{ if((r.dimensionValues?.[0]?.value||'')==='Organic Search'){ orgSessP += Number(r.metricValues?.[0]?.value||0) } })
            }
            if(orgUsers>0 || orgSess>0) hadSignal = true
            out.push({
              id: w.id, name: w.name, url: w.url,
              gscClicks: clicks, gscImpr: impr, gscPos: Math.round(pos*10)/10,
              gscClicksPrev: clicksP, gscImprPrev: imprP, gscPosPrev: Math.round(posP*10)/10,
              organicUsers: orgUsers, organicUsersPrev: orgUsersP,
              organicSessions: orgSess, organicSessionsPrev: orgSessP,
              status: 'good'
            })
          }catch{}
        }
        if(hadSignal){
        const payload = { ts: Date.now(), rows: out, ver: SNAP_VER }
        localStorage.setItem(snapKey(key), JSON.stringify(payload))
        try{ await fetch('/api/cache/clients', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ key: snapKey(key), value: payload, ttlSeconds: SNAP_TTL_MS/1000 }) }) }catch{}
        }
      }catch{}
    }
    const prefetch = async()=>{
      // Warm all known presets
      const presets = buildPresets()
      for(const p of presets){ await prefetchOne(p.range.from, p.range.to) }
    }
    // Fire and forget
    try{ prefetch() }catch{}
  },[])
  return (
    <SessionProvider>
      <DateRangeProvider>{children}</DateRangeProvider>
    </SessionProvider>
  )
}




