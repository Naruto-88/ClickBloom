"use client"

const SNAPSHOT_EVENT_NAME = 'clickbloom:snapshot-updated'
export const SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours

const CLIENTS_SNAPSHOT_VERSION = 'clients-v2'
const PERFORMANCE_SNAPSHOT_VERSION = 'performance-v1'
const KEYWORDS_SNAPSHOT_VERSION = 'keywords-v1'

export type SnapshotUpdateDetail = {
  type: 'clients' | 'performance' | 'keywords'
  meta?: Record<string, unknown>
}

export type PerformancePoint = { date: string; clicks: number; impressions: number; ctr: number; position: number }
export type PerformanceSiteSnapshot = {
  site: { id: string; name: string; url: string }
  integ: { gscSite?: string; ga4Property?: string }
  points: PerformancePoint[]
  totals: { clicks: number; impressions: number; ctr: number; position: number }
  prev: { clicks: number; impressions: number; ctr: number; position: number }
  ga4: { sessions: number; channels: Record<string, number> }
  queries: Array<{ query: string; clicks: number; impressions: number; position: number; deltaClicks: number; deltaImpressions: number; deltaPosition: number }>
  queriesClicks?: number
  errors?: { gsc?: string; gscText?: string; ga4?: string }
}
export type PerformanceSnapshot = {
  ts: number
  ver: string
  range: { from: string; to: string }
  data: Record<string, PerformanceSiteSnapshot>
}

export type KeywordSnapshot = {
  siteId: string
  ts: number
  ver: string
  list: any[]
}

export type ClientsSnapshot = {
  ts: number
  ver: string
  rows: any[]
}

function emitSnapshotUpdate(detail: SnapshotUpdateDetail){
  if(typeof window === 'undefined') return
  try{
    window.dispatchEvent(new CustomEvent<SnapshotUpdateDetail>(SNAPSHOT_EVENT_NAME, { detail }))
  }catch{}
}

function readJSON<T>(key: string): T | null{
  if(typeof window === 'undefined') return null
  try{
    const raw = window.localStorage.getItem(key)
    if(!raw) return null
    return JSON.parse(raw) as T
  }catch{
    return null
  }
}

function writeJSON(key: string, value: unknown){
  if(typeof window === 'undefined') return
  try{ window.localStorage.setItem(key, JSON.stringify(value)) }catch{}
}

function getWebsites(): Array<{ id: string; name: string; url: string }>{
  if(typeof window === 'undefined') return []
  try{
    return JSON.parse(window.localStorage.getItem('websites')||'[]') || []
  }catch{
    return []
  }
}

function getIntegration(id: string): { gscSite?: string; ga4Property?: string }{
  if(typeof window === 'undefined') return {}
  try{
    return JSON.parse(window.localStorage.getItem('integrations:'+id)||'{}') || {}
  }catch{
    return {}
  }
}

function fmtISO(d: Date){ return d.toISOString().slice(0,10) }

function yesterday(){ const d = new Date(); d.setDate(d.getDate()-1); return d }

function ensureRangeWithinGsc(from: Date, to: Date){
  const y = yesterday()
  const end = to > y ? y : to
  const start = from > end ? new Date(end) : from
  return { start, end }
}

function sumRows(rows: any[], key: string){ return rows.reduce((acc, row)=> acc + Number(row?.[key]||0), 0) }

function averagePosition(rows: any[]){
  const weights = rows.map(r=> ({ pos: Number(r?.position||0), impr: Number(r?.impressions||0) }))
  const totalImpr = weights.reduce((acc, row)=> acc + (Number.isFinite(row.impr)? row.impr : 0), 0)
  if(!totalImpr) return 0
  const total = weights.reduce((acc, row)=> acc + (Number.isFinite(row.pos)? row.pos * row.impr : 0), 0)
  return totalImpr? total / totalImpr : 0
}

async function fetchJson(resPromise: Promise<Response>): Promise<any>{
  try{
    const res = await resPromise
    if(!res.ok) return {}
    return await res.json().catch(()=> ({}))
  }catch{
    return {}
  }
}

export function getPerformanceSnapshot(): PerformanceSnapshot | null{
  const snap = readJSON<PerformanceSnapshot>('performance:snapshot')
  if(!snap || snap.ver !== PERFORMANCE_SNAPSHOT_VERSION) return null
  return snap
}

export function getKeywordSnapshot(siteId: string): KeywordSnapshot | null{
  if(!siteId) return null
  const snap = readJSON<KeywordSnapshot>(`keywords:snapshot:${siteId}`)
  if(!snap || snap.ver !== KEYWORDS_SNAPSHOT_VERSION) return null
  return snap
}

