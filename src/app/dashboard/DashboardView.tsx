"use client"
import WebsitePicker from "@/components/dashboard/WebsitePicker"
import ConnectionsGate from "@/components/dashboard/ConnectionsGate"
import KpiCard from "@/components/dashboard/KpiCard"
import PerformancePanel, { Point } from "@/components/dashboard/PerformancePanel"
import DonutChart from "@/components/dashboard/DonutChart"
import GeoPanel from "@/components/dashboard/GeoPanel"
import ReportsGrid from "@/components/dashboard/ReportsGrid"
import RangeDropdown from "@/components/ui/RangeDropdown"
import { useDateRange } from "@/components/date-range"
import { useEffect, useMemo, useState } from "react"

function activeSite() { return localStorage.getItem('activeWebsiteId') || undefined }
function getSiteUrl(id?: string) { if (!id) return undefined; try { return JSON.parse(localStorage.getItem('integrations:' + id) || '{}').gscSite as string | undefined } catch { return undefined } }

function fmt(n: number) { if (n >= 1000) return (n / 1000).toFixed(1) + 'K'; return String(n) }

type RangeToken = '7' | '28' | '90'

export default function DashboardView() {
  const { range, setRange } = useDateRange()
  const [points, setPoints] = useState<Point[]>([])
  const [totals, setTotals] = useState({ clicks: 0, impressions: 0, ctr: 0, position: 0, prevClicks: 0, prevImpressions: 0, prevCtr: 0, prevPosition: 0 })
  const [compare, setCompare] = useState(true)

  const formatRange = (r: { from: Date, to: Date }) => {
    const f = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    return `${f(r.from)} - ${f(r.to)}`
  }

  const load = async () => {
    const siteId = activeSite(); const siteUrl = getSiteUrl(siteId)
    if (!siteUrl) return
    let start = new Date(range.from)
    let end = new Date(range.to)
    // Clamp end to yesterday to avoid GSC latency
    const today = new Date(); const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    if (end > yesterday) end = yesterday
    if (start > end) start = new Date(end)
    const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
    const qs = (p: any) => Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
    const currRes = await fetch(`/api/google/gsc/search?${qs({ site: siteUrl, start: fmtDate(start), end: fmtDate(end) })}`)
    if (!currRes.ok) { console.warn('GSC search error', await currRes.text()); setPoints([]); setTotals({ clicks: 0, impressions: 0, ctr: 0, position: 0, prevClicks: 0, prevImpressions: 0, prevCtr: 0, prevPosition: 0 }); return }
    const curr = await currRes.json()
    const rows: any[] = curr.rows || []
    const pts: Point[] = rows.map(r => ({ date: r.keys?.[0], clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: Math.round((r.ctr || 0) * 1000) / 10, position: Math.round((r.position || 0) * 10) / 10 }))
    setPoints(pts)

    // previous period
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    const prevEnd = new Date(start); prevEnd.setDate(start.getDate() - 1)
    const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - (days - 1))
    const prevRes = await fetch(`/api/google/gsc/search?${qs({ site: siteUrl, start: fmtDate(prevStart), end: fmtDate(prevEnd) })}`)
    const prev = prevRes.ok ? await prevRes.json() : { rows: [] }
    const sum = (arr: any[], key: string) => arr.reduce((a, r) => a + (r[key] || 0), 0)
    const cClicks = sum(rows, 'clicks'); const pClicks = sum(prev.rows || [], 'clicks')
    const cImpr = sum(rows, 'impressions'); const pImpr = sum(prev.rows || [], 'impressions')
    const cCtr = cImpr > 0 ? (cClicks / cImpr) * 100 : 0; const pCtr = pImpr > 0 ? (sum(prev.rows || [], 'clicks') / pImpr) * 100 : 0
    const cPos = rows.length ? (rows.reduce((a, r) => a + (r.position || 0), 0) / rows.length) : 0
    const pPos = (prev.rows || []).length ? ((prev.rows || []).reduce((a: any, r: any) => a + (r.position || 0), 0) / (prev.rows || []).length) : 0

    setTotals({
      clicks: cClicks, impressions: cImpr, ctr: Math.round(cCtr * 10) / 10, position: Math.round(cPos * 10) / 10,
      prevClicks: pClicks, prevImpressions: pImpr, prevCtr: Math.round(pCtr * 10) / 10, prevPosition: Math.round(pPos * 10) / 10
    })
  }

  useEffect(() => { load() }, [range.from, range.to])

  return (
    <>
      <div className="toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <WebsitePicker onChange={() => load()} />
        </div>
        <div className="picker" style={{ gap: 8 }}>
          <RangeDropdown value={range} onChange={setRange} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} /> Compare prev
          </label>
        </div>
      </div>

      <section className="kpi-grid">
        <KpiCard title="Total Clicks" current={totals.clicks} previous={totals.prevClicks} format={fmt} color="#a78bfa" series={points.map(p => p.clicks)} />
        <KpiCard title="Total Impressions" current={totals.impressions} previous={totals.prevImpressions} format={fmt} color="#22d3ee" series={points.map(p => p.impressions)} />
        <KpiCard title="Average CTR" current={totals.ctr} previous={totals.prevCtr} format={(n) => `${n.toFixed(1)}%`} color="#fbbf24" series={points.map(p => p.ctr)} />
        <KpiCard title="Average Position" current={totals.position} previous={totals.prevPosition} format={(n) => n.toFixed(1)} color="#22c55e" invert series={points.map(p => p.position)} />
      </section>

      <ConnectionsGate>
        <div className="split">
          <PerformancePanel points={points} />
          <div className="card health-card">
            <div className="panel-title">
              <strong>Website Health</strong>
              <span className="badge">SEO Technical Analysis</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--success)' }}>Excellent</div>
              <span className="badge-pill status-ok">Optimized</span>
            </div>

            <div className="muted" style={{ fontSize: '14px' }}>Found a few minor opportunities for growth.</div>

            <div className="inner-card error">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Critical Errors</strong>
                <span className="badge" style={{ background: 'var(--danger)', color: 'white', border: 'none' }}>1</span>
              </div>
              <div className="muted" style={{ fontSize: '13px', marginTop: 4 }}>Missing canonical tags on some pages.</div>
            </div>

            <div className="inner-card warning">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Warnings</strong>
                <span className="badge" style={{ background: 'var(--warning)', color: 'white', border: 'none' }}>0</span>
              </div>
              <div className="muted" style={{ fontSize: '13px', marginTop: 4 }}>All internal redirects are optimal.</div>
            </div>

            <div className="inner-card success">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Optimization</strong>
                <span className="badge" style={{ background: 'var(--success)', color: 'white', border: 'none' }}>Active</span>
              </div>
              <div className="muted" style={{ fontSize: '13px', marginTop: 4 }}>AI-driven site audit complete.</div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
              <div className="muted" style={{ fontSize: '13px', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span>Resolution Progress</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>82%</span>
              </div>
              <div className="progress-bar-wrap">
                <div className="progress-bar-fill" style={{ width: '82%' }} />
              </div>
              <div className="muted" style={{ fontSize: '12px' }}>Excellent progress! Keep optimizing to reach 100%.</div>
            </div>
          </div>
        </div>
      </ConnectionsGate>

      <div className="two-col" style={{ marginTop: 16 }}>
        <GeoPanel />
        <DonutChart title="Keyword Distribution" slices={[
          { label: 'Top 3', value: 22, color: '#22c55e' },
          { label: 'Top 4‑10', value: 90, color: '#84cc16' },
          { label: 'Top 11‑20', value: 35, color: '#06b6d4' },
          { label: 'Top 21‑50', value: 70, color: '#a78bfa' },
          { label: 'Top 50+', value: 95, color: '#f59e0b' },
        ]} />
      </div>

      <div style={{ marginTop: 16 }}>
        <ReportsGrid />
      </div>
    </>
  )
}
