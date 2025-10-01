import { auth } from '@/lib/auth'
import { cached } from '@/lib/cache'
export const runtime = 'nodejs'

export async function POST(req: Request){
  try{
    const { property, start, end, prevStart, prevEnd } = await req.json()
    if(!property || !start || !end) return new Response('Missing params', { status: 400 })
    const session = await auth()
    if(!session) return new Response('Unauthorized', { status: 401 })
    // @ts-ignore
    const token = session.access_token as string | undefined
    if(!token) return new Response('No access token', { status: 401 })
    const url = `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`
    const dateRanges: Array<{ startDate:string, endDate:string, name?:string }> = [{ startDate: start, endDate: end, name: 'current' }]
    if(prevStart && prevEnd){ dateRanges.push({ startDate: prevStart, endDate: prevEnd, name: 'previous' }) }
    const body = {
      dateRanges,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
      limit: 1000
    }
    const email = (session as any)?.user?.email || 'anon'
    const key = `ga4:acq:${email}:${property}:${start}:${end}:${prevStart||''}:${prevEnd||''}`
    const data = await cached(key, 43200, async()=>{
      const res = await fetch(url, { method:'POST', headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if(!res.ok){ const text = await res.text(); throw new Error(text) }
      return res.json()
    })
    return Response.json(data as any)
  }catch(e:any){
    return new Response(JSON.stringify({ error: e?.message || 'GA4 acquisition error' }), { status: 500 })
  }
}

