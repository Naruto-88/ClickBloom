"use client"
import { useMemo, useState } from 'react'
import RangePicker from './RangePicker'

import { DateRange, getPresets } from '@/lib/dates'

function toLabel(r: DateRange) {
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${fmt(r.from)} - ${fmt(r.to)}`
}

export default function RangeDropdown({ value, onChange }: { value: DateRange, onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const presets = useMemo(() => getPresets(), [])

  return (
    <div style={{ position: 'relative' }}>
      <div className="picker" onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer' }}>
        <span>{toLabel(value)}</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '110%', background: '#0f0f20', border: '1px solid #2b2b47', borderRadius: 10, minWidth: 240, zIndex: 50, padding: 8 }}>
          {presets.map(p => (
            <div key={p.key} onClick={() => { onChange(p.range); setOpen(false) }} style={{ padding: '8px 10px', cursor: 'pointer', borderRadius: 8 }}>{p.label}</div>
          ))}
          <div onClick={() => { setShowCustom(true); }} style={{ padding: '8px 10px', cursor: 'pointer', borderRadius: 8, borderTop: '1px solid #2b2b47', marginTop: 4 }}>Custom…</div>
        </div>
      )}
      <RangePicker open={showCustom} onClose={() => setShowCustom(false)} value={value} onApply={(r) => { onChange(r); setShowCustom(false); setOpen(false) }} />
    </div>
  )
}

