import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { load } from 'cheerio'
import {
  buildMetaRecord,
  metaCacheKey,
  readMetaCache,
  writeMetaCache,
  readExtractCache,
  writeExtractCache,
  type ExtractCacheValue
} from '@/lib/metaCache'

export const runtime = 'nodejs'

async function extract(url: string, bypassCache = false): Promise<ExtractCacheValue>{
  if(!bypassCache){
    const cached = await readExtractCache(url)
    if(cached) return cached
  }
  const res = await fetch(url, { headers: { 'user-agent':'Mozilla/5.0 (compatible; ClickBloom/1.0)' } })
  if(!res.ok){
    throw new Error(`Failed to fetch URL (status ${res.status})`)
  }
  const html = await res.text()
  const $ = load(html)
  const title = $('title').first().text().trim()
  const meta = $('meta[name="description"]').attr('content') || ''
  const text = $('body').text().replace(/\s+/g,' ').trim().slice(0, 4000)
  const record = await writeExtractCache(url, { title, meta, text })
  return record
}

function keywordList(input: unknown){
  if(Array.isArray(input)) return input.map(x => String(x)).filter(Boolean)
  if(typeof input === 'string' && input.trim()) return [input.trim()]
  return []
}

export async function POST(req: NextRequest){
  try{
    const { url, keywords, apiKey: bodyKey, model: bodyModel } = await req.json()
    if(!url) return NextResponse.json({ ok:false, error:'Missing url' }, { status: 400 })

    const headerKey = req.headers.get('x-openai-key') || undefined
    const apiKey = bodyKey || headerKey || process.env.OPENAI_API_KEY
    if(!apiKey) return NextResponse.json({ ok:false, error:'Missing API key (provide in body as apiKey or set OPENAI_API_KEY)' }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const bypass = searchParams.get('refresh') === '1' || req.headers.get('x-cache-bypass') === '1'

    const kw = keywordList(keywords)
    const model = bodyModel || process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const cacheKey = metaCacheKey(url, kw, model)

    if(!bypass){
      const cached = await readMetaCache(cacheKey)
      if(cached){
        const res = NextResponse.json({ ok:true, meta: cached.meta, cached:true, cachedAt: cached.createdAt })
        res.headers.set('x-cache', 'hit')
        res.headers.set('x-cache-model', cached.model)
        res.headers.set('x-cache-created', new Date(cached.createdAt).toISOString())
        return res
      }
    }

    const ctx = await extract(url, bypass)

    const prompt = `Write an SEO meta description for the page below.\nRules (2025): 150-160 characters; compelling and specific; match the dominant search intent; include the primary keyword once near the beginning in natural language; highlight a clear benefit or differentiator; add a subtle CTA; avoid quotes, emojis, and keyword stuffing; no line breaks.\nPrimary keyword(s): ${kw.join(', ') || 'N/A'}\nTitle: ${ctx.title}\nExisting meta: ${ctx.meta || '-'}\nContent sample: ${ctx.text}`

    const openai = new OpenAI({ apiKey })
    const response = await openai.chat.completions.create({
      model,
      messages: [ { role:'user', content: prompt } ],
      temperature: 0.4
    })
    const out = response.choices?.[0]?.message?.content?.trim()?.replace(/^\"|\"$/g,'') || ''

    const record = buildMetaRecord(out, model, prompt, ctx)
    await writeMetaCache(cacheKey, record)

    const res = NextResponse.json({ ok:true, meta: out, cached:false, cachedAt: record.createdAt })
    res.headers.set('x-cache', bypass ? 'refresh' : 'miss')
    res.headers.set('x-cache-model', model)
    return res
  }catch(e: any){
    return NextResponse.json({ ok:false, error: e?.message || 'meta failed' }, { status: 500 })
  }
}
