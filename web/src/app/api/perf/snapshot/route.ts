import { sqlCacheGet, sqlCacheSet } from '@/lib/sql-cache'
import { clampRangeByDays, getMaxDaysForEmail } from '@/lib/plan'

export const runtime = 'nodejs'

type Point = { date: string; clicks: number; impressions: number; ctr: number; position: number }
type Snapshot = {
  ts: number
  ver: string
  siteId: string
  range: { start: string; end: string }
  gsc?: {
    points: Point[]
    totals: { clicks: number; impressions: number; ctr: number; position: number }
    prev: { clicks: number; impressions: number; ctr: number; position: number }
  }
  ga4?: {
    sessions: number
    sessionsPrev: number
    channels: Record<string, number>
    users?: number
    devices?: Record<string, number>
  }
}

function keyOf(siteId: string, start: string, end: string){ return `perf:snapshot:${siteId}:${start}:${end}` }

export async function GET(req: Request){
  const url = new URL(req.url)
  const siteId = url.searchParams.get('siteId')||''
  const gsc = url.searchParams.get('gsc')||''
  const ga4 = url.searchParams.get('ga4')||''
  let start = url.searchParams.get('start')||''
  const end = url.searchParams.get('end')||''
  const email = url.searchParams.get('email')||''
  const internal = url.searchParams.get('internal')==='1'
  if(!siteId || !start || !end) return new Response('Missing params', { status: 400 })
  // Plan enforcement (server-side)
  let maxDays = Infinity
  if(!internal){
    maxDays = await getMaxDaysForEmail(email||undefined)
  }
  // Clamp start if request exceeds plan allowance
  start = clampRangeByDays(start, end, maxDays)
  const snap = await sqlCacheGet<Snapshot>(keyOf(siteId, start, end))
  if(snap){
    return new Response(JSON.stringify({ ok:true, value: snap }), { status:200, headers: { 'content-type':'application/json', 'Cache-Control':'public, max-age=120, s-maxage=600' } })
  }
  // Build on miss
  const built = await buildSnapshot(req, { siteId, gsc, ga4, start, end })
  if(!built) return new Response('Unable to build', { status: 500 })
  await sqlCacheSet(keyOf(siteId, start, end), built, 6*60*60)
  return new Response(JSON.stringify({ ok:true, value: built }), { status:200, headers: { 'content-type':'application/json' } })
}

async function buildSnapshot(req: Request, p:{ siteId: string, gsc?: string, ga4?: string, start: string, end: string }): Promise<Snapshot|null>{
  try{
    const { siteId, gsc, ga4, start, end } = p
    const origin = new URL(req.url).origin
    const out: Snapshot = { ts: Date.now(), ver: 'v1', siteId, range: { start, end } }
    if(gsc){
      const cur = await fetch(`${origin}/api/google/gsc/search?site=${encodeURIComponent(gsc)}&start=${start}&end=${end}`)
      const curJ = cur.ok? await cur.json() : { rows: [] }
      const rows:any[] = curJ.rows||[]
      const pts: Point[] = rows.map((r: any)=> ({ date: r.keys?.[0], clicks: r.clicks||0, impressions: r.impressions||0, ctr: Math.round((r.ctr||0)*1000)/10, position: Math.round((r.position||0)*10)/10 }))
      const sum=(k:string)=> rows.reduce((a,r)=> a+(r[k]||0),0)
      const totImpr = sum('impressions')
      const clicks = sum('clicks')
      const posWeighted = rows.reduce((a,r)=> a + (r.position||0)*(r.impressions||0), 0)
      const totals = { clicks, impressions: totImpr, ctr: totImpr? (clicks/totImpr*100):0, position: totImpr? (posWeighted/totImpr):0 }
      // previous window matched to days
      const sd = new Date(start), ed = new Date(end)
      const days = Math.max(1, Math.round((ed.getTime()-sd.getTime())/86400000)+1)
      const prevEnd = new Date(sd); prevEnd.setDate(prevEnd.getDate()-1)
      const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate()-(days-1))
      const pS = prevStart.toISOString().slice(0,10), pE = prevEnd.toISOString().slice(0,10)
      const prev = await fetch(`${origin}/api/google/gsc/search?site=${encodeURIComponent(gsc)}&start=${pS}&end=${pE}`)
      const prevJ = prev.ok? await prev.json() : { rows: [] }
      const prow:any[] = prevJ.rows||[]
      const psum=(k:string)=> prow.reduce((a,r)=> a+(r[k]||0),0)
      const ptotImpr = psum('impressions')
      const pclicks = psum('clicks')
      const pposWeighted = prow.reduce((a,r)=> a + (r.position||0)*(r.impressions||0), 0)
      const prevTotals = { clicks: pclicks, impressions: ptotImpr, ctr: ptotImpr? (pclicks/ptotImpr*100):0, position: ptotImpr? (pposWeighted/ptotImpr):0 }
      out.gsc = { points: pts, totals, prev: prevTotals }
    }
    if(ga4){
      // Aggregate GA4 sessions per channel
      const gres = await fetch(`${origin}/api/google/ga4/acquisition`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: ga4, start, end }) })
      const gjson = await gres.json(); const rows:any[] = gjson.rows||[]
      const channels: Record<string,number> = {}
      rows.forEach((r:any)=>{ const ch=r.dimensionValues?.[0]?.value||'Other'; const v=Number(r.metricValues?.[0]?.value||0); channels[ch]=(channels[ch]||0)+v })
      const sessions = Object.values(channels).reduce((a,b)=> a + (Number(b)||0), 0)
      // previous window
      const sd = new Date(start), ed = new Date(end)
      const days = Math.max(1, Math.round((ed.getTime()-sd.getTime())/86400000)+1)
      const prevEnd = new Date(sd); prevEnd.setDate(prevEnd.getDate()-1)
      const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate()-(days-1))
      const pS = prevStart.toISOString().slice(0,10), pE = prevEnd.toISOString().slice(0,10)
      const gresP = await fetch(`${origin}/api/google/ga4/acquisition`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: ga4, start: pS, end: pE }) })
      const gjsonP = await gresP.json(); const rowsP:any[] = gjsonP.rows||[]
      let sessionsPrev = 0; rowsP.forEach((r:any)=>{ sessionsPrev += Number(r.metricValues?.[0]?.value||0) })
      // Users (newUsers by channel)
      let users = 0
      try{
        const ur = await fetch(`${origin}/api/google/ga4/user-acquisition`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: ga4, start, end }) })
        const uj = await ur.json(); const urows:any[] = uj.rows||[]
        users = urows.reduce((a:number, r:any)=> a + Number(r.metricValues?.[0]?.value||0), 0)
      }catch{}
      // Device categories (sessions by device)
      let devices: Record<string,number> = {}
      try{
        const rep = await fetch(`${origin}/api/google/ga4/report`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ property: ga4, start, end }) })
        const rj = await rep.json(); const rrows:any[] = rj.rows||[]
        rrows.forEach((row:any)=>{ const d=String(row.dimensionValues?.[0]?.value||''); const v=Number(row.metricValues?.[0]?.value||0); devices[d]=(devices[d]||0)+v })
      }catch{}
      out.ga4 = { sessions, sessionsPrev, channels, users, devices }
    }
    return out
  }catch{
    return null
  }
}
