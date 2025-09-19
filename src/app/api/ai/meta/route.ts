import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { load } from 'cheerio'

export const runtime = 'nodejs'

async function extract(url: string){
  const res = await fetch(url, { headers: { 'user-agent':'Mozilla/5.0 (compatible; ClickBloom/1.0)' } })
  const html = await res.text()
  const $ = load(html)
  const title = $('title').first().text().trim()
  const meta = $('meta[name="description"]').attr('content')||''
  const text = $('body').text().replace(/\s+/g,' ').trim().slice(0, 4000)
  return { title, meta, text }
}

export async function POST(req: NextRequest){
  try{
    const { url, keywords, apiKey: bodyKey, model: bodyModel } = await req.json()
    if(!url) return NextResponse.json({ ok:false, error:'Missing url' }, { status: 400 })
    const headerKey = req.headers.get('x-openai-key') || undefined
    const apiKey = bodyKey || headerKey || process.env.OPENAI_API_KEY
    if(!apiKey) return NextResponse.json({ ok:false, error:'Missing API key (provide in body as apiKey or set OPENAI_API_KEY)' }, { status: 400 })
    const openai = new OpenAI({ apiKey })
    const ctx = await extract(url)
    const prompt = `Write an SEO meta description for the page below.
Rules (2025): 150-160 characters; compelling and specific; match the dominant search intent; include the primary keyword once near the beginning in natural language; highlight a clear benefit or differentiator; add a subtle CTA; avoid quotes, emojis, and keyword stuffing; no line breaks.
Primary keyword(s): ${(Array.isArray(keywords)?keywords:[]).join(', ')||'N/A'}
Title: ${ctx.title}
Existing meta: ${ctx.meta||'-'}
Content sample: ${ctx.text}`
    const r = await openai.chat.completions.create({
      model: bodyModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [ { role:'user', content: prompt } ],
      temperature: 0.4
    })
    const out = r.choices?.[0]?.message?.content?.trim()?.replace(/^"|"$/g,'') || ''
    return NextResponse.json({ ok:true, meta: out })
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'meta failed' }, { status: 500 }) }
}

