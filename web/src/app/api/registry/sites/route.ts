import { sqlCacheGet, sqlCacheSet } from '@/lib/sql-cache'

export const runtime = 'nodejs'

const KEY = 'registry:sites'

export async function GET(){
  const s = await sqlCacheGet<any[]>(KEY)
  return new Response(JSON.stringify({ ok:true, sites: s||[] }), { status:200, headers:{'content-type':'application/json'} })
}

export async function POST(req: Request){
  try{
    const { sites } = await req.json()
    if(!Array.isArray(sites)) return new Response('Invalid payload', { status:400 })
    await sqlCacheSet<any[]>(KEY, sites)
    return new Response(JSON.stringify({ ok:true }), { status:200, headers:{'content-type':'application/json'} })
  }catch(e:any){ return new Response(String(e?.message||'registry error'), { status:500 }) }
}
