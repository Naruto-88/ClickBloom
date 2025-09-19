"use client"
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type DateRange = { from: Date, to: Date }

const DateRangeContext = createContext<{ range: DateRange, setRange: (r: DateRange)=>void }|null>(null)

function defaultRange(): DateRange{
  const y = new Date(); y.setDate(y.getDate()-1)
  const s = new Date(y); s.setDate(y.getDate()-27)
  return { from: s, to: y }
}

export function DateRangeProvider({ children }: { children: React.ReactNode }){
  const [range, setRange] = useState<DateRange>(()=>{
    if(typeof window !== 'undefined'){
      const raw = localStorage.getItem('globalRange')
      if(raw){
        try{ const o = JSON.parse(raw); return { from: new Date(o.from), to: new Date(o.to) } }catch{}
      }
    }
    return defaultRange()
  })
  useEffect(()=>{
    try{ localStorage.setItem('globalRange', JSON.stringify({ from: range.from.toISOString(), to: range.to.toISOString() })) }catch{}
  }, [range])
  const value = useMemo(()=>({ range, setRange }), [range])
  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>
}

export function useDateRange(){
  const ctx = useContext(DateRangeContext)
  if(!ctx) throw new Error('useDateRange must be used within DateRangeProvider')
  return ctx
}

