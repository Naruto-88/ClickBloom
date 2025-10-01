import { sqlCacheGet, sqlCacheSet } from '@/lib/sql-cache'

export const runtime = 'nodejs'

type Plan = { name: 'basic'|'pro'|'agency', limits?: { sites?: number, ranges?: number } }

function key(email:string){ return `plan:${email.toLowerCase()}` }

export async function GET(req: Request){
  const url = new URL(req.url)
  const email = url.searchParams.get('email')||''
  if(!email) return new Response('Missing email', { status:400 })
  const p = await sqlCacheGet<Plan>(key(email))
  return new Response(JSON.stringify({ ok:true, plan: p||null }), { status:200, headers:{'content-type':'application/json'} })
}

export async function POST(req: Request){
  try{
    const { email, plan } = await req.json()
    if(!email || !plan) return new Response('Missing email/plan', { status:400 })
    const p: Plan = typeof plan==='string'? { name: plan } : plan
    await sqlCacheSet(key(email), p)
    return new Response(JSON.stringify({ ok:true }), { status:200, headers:{'content-type':'application/json'} })
  }catch(e:any){ return new Response(String(e?.message||'plan error'), { status:500 }) }
}

