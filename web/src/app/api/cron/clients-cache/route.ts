import crypto from 'crypto'

export const runtime = 'nodejs'

type Snapshot = { ts: number, rows: any[] }

// In-memory fallback (per instance)
const mem: Map<string, Snapshot> = (global as any).__clients_cache_mem || new Map<string, Snapshot>()
;(global as any).__clients_cache_mem = mem

function hasUpstash(){
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

async function redisSet(key: string, value: Snapshot, ttlSeconds?: number){
  if(!hasUpstash()){ mem.set(key, value); return }
  const base = process.env.UPSTASH_REDIS_REST_URL as string
  const token = process.env.UPSTASH_REDIS_REST_TOKEN as string
  const body = { command: ["SET", key, JSON.stringify(value), ...(ttlSeconds? ["EX", String(ttlSeconds)] : []) ] }
  await fetch(base, { method:'POST', headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' }, body: JSON.stringify(body) })
}

function verifySignature(secret: string, rawBody: string, sigHeader?: string|null){
  if(!sigHeader) return false
  const h = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(sigHeader))
}

export async function POST(req: Request){
  try{
    const secret = process.env.CRON_SIGNING_SECRET || ''
    if(!secret) return new Response('Missing CRON_SIGNING_SECRET', { status: 500 })
    const raw = await req.text()
    const sig = req.headers.get('x-signature')
    if(!verifySignature(secret, raw, sig)) return new Response('Invalid signature', { status: 401 })
    const body = JSON.parse(raw)
    const snapshots = body?.snapshots as Record<string, Snapshot>
    const ttlSeconds = Number(body?.ttlSeconds)||0
    if(!snapshots || typeof snapshots!=='object') return new Response('Missing snapshots', { status: 400 })
    const entries = Object.entries(snapshots)
    for(const [key, snap] of entries){
      if(!key || !snap || !Array.isArray(snap.rows) || !snap.ts) continue
      await redisSet(key, snap, ttlSeconds||undefined)
    }
    return Response.json({ ok:true, stored: entries.length })
  }catch(e:any){ return new Response(String(e?.message||'cron cache error'), { status: 500 }) }
}

