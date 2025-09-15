export const runtime = 'nodejs'

type Snapshot = { ts: number, rows: any[] }

// In-memory fallback (per server instance)
const mem: Map<string, Snapshot> = (global as any).__clients_cache_mem || new Map<string, Snapshot>()
;(global as any).__clients_cache_mem = mem

function hasUpstash(){
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

async function redisGet(key: string): Promise<Snapshot|null>{
  if(!hasUpstash()) return mem.get(key) || null
  const base = process.env.UPSTASH_REDIS_REST_URL as string
  const token = process.env.UPSTASH_REDIS_REST_TOKEN as string
  const res = await fetch(`${base}/get/${encodeURIComponent(key)}`, { headers:{ Authorization: `Bearer ${token}` } })
  if(!res.ok) return null
  const j = await res.json().catch(()=>null) as any
  const val = j?.result
  if(!val) return null
  try{ return JSON.parse(val) as Snapshot }catch{ return null }
}

async function redisSet(key: string, value: Snapshot, ttlSeconds?: number){
  if(!hasUpstash()){ mem.set(key, value); return }
  const base = process.env.UPSTASH_REDIS_REST_URL as string
  const token = process.env.UPSTASH_REDIS_REST_TOKEN as string
  const body = { command: ["SET", key, JSON.stringify(value), ...(ttlSeconds? ["EX", String(ttlSeconds)] : []) ] }
  await fetch(base, { method:'POST', headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' }, body: JSON.stringify(body) })
}

export async function GET(req: Request){
  const url = new URL(req.url)
  const key = url.searchParams.get('key') || ''
  if(!key) return new Response('Missing key', { status: 400 })
  const snap = await redisGet(key)
  if(!snap) return new Response('Not found', { status: 404 })
  return Response.json({ ok:true, value: snap })
}

export async function POST(req: Request){
  try{
    const { key, value, ttlSeconds } = await req.json()
    if(!key || !value) return new Response('Missing key/value', { status: 400 })
    await redisSet(String(key), value as Snapshot, Number(ttlSeconds)||undefined)
    return Response.json({ ok:true })
  }catch(e:any){ return new Response(String(e?.message||'cache error'), { status: 500 }) }
}

