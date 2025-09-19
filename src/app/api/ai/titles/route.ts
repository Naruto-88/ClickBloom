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
    const { url, keywords, apiKey: bodyKey, model: bodyModel } = await req.json()
    const headerKey = req.headers.get('x-openai-key') || undefined
    const apiKey = bodyKey || headerKey || process.env.OPENAI_API_KEY
    if(!apiKey) return NextResponse.json({ ok:false, error:'Missing API key (provide in body as apiKey or set OPENAI_API_KEY)' }, { status: 400 })

    const context = await extractFromUrl(url)
    const openai = new OpenAI({ apiKey })
    const sys = `You are an expert SEO title generator for 2025. Output strictly JSON: { ideas: string[] }.
Rules: Return 7 unique, high-quality page title ideas that follow modern SEO best practices.
- Length: 50–60 characters ideal (hard cap 65, min 30)
- Intent-first: reflect the user’s search intent (informational, transactional, local, etc.)
- Primary keyword: include once, preferably toward the beginning, in natural language
- Readability: Natural Title Case, no ALL CAPS, no keyword stuffing
- Specificity: use concrete modifiers (year, location, category, benefit) when relevant
- Branding: if a brand appears in the existing title/H1, place it at the end after a separator (– or |)
- Clean: avoid truncation, clickbait, excessive punctuation, brackets spam, or emoji
- Uniqueness: avoid duplicates or minor rewrites; each idea should be meaningfully different`;
    const user = `Page URL: ${url||'N/A'}
Primary keyword(s): ${(keywords||[]).join(', ')||'N/A'}
Existing title: ${context.title||'N/A'}
H1: ${context.h1||'N/A'}
Meta: ${context.description||'N/A'}
Return only JSON.`
    const resp = await openai.chat.completions.create({
      model: bodyModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
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

