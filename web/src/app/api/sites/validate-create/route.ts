import { sqlCacheGet } from '@/lib/sql-cache'
import { getSiteLimitForEmail } from '@/lib/plan'

export const runtime = 'nodejs'

export async function POST(req: Request){
  try{
    const { email } = await req.json()
    if(!email) return new Response('Missing email', { status:400 })
    const limit = await getSiteLimitForEmail(email)
    const reg = await sqlCacheGet<any[]>('registry:sites') || []
    const count = reg.filter((s:any)=> String(s.ownerEmail||'').toLowerCase()===email.toLowerCase()).length
    if(count >= limit){
      return new Response(JSON.stringify({ ok:false, error:`Plan limit reached (${count}/${limit}).` }), { status: 403, headers:{'content-type':'application/json'} })
    }
    return new Response(JSON.stringify({ ok:true, remaining: Math.max(0, limit-count-1) }), { status:200, headers:{'content-type':'application/json'} })
  }catch(e:any){ return new Response(String(e?.message||'validate error'), { status:500 }) }
}

