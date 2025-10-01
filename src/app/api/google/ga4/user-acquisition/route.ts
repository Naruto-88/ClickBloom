import { auth } from '@/lib/auth'
import { cached } from '@/lib/cache'
export const runtime = 'nodejs'

export async function POST(req: Request){
  try{
    const { property, start, end } = await req.json()
    if(!property || !start || !end) return new Response('Missing params', { status: 400 })
    const session = await auth()
    if(!session) return new Response('Unauthorized', { status: 401 })
    // @ts-ignore
    const token = session.access_token as string | undefined
    if(!token) return new Response('No access token', { status: 401 })
    const url = `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`
    const body = {
      dateRanges: [{ startDate: start, endDate: end }],
      dimensions: [{ name: 'firstUserDefaultChannelGroup' }],
      metrics: [{ name: 'newUsers' }],
      limit: 1000
    }
    const email = (session as any)?.user?.email || 'anon'
    const key = `ga4:users:${email}:${property}:${start}:${end}`
    const data = await cached(key, 43200, async()=>{
      const res = await fetch(url, { method:'POST', headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if(!res.ok){ const text = await res.text(); throw new Error(text) }
      return res.json()
    })
    return Response.json(data as any)
  }catch(e:any){
    return new Response(JSON.stringify({ error: e?.message || 'GA4 user acquisition error' }), { status: 500 })
  }
}

