import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { load } from 'cheerio'
export const runtime = 'nodejs'

async function extractFromUrl(url?: string){
  if(!url) return {}
  try{
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; SEO-Tool/1.0)' } })
    const html = await res.text()
    const $ = load(html)
    const title = $('title').first().text().trim() || ''
    const h1 = $('h1').first().text().trim() || ''
    const desc = $('meta[name="description"]').attr('content') || ''
    return { title, h1, description: desc }
  }catch{ return {} }
}

export async function POST(req: NextRequest){
  try{
    const { url, keywords } = await req.json()
    const apiKey = process.env.OPENAI_API_KEY
    if(!apiKey) return NextResponse.json({ ok:false, error:'Missing OPENAI_API_KEY' }, { status: 500 })

    const context = await extractFromUrl(url)
    const openai = new OpenAI({ apiKey })
    const sys = `You are an expert SEO title generator. Output strictly JSON: { ideas: string[] }.
Rules: 7 unique, high-quality page title ideas that follow SEO best practices.
- 50-60 characters ideal (hard cap 65, min 30)
- Natural Title Case, no ALL CAPS
- Include primary keyword where appropriate
- Avoid truncation, clickbait, or emoji
- Be specific and readable; avoid duplicates`;
    const user = `Page URL: ${url||'N/A'}
Primary keyword(s): ${(keywords||[]).join(', ')||'N/A'}
Existing title: ${context.title||'N/A'}
H1: ${context.h1||'N/A'}
Meta: ${context.description||'N/A'}
Return only JSON.`
    const resp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [ { role:'system', content: sys }, { role:'user', content: user } ],
      temperature: 0.4
    })
    const content = resp.choices?.[0]?.message?.content || '{"ideas":[]}'
    const data = JSON.parse(content)
    let ideas: string[] = Array.isArray(data.ideas) ? data.ideas.slice(0,7) : []
    // Final clamp: length and cleanup
    ideas = ideas.map((s:string)=> (s||'').trim().replace(/\s+/g,' ').slice(0,65))
    return NextResponse.json({ ok:true, ideas })
  }catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message || 'AI titles failed' }, { status: 500 })
  }
}

