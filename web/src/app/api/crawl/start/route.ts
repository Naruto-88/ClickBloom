import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { load as loadHtml } from 'cheerio'
import { spendCrawlCreditsByKey } from '@/lib/license'

export const runtime = 'nodejs'

type PageResult = { url: string, title?: string, meta?: string, h1?: string, words?: number, schemaCount?: number, canonical?: string, images?: { total:number, withAlt:number } }

function sameHost(a:string, b:string){ try{ return new URL(a).hostname === new URL(b).hostname }catch{ return false } }
function norm(u:string){ try{ const url = new URL(u); url.hash=''; return url.toString() }catch{ return u } }

async function fetchText(url:string){ const r = await fetch(url, { headers:{ 'user-agent':'Mozilla/5.0 (compatible; SEO-Tool/1.0)' } }); if(!r.ok) throw new Error(String(r.status)); return r.text() }

async function crawlSite(startUrl:string, maxPages:number, maxDepth:number){
  const origin = new URL(startUrl).origin
  const seen = new Set<string>(); const results: PageResult[] = []
  const q: Array<{ url:string, depth:number }> = [{ url: startUrl, depth:0 }]
  while(q.length>0 && results.length<maxPages){
    const batch = q.splice(0, 4) // simple concurrency bucket
    await Promise.all(batch.map(async item =>{
      if(seen.has(item.url) || item.depth>maxDepth || results.length>=maxPages) return
      seen.add(item.url)
      try{
        const html = await fetchText(item.url)
        const $ = loadHtml(html)
        const title = $('title').first().text().trim()
        const meta = $('meta[name="description"]').attr('content')||''
        const h1 = $('h1').first().text().trim()
        const text = $('body').text().replace(/\s+/g,' ').trim(); const words = text? text.split(/\s+/).length: 0
        const schemaCount = $('script[type="application/ld+json"]').length
        const canonical = $('link[rel="canonical"]').attr('href')||''
        const totalImgs = $('img').length; let withAlt=0; $('img').each((_,el)=>{ if($(el).attr('alt')) withAlt++ })
        results.push({ url:item.url, title, meta, h1, words, schemaCount, canonical, images:{ total: totalImgs, withAlt } })
        $('a[href]').each((_,el)=>{
          try{
            const href = $(el).attr('href')||''; if(!href) return
            const abs = new URL(href, item.url).toString()
            if(!sameHost(abs, origin)) return
            const u = norm(abs)
            if(!seen.has(u)) q.push({ url:u, depth:item.depth+1 })
          }catch{}
        })
      }catch{}
    }))
  }
  return results
}

export async function POST(req: NextRequest){
  try{
    const { siteId, url, key, maxPages=200, maxDepth=3 } = await req.json()
    if(!siteId || !url) return NextResponse.json({ ok:false, error:'Missing siteId or url' }, { status:400 })
    const dir = path.join(process.cwd(), 'web-data', 'crawls'); await fs.mkdir(dir, { recursive:true })
    // Spend credits if key provided and license has finite credits
    if(key){
      const spend = Math.min(Number(maxPages)||200, 200)
      const out = await spendCrawlCreditsByKey(String(key), spend)
      if(!out.ok) return NextResponse.json({ ok:false, error: out.error||'Insufficient credits' }, { status:402 })
    }
    const pages = await crawlSite(String(url), Math.min(Number(maxPages)||200, 200), Math.min(Number(maxDepth)||3, 5))
    const filename = path.join(dir, `${siteId}.json`)
    await fs.writeFile(filename, JSON.stringify({ siteId, url, crawledAt: new Date().toISOString(), count: pages.length, pages }, null, 2), 'utf8')
    return NextResponse.json({ ok:true, count: pages.length })
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'crawl failed' }, { status:500 }) }
}

