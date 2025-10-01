import { auth } from '@/lib/auth'
import { clampRangeByDays, getMaxDaysForEmail } from '@/lib/plan'

export async function GET(req: Request){
  const { searchParams } = new URL(req.url)
  const site = searchParams.get('site')
  let start = searchParams.get('start')
  const end = searchParams.get('end')
  const email = searchParams.get('email')||''
  if(!site || !start || !end) return new Response('Missing params', { status: 400 })
  // Plan enforcement
  const maxDays = await getMaxDaysForEmail(email||undefined)
  start = clampRangeByDays(start, end, maxDays)
  const session = await auth()
  if(!session) return new Response('Unauthorized', { status: 401 })
  // @ts-ignore
  const token = session.access_token as string | undefined
  if(!token) return new Response('No token', { status: 401 })
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`
  const body = { startDate: start, endDate: end, dimensions: ["date"], rowLimit: 10000 }
  const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if(!res.ok){
    const text = await res.text()
    return new Response(text, { status: res.status })
  }
  const data = await res.json()
  return Response.json(data)
}
