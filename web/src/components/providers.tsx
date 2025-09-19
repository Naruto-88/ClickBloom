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
    warm(false)
    const id = window.setInterval(()=> warm(false), SNAPSHOT_TTL_MS)
    return ()=>{
      cancelled = true
      window.clearInterval(id)
    }
  }, [])
  return (
    <SessionProvider>
      <DateRangeProvider>{children}</DateRangeProvider>
    </SessionProvider>
  )
}
