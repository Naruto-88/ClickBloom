import { auth } from '@/lib/auth'
import { clampRangeByDays, getMaxDaysForEmail } from '@/lib/plan'

export async function GET(req: Request){
  const { searchParams } = new URL(req.url)
  const site = searchParams.get('site')
  let start = searchParams.get('start')
  const end = searchParams.get('end')
  const email = searchParams.get('email')||''
  if(!site || !start || !end) return new Response('Missing params', { status: 400 })
  const maxDays = await getMaxDaysForEmail(email||undefined)
  start = clampRangeByDays(start, end, maxDays)
  const session = await auth()
  if(!session) return new Response('Unauthorized', { status: 401 })
  // @ts-ignore
  const token = session.access_token as string | undefined
  if(!token) return new Response('No token', { status: 401 })
  const dimsRaw = searchParams.get('dimensions') || 'query'
  const dimensions = dimsRaw.split(',').map(d=>d.trim()).filter(Boolean)
  const rowLimit = Number(searchParams.get('rowLimit') || '1000')
  const includeRegex = searchParams.get('includeRegex') || undefined
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`
  const body: any = { startDate: start, endDate: end, dimensions: dimensions.length ? dimensions : ['query'], rowLimit }
  if(includeRegex){
    body.dimensionFilterGroups = [{ filters: [{ dimension: 'query', operator: 'includingRegex', expression: includeRegex }] }]
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if(!res.ok){ const text = await res.text(); return new Response(text, { status: res.status }) }
  const data = await res.json()
  return Response.json(data)
}
