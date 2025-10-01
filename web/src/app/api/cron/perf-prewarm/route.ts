import { sqlCacheSet } from '@/lib/sql-cache'

export const runtime = 'nodejs'

function rangeFromKey(key:string){
  const today = new Date(); const y=new Date(today); y.setDate(today.getDate()-1)
  const mk=(d:number)=>({ from: new Date(y.getTime()-(d-1)*86400000), to:y })
  if(key==='7d') return mk(7)
  if(key==='30d') return mk(30)
  if(key==='3m') return mk(90)
  if(key==='lastm'){ const lm=new Date(y.getFullYear(), y.getMonth()-1, 1); return { from: lm, to: new Date(y.getFullYear(), y.getMonth(), 0) } }
  return mk(30)
}

export async function POST(req: Request){
  const origin = new URL(req.url).origin
  const { sites, ranges=['7d','30d','lastm'] } = await req.json().catch(()=>({ sites:[] })) as any
  if(!Array.isArray(sites)||sites.length===0) return new Response('No sites', { status:400 })
  const tasks: Promise<any>[] = []
  for(const s of sites){
    for(const rk of ranges){
      const r = rangeFromKey(rk)
      const start = r.from.toISOString().slice(0,10)
      const end = r.to.toISOString().slice(0,10)
      tasks.push(fetch(`${origin}/api/perf/snapshot?siteId=${encodeURIComponent(s.id)}&gsc=${encodeURIComponent(s.gscSite||'')}&start=${start}&end=${end}&internal=1`))
    }
  }
  await Promise.allSettled(tasks)
  return new Response(JSON.stringify({ ok:true }), { status:200, headers:{ 'content-type':'application/json' } })
}
