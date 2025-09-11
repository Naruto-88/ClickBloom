import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const body = await req.json()
    const apiKey = process.env.OPENAI_API_KEY
    if(!apiKey) return NextResponse.json({ ok:false, error:'Missing OPENAI_API_KEY' }, { status: 500 })
    const openai = new OpenAI({ apiKey })

    const kind = String(body.kind||'gsc') as 'gsc'|'ga4'|'both'
    const siteName = body.site?.name || 'Site'
    const siteUrl = body.site?.url || ''
    const period = body.period || 'Selected period'
    const totals = body.totals || {}
    const prev = body.prev || {}
    const queries: Array<any> = Array.isArray(body.queries)? body.queries.slice(0,15) : []
    const channels = body.channels || {}

    const bullets: string[] = []
    const mk = (n:any)=> (typeof n==='number'? n: Number(n||0))
    const deltaPct = (c:number, p:number)=> p>0? (((c-p)/p)*100): 0
    const clicksDelta = deltaPct(mk(totals.clicks||0), mk(prev.clicks||0))
    const imprDelta = deltaPct(mk(totals.impressions||0), mk(prev.impressions||0))
    const posDelta = (mk(totals.position||0) - mk(prev.position||0)) // lower is better

    const sys = `You are an SEO analyst. Produce a concise, actionable summary of website performance. Use plain text with short bullets.`
    const prompt = [
      `Website: ${siteName} ${siteUrl? '('+siteUrl+')':''}`,
      `Section: ${kind.toUpperCase()}`,
      `Period: ${period} (vs previous matched period)`,
      `Totals: clicks=${totals.clicks||0}, impressions=${totals.impressions||0}, avg_position=${typeof totals.position==='number'? totals.position.toFixed(1): totals.position||0}`,
      `Previous: clicks=${prev.clicks||0}, impressions=${prev.impressions||0}, avg_position=${typeof prev.position==='number'? prev.position.toFixed(1): prev.position||0}`,
      `Deltas: clicks=${clicksDelta.toFixed(1)}%, impressions=${imprDelta.toFixed(1)}%, avg_position_change=${posDelta.toFixed(1)}`,
      `Top queries (clicks / impressions): ${queries.map((q:any)=> `${q.query||''} (${q.clicks||0}/${q.impressions||0})`).join(', ').slice(0,600)}`,
      `GA4 channels (sessions): ${Object.keys(channels).length? Object.entries(channels).map(([k,v])=> `${k}:${v}`).join(', ') : 'N/A'}`,
      `Output:
 - A one-paragraph overview (1–3 sentences)
 - 5–7 bullet insights (wins, drops, opportunities)
 - 3 recommended actions (very concise)
Keep it tight and skimmable. Don’t include raw JSON or code fences.`
    ].join('\n')

    const r = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [ { role:'system', content: sys }, { role:'user', content: prompt } ],
      temperature: 0.4
    })
    const summary = r.choices?.[0]?.message?.content?.trim() || ''
    return NextResponse.json({ ok:true, summary })
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message || 'ai summary failed' }, { status: 500 }) }
}

