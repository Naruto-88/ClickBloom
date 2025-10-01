"use client"
import { SessionProvider } from "next-auth/react"
import { ReactNode, useEffect } from "react"
import { DateRangeProvider } from "@/components/date-range"
import { prefetchClientsSnapshots, prefetchPerformanceSnapshot, prefetchKeywordsSnapshots, SNAPSHOT_TTL_MS } from "@/lib/snapshots"

export function Providers({ children }: { children: ReactNode }){
  useEffect(()=>{
    let cancelled = false
    const warm = async(force = false)=>{
      if(cancelled) return
      try{ await prefetchClientsSnapshots({ force }) }catch{}
      try{ await prefetchPerformanceSnapshot({ force }) }catch{}
      try{ await prefetchKeywordsSnapshots({ force }) }catch{}
    }
    const runWhenIdle = (cb: ()=>void)=>{
      // Defer heavy prefetch to browser idle time to improve TTI
      const ric: any = (window as any).requestIdleCallback
      if(typeof ric === 'function') ric(()=> cb())
      else window.setTimeout(cb, 300)
    }
    const kick = ()=>{
      if(document.visibilityState !== 'visible') return
      runWhenIdle(()=> warm(false))
    }
    // Initial warmup deferred until tab is visible and idle
    kick()
    document.addEventListener('visibilitychange', kick)
    // Refresh on a long cadence (12h) while tab is visible
    const id = window.setInterval(()=>{ if(document.visibilityState==='visible') warm(false) }, SNAPSHOT_TTL_MS)
    return ()=>{
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', kick)
    }
  }, [])
  return (
    <SessionProvider>
      <DateRangeProvider>{children}</DateRangeProvider>
    </SessionProvider>
  )
}