export function getClientsSnapshot(key: string): ClientsSnapshot | null{
  const snap = readJSON<ClientsSnapshot>(`clients:snapshot:${key}`)
  if(!snap || snap.ver !== CLIENTS_SNAPSHOT_VERSION) return null
  return snap
}

async function fetchClientsPreset(key: string, from: Date, to: Date){
  const storeKey = `clients:snapshot:${key}`
  const y = yesterday()
  const clampTo = to > y ? y : to
  const clampFrom = from > clampTo ? new Date(clampTo) : from
  const start = fmtISO(clampFrom)
  const end = fmtISO(clampTo)
  const days = Math.max(1, Math.round((clampTo.getTime()-clampFrom.getTime())/86400000)+1)
  const prevEnd = new Date(clampFrom); prevEnd.setDate(prevEnd.getDate()-1)
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate()-(days-1))
  const pStart = fmtISO(prevStart)
  const pEnd = fmtISO(prevEnd)

  try{
    const cached = await fetch(`/api/cache/clients?key=${encodeURIComponent(storeKey)}`)
    if(cached.ok){
      const payload = await cached.json().catch(()=>null)
      const snap = payload?.value as ClientsSnapshot | undefined
      if(snap?.ver === CLIENTS_SNAPSHOT_VERSION && Array.isArray(snap.rows) && snap.ts && (Date.now()-snap.ts) < SNAPSHOT_TTL_MS){
        writeJSON(storeKey, snap)
        emitSnapshotUpdate({ type: 'clients', meta: { key, ts: snap.ts } })
        return snap
      }
    }
  }catch{}

  const websites = getWebsites()
  const rows: any[] = []
  let hadSignal = false
  for(const w of websites){
    const integ = getIntegration(w.id)
    const item: any = {
      id: w.id,
      name: w.name,
      url: w.url,
      gscClicks: 0,
      gscImpr: 0,
      gscPos: 0,
      gscClicksPrev: 0,
      gscImprPrev: 0,
      gscPosPrev: 0,
      organicUsers: 0,
      organicUsersPrev: 0,
      organicSessions: 0,
      organicSessionsPrev: 0,
      status: 'good'
    }
    if(integ.gscSite){
      try{
        const current = await fetchJson(fetch(`/api/google/gsc/search?site=${encodeURIComponent(integ.gscSite)}&start=${start}&end=${end}`))
        const prev = await fetchJson(fetch(`/api/google/gsc/search?site=${encodeURIComponent(integ.gscSite)}&start=${pStart}&end=${pEnd}`))
        const curRows: any[] = current.rows || []
        const prevRows: any[] = prev.rows || []
        item.gscClicks = sumRows(curRows, 'clicks')
        item.gscImpr = sumRows(curRows, 'impressions')
        item.gscPos = Number(averagePosition(curRows).toFixed(1))
        item.gscClicksPrev = sumRows(prevRows, 'clicks')
        item.gscImprPrev = sumRows(prevRows, 'impressions')
        item.gscPosPrev = Number(averagePosition(prevRows).toFixed(1))
      }catch{}
    }
    if(integ.ga4Property){
      try{
        const users = await fetchJson(fetch('/api/google/ga4/user-acquisition', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: integ.ga4Property, start, end }) }))
        const usersPrev = await fetchJson(fetch('/api/google/ga4/user-acquisition', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: integ.ga4Property, start: pStart, end: pEnd }) }))
        const sessions = await fetchJson(fetch('/api/google/ga4/acquisition', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: integ.ga4Property, start, end }) }))
        const sessionsPrev = await fetchJson(fetch('/api/google/ga4/acquisition', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: integ.ga4Property, start: pStart, end: pEnd }) }))
        const sumByChannel = (payload:any)=>{
          let usersCount = 0
          ;(payload.rows||[]).forEach((r:any)=>{
            if((r.dimensionValues?.[0]?.value||'')==='Organic Search'){
              usersCount += Number(r.metricValues?.[0]?.value||0)
            }
          })
          return usersCount
        }
        item.organicUsers = sumByChannel(users)
        item.organicUsersPrev = sumByChannel(usersPrev)
        item.organicSessions = sumByChannel(sessions)
        item.organicSessionsPrev = sumByChannel(sessionsPrev)
        if(item.organicUsers || item.organicSessions) hadSignal = true
      }catch{}
    }
    rows.push(item)
  }
  if(!hadSignal){
    return null
  }
  const snapshot: ClientsSnapshot = { ts: Date.now(), ver: CLIENTS_SNAPSHOT_VERSION, rows }
  writeJSON(storeKey, snapshot)
  try{
    await fetch('/api/cache/clients', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ key: storeKey, value: snapshot, ttlSeconds: SNAPSHOT_TTL_MS/1000 }) })
  }catch{}
  emitSnapshotUpdate({ type: 'clients', meta: { key, ts: snapshot.ts } })
  return snapshot
}


