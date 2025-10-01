import { auth } from '@/lib/auth'
import { clampRangeByDays, getMaxDaysForEmail } from '@/lib/plan'
export const runtime = 'nodejs'

export async function POST(req: Request){
  try{
    const { property, start, end, email: emailBody } = await req.json()
    if(!property || !start || !end) return new Response('Missing params', { status: 400 })
    const session = await auth()
    if(!session) return new Response('Unauthorized', { status: 401 })
    // @ts-ignore
    const token = session.access_token as string | undefined
    if(!token) return new Response('No access token', { status: 401 })
    const maxDays = await getMaxDaysForEmail((emailBody||'')||undefined)
    const clampedStart = clampRangeByDays(start, end, maxDays)
    const url = `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`
    const body = {
      dateRanges: [{ startDate: clampedStart, endDate: end }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
      limit: 1000
    }
    const res = await fetch(url, { method:'POST', headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if(!res.ok){ const text = await res.text(); return new Response(JSON.stringify({ error:text }), { status: res.status }) }
    const data = await res.json()
    return Response.json(data)
  }catch(e:any){
    return new Response(JSON.stringify({ error: e?.message || 'GA4 acquisition error' }), { status: 500 })
  }
}

