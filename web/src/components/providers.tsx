"use client"
import { SessionProvider } from "next-auth/react"
import { ReactNode, useEffect } from "react"
import { DateRangeProvider } from "@/components/date-range"

export function Providers({ children }: { children: ReactNode }){
  // no-op provider; extend later for theming
  useEffect(()=>{},[])
  return (
    <SessionProvider>
      <DateRangeProvider>{children}</DateRangeProvider>
    </SessionProvider>
  )
}