export async function prefetchClientsSnapshots(opts?: { force?: boolean }): Promise<void>{
  if(typeof window === 'undefined') return
  const presets = buildClientPresets()
  for(const preset of presets){
    const existing = getClientsSnapshot(preset.key)
    if(existing && !opts?.force && Date.now() - existing.ts < SNAPSHOT_TTL_MS) continue
    await fetchClientsPreset(preset.key, preset.range.from, preset.range.to)
  }
}

function buildClientPresets(){
  const y = yesterday()
  const mk = (days:number)=>{
    const to = new Date(y)
    const from = new Date(to)
    from.setDate(from.getDate()-(days-1))
    return { from, to }
  }
  return [
    { key:'7d', range: mk(7) },
    { key:'30d', range: mk(30) },
    { key:'3m', range: mk(90) },
    { key:'lastm', range: { from: new Date(y.getFullYear(), y.getMonth()-1, 1), to: new Date(y.getFullYear(), y.getMonth(), 0) } },
    { key:'6m', range: mk(180) },
    { key:'1y', range: mk(365) },
  ]
}

export async function prefetchPerformanceSnapshot(opts?: { force?: boolean }): Promise<PerformanceSnapshot | null>{
  if(typeof window === 'undefined') return null
  const existing = getPerformanceSnapshot()
  if(existing && !opts?.force && Date.now() - existing.ts < SNAPSHOT_TTL_MS){
    return existing
  }
  const websites = getWebsites()
  if(!websites.length) return null
  const end = yesterday()
  const start = new Date(end)
  start.setDate(start.getDate()-27)
  const { start: gStart, end: gEnd } = ensureRangeWithinGsc(start, end)
  const startISO = fmtISO(gStart)
  const endISO = fmtISO(gEnd)
  const days = Math.max(1, Math.round((gEnd.getTime()-gStart.getTime())/86400000)+1)
  const prevEnd = new Date(gStart); prevEnd.setDate(prevEnd.getDate()-1)
  const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate()-(days-1))
  const pStart = fmtISO(prevStart)
  const pEnd = fmtISO(prevEnd)

  const data: Record<string, PerformanceSiteSnapshot> = {}

  for(const site of websites){
    const integ = getIntegration(site.id)
    const item: PerformanceSiteSnapshot = {
      site,
      integ,
      points: [],
      totals: { clicks:0, impressions:0, ctr:0, position:0 },
      prev: { clicks:0, impressions:0, ctr:0, position:0 },
      ga4: { sessions:0, channels:{} },
      queries: [],
      queriesClicks: 0,
      errors: {}
    }
    if(integ.gscSite){
      try{
        const current = await fetchJson(fetch(`/api/google/gsc/search?site=${encodeURIComponent(integ.gscSite)}&start=${startISO}&end=${endISO}`))
        const prev = await fetchJson(fetch(`/api/google/gsc/search?site=${encodeURIComponent(integ.gscSite)}&start=${pStart}&end=${pEnd}`))
        const curRows: any[] = current.rows || []
        const prevRows: any[] = prev.rows || []
        item.points = curRows.map((row:any)=> ({
          date: row.keys?.[0],
          clicks: Number(row.clicks||0),
          impressions: Number(row.impressions||0),
          ctr: Math.round(Number(row.ctr||0)*1000)/10,
          position: Math.round(Number(row.position||0)*10)/10
        }))
        item.totals.clicks = sumRows(curRows, 'clicks')
        item.totals.impressions = sumRows(curRows, 'impressions')
        item.totals.ctr = item.totals.impressions ? (item.totals.clicks / item.totals.impressions) * 100 : 0
        const totImpr = sumRows(curRows, 'impressions')
        const posWeighted = curRows.reduce((acc:number,row:any)=> acc + Number(row.position||0)*Number(row.impressions||0), 0)
        item.totals.position = totImpr ? posWeighted / Math.max(1, totImpr) : 0
        item.prev.clicks = sumRows(prevRows, 'clicks')
        item.prev.impressions = sumRows(prevRows, 'impressions')
        item.prev.ctr = item.prev.impressions ? (item.prev.clicks / item.prev.impressions) * 100 : 0
        const prevImpr = sumRows(prevRows, 'impressions')
        const prevWeighted = prevRows.reduce((acc:number,row:any)=> acc + Number(row.position||0)*Number(row.impressions||0), 0)
        item.prev.position = prevImpr ? prevWeighted / Math.max(1, prevImpr) : 0

        const currentQueries = await fetchJson(fetch(`/api/google/gsc/queries?site=${encodeURIComponent(integ.gscSite)}&start=${startISO}&end=${endISO}&rowLimit=25000`))
        const prevQueries = await fetchJson(fetch(`/api/google/gsc/queries?site=${encodeURIComponent(integ.gscSite)}&start=${pStart}&end=${pEnd}&rowLimit=25000`))
        const prevMap = new Map<string, any>((prevQueries.rows||[]).map((r:any)=> [r.keys?.[0], r]))
        const list = (currentQueries.rows||[]).map((r:any)=>{
          const key = r?.keys?.[0]
          const prior = prevMap.get(key) || {}
          return {
            query: key,
            clicks: Number(r.clicks||0),
            impressions: Number(r.impressions||0),
            position: Number(r.position||0),
            deltaClicks: Number(r.clicks||0) - Number(prior.clicks||0),
            deltaImpressions: Number(r.impressions||0) - Number(prior.impressions||0),
            deltaPosition: prior.position!==undefined ? Number(r.position||0) - Number(prior.position||0) : 0
          }
        })
        list.sort((a: any, b: any)=> (Number(b.clicks||0)) - (Number(a.clicks||0)))
        item.queries = list
        item.queriesClicks = list.reduce((acc: number, row: any)=> acc + Number(row.clicks||0), 0)
      }catch(err:any){
        item.errors = { ...(item.errors||{}), gsc: 'GSC fetch failed', gscText: err?.message }
      }
    }
    if(integ.ga4Property){
      try{
        const ga4 = await fetchJson(fetch('/api/google/ga4/acquisition', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: integ.ga4Property, start: startISO, end: endISO }) }))
        const rows: any[] = ga4.rows || []
        const channels: Record<string, number> = {}
        rows.forEach(r=>{
          const name = r.dimensionValues?.[0]?.value || 'Other'
          const value = Number(r.metricValues?.[0]?.value||0)
          channels[name] = (channels[name]||0) + value
        })
        item.ga4.channels = channels
        item.ga4.sessions = Object.values(channels).reduce((acc:number,val:number)=> acc + Number(val||0), 0)
      }catch(err:any){
        item.errors = { ...(item.errors||{}), ga4: err?.message || 'GA4 fetch failed' }
      }
    }
    data[site.id] = item
  }

  const snapshot: PerformanceSnapshot = {
    ts: Date.now(),
    ver: PERFORMANCE_SNAPSHOT_VERSION,
    range: { from: startISO, to: endISO },
    data
  }
  writeJSON('performance:snapshot', snapshot)
  emitSnapshotUpdate({ type: 'performance', meta: { ts: snapshot.ts } })
  return snapshot
}

