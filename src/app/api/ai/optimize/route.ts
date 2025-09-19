import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
import { load } from 'cheerio'
import { seoOptimizeWithAI } from '@/lib/ai'

async function extractFromHtml(html: string){
  const $ = load(html)
  const title = $('title').first().text().trim() || undefined
  const description = $('meta[name="description"]').attr('content') || undefined
  const h1 = $('h1').first().text().trim() || undefined
  const headings: string[] = []
  $('h2, h3').each((_,el)=> { headings.push($(el).text().trim()) })
  const canonical = $('link[rel="canonical"]').attr('href') || null
  const robots = $('meta[name="robots"]').attr('content') || null
  const textSample = $('body').text().replace(/\s+/g,' ').trim().slice(0, 2000)
  const wordCount = textSample.split(/\s+/).length
  let imagesWithoutAlt = 0
  $('img').each((_,el)=> { if(!$(el).attr('alt')) imagesWithoutAlt++ })
  return { title, description, h1, headings, canonical, robots, textSample, wordCount, imagesWithoutAlt }
}

export async function POST(req: NextRequest){
  try{
    const { url, html, keywords } = await req.json()
    let extracted: any = undefined
    if(html){
      extracted = await extractFromHtml(html)
    } else if(url){
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 SEO-Tool' } })
      const body = await res.text()
      extracted = await extractFromHtml(body)
    }
    const ai = await seoOptimizeWithAI({ url, extracted, targetKeywords: keywords })
    return NextResponse.json({ ok: true, data: ai, extracted })
  }catch(err:any){
    console.error(err)
    return NextResponse.json({ ok:false, error: err?.message || 'AI error' }, { status: 500 })
  }
}
