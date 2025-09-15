import { NextRequest, NextResponse } from 'next/server'
import { load } from 'cheerio'
import OpenAI from 'openai'

export const runtime = 'nodejs'

async function extract(url: string){
  const res = await fetch(url, { headers: { 'user-agent':'Mozilla/5.0 (compatible; ClickBloom/1.0)' } })
  const html = await res.text()
  const $ = load(html)
  const title = $('title').first().text().trim()
  const meta = $('meta[name="description"]').attr('content')||''
  const h1 = $('h1').first().text().trim()
  const text = $('body').text().replace(/\s+/g,' ').trim().slice(0, 4000)
  return { title, meta, h1, text }
}

export async function POST(req: NextRequest){
  try{
    const { url, keywords, schemaType, apiKey: bodyKey, model: bodyModel } = await req.json()
    if(!url) return NextResponse.json({ ok:false, error:'Missing url' }, { status: 400 })
    const headerKey = req.headers.get('x-openai-key') || undefined
    const apiKey = bodyKey || headerKey || process.env.OPENAI_API_KEY
    if(!apiKey) return NextResponse.json({ ok:false, error:'Missing API key (provide in body as apiKey or set OPENAI_API_KEY)' }, { status: 400 })
    const openai = new OpenAI({ apiKey })
    const ctx = await extract(url)
    const prompt = `Generate valid JSON-LD ${schemaType||'Article'} schema for the following page. Only return JSON.
Include headline, description, mainEntityOfPage, datePublished if obvious, author or organization if deducible, and url.
If you are unsure of a field, omit it.
Primary keyword(s): ${(Array.isArray(keywords)?keywords:[]).join(', ')||'N/A'}
Title: ${ctx.title}
H1: ${ctx.h1}
Meta: ${ctx.meta}
Content sample: ${ctx.text}`
    const r = await openai.chat.completions.create({ model: bodyModel || process.env.OPENAI_MODEL || 'gpt-4o-mini', messages:[{role:'user', content:prompt}], temperature:0.3, response_format:{ type:'json_object' as const } })
    const json = r.choices?.[0]?.message?.content || '{}'
    return NextResponse.json({ ok:true, schema: json })
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message || 'schema failed' }, { status: 500 }) }
}

