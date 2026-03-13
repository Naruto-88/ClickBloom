"use client"
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { DateRange, getPresets, fmtDateISO } from '@/lib/dates'
export type { DateRange }

const DateRangeContext = createContext<{ range: DateRange, setRange: (r: DateRange) => void } | null>(null)

function defaultRange(): DateRange {
  const presets = getPresets()
  return presets.find(p => p.key === '30d')?.range || presets[0].range
}

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = useState<DateRange>(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('globalRange')
      if (raw) {
        try { const o = JSON.parse(raw); return { from: new Date(o.from), to: new Date(o.to) } } catch { }
      }
    }
    return defaultRange()
  })
  useEffect(() => {
    try { localStorage.setItem('globalRange', JSON.stringify({ from: fmtDateISO(range.from), to: fmtDateISO(range.to) })) } catch { }
  }, [range])
  const value = useMemo(() => ({ range, setRange }), [range])
  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext)
  if (!ctx) throw new Error('useDateRange must be used within DateRangeProvider')
  return ctx
}