export async function prefetchKeywordsSnapshots(opts?: { force?: boolean; siteIds?: string[] }): Promise<Record<string, KeywordSnapshot>>{
  const result: Record<string, KeywordSnapshot> = {}
  if(typeof window === 'undefined') return result
  const websites = opts?.siteIds ? getWebsites().filter(w=> opts.siteIds?.includes(w.id)) : getWebsites()
  for(const site of websites){
    const existing = getKeywordSnapshot(site.id)
    if(existing && !opts?.force && Date.now() - existing.ts < SNAPSHOT_TTL_MS) continue
    try{
      const res = await fetch(`/api/keywords?siteId=${encodeURIComponent(site.id)}`)
      if(!res.ok) continue
      const json = await res.json().catch(()=>null)
      const list = json?.ok && Array.isArray(json.data) ? json.data : []
      const snapshot: KeywordSnapshot = { ts: Date.now(), ver: KEYWORDS_SNAPSHOT_VERSION, siteId: site.id, list }
      writeJSON(`keywords:snapshot:${site.id}`, snapshot)
      result[site.id] = snapshot
      emitSnapshotUpdate({ type: 'keywords', meta: { siteId: site.id, ts: snapshot.ts } })
    }catch{}
  }
  return result
}

export { SNAPSHOT_EVENT_NAME }
