import { auth } from '@/lib/auth'
import { cached } from '@/lib/cache'

export async function GET(req: Request){
  const { searchParams } = new URL(req.url)
  const site = searchParams.get('site')
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const rowLimit = Number(searchParams.get('rowLimit')||'1000')
  if(!site || !start || !end) return new Response('Missing params', { status: 400 })
  const session = await auth()
  if(!session) return new Response('Unauthorized', { status: 401 })
  // @ts-ignore
  const token = session.access_token as string | undefined
  if(!token) return new Response('No token', { status: 401 })
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`
  const body = { startDate: start, endDate: end, dimensions: ["page"], rowLimit }
  const email = (session as any)?.user?.email || 'anon'
  const key = `gsc:pages:${email}:${site}:${start}:${end}:${rowLimit}`
  const data = await cached(key, 43200, async()=>{
    const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if(!res.ok){ const text = await res.text(); throw new Error(text) }
    return res.json()
  })
  return Response.json(data as any)
}

