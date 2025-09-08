import { load } from 'cheerio'
export const runtime = 'nodejs'

type Status = 'OPTIMIZED' | 'NOT_OPTIMIZED' | 'MISSING'

function scoreTitle(t?: string): Status{
  if(!t || !t.trim()) return 'MISSING'
  const len = t.trim().length
  return (len>=30 && len<=65) ? 'OPTIMIZED' : 'NOT_OPTIMIZED'
}
function scoreMeta(d?: string): Status{
  if(!d || !d.trim()) return 'MISSING'
  const len = d.trim().length
  return (len>=120 && len<=160) ? 'OPTIMIZED' : 'NOT_OPTIMIZED'
}
function scoreImageAlt(total: number, withAlt: number): Status{
  if(total===0) return 'OPTIMIZED'
  if(withAlt===0) return 'MISSING'
  const ratio = withAlt/total
  return ratio>=0.8 ? 'OPTIMIZED' : 'NOT_OPTIMIZED'
}
function scoreSchema(count: number): Status{ return count>0 ? 'OPTIMIZED' : 'MISSING' }
function scoreHeadings(h1: string|undefined, h2Count: number): Status{
  if(!h1 || !h1.trim()) return 'MISSING'
  const len = h1.trim().length
  return (len>=15 && len<=70 && h2Count>=2) ? 'OPTIMIZED' : 'NOT_OPTIMIZED'
}
function scoreContent(words: number): Status{ return words>=300 ? 'OPTIMIZED' : (words>0 ? 'NOT_OPTIMIZED' : 'MISSING') }

export async function POST(req: Request){
  try{
    const { url } = await req.json()
    if(!url) return new Response('Missing url', { status: 400 })
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; SEO-Tool/1.0)' } })
    if(!res.ok){
      const text = await res.text()
      return new Response(JSON.stringify({ ok:false, error: `Fetch ${res.status}: ${text.slice(0,200)}` }), { status: res.status })
    }
    const html = await res.text()
    const $ = load(html)
    const title = $('title').first().text()
    const meta = $('meta[name="description"]').attr('content')
    const totalImgs = $('img').length
    const images: Array<{ src: string, alt: string|null }> = []
    let withAlt = 0; $('img').each((_,el)=>{ const alt=$(el).attr('alt')||null; if(alt) withAlt++; const src=$(el).attr('src')||''; images.push({ src, alt }) })
    const schemaNodes: string[] = []
    $('script[type="application/ld+json"]').each((_,el)=>{ const t=$(el).text(); if(t) schemaNodes.push(t) })
    const schemaCount = schemaNodes.length
    const h1 = $('h1').first().text()
    const h2Count = $('h2').length
    const text = $('body').text().replace(/\s+/g,' ').trim()
    const words = text ? text.split(/\s+/).length : 0

    const issues: Array<{ id: string, label: string, status: 'OK'|'ISSUE' }>= []
    const pushIssue = (cond: boolean, id: string, label: string)=> issues.push({ id, label, status: cond? 'ISSUE' : 'OK' })
    pushIssue(!title, 'missing_title', 'Missing Title')
    pushIssue(!meta, 'missing_meta', 'Missing Meta Description')
    pushIssue(($('h1').length||0) > 1, 'duplicate_h1', 'Duplicate H1 Tags')
    pushIssue((meta||'').trim().length > 160, 'long_meta', 'Long Meta Description')
    pushIssue(!!meta && meta.trim().length < 120, 'short_meta', 'Short Meta Description')
    pushIssue(!!title && title.trim().length < 30, 'short_title', 'Short Title')
    pushIssue(!$('link[rel="canonical"]').attr('href'), 'missing_canonical', 'Missing Canonical')
    pushIssue(!!title && title.trim().length > 65, 'long_title', 'Long Title')
    const links = $('a'); let linksWithTitle=0; links.each((_,el)=>{ if($(el).attr('title')) linksWithTitle++ })
    pushIssue(links.length>0 && (linksWithTitle/links.length) < .8, 'missing_link_titles', 'Missing Link Titles')

    const totalIssues = issues.filter(i=> i.status==='ISSUE').length
    const healthScore = Math.max(0, 100 - totalIssues*10)

    const result = {
      url,
      fields: {
        titleTag: scoreTitle(title),
        metaDescription: scoreMeta(meta),
        imageAlt: scoreImageAlt(totalImgs, withAlt),
        schema: scoreSchema(schemaCount),
        headings: scoreHeadings(h1, h2Count),
        content: scoreContent(words),
      },
      issues,
      healthScore,
      details: { title, meta, totalImgs, withAlt, images, schemaCount, schemas: schemaNodes, h1, h2Count, words, canonical: $('link[rel="canonical"]').attr('href')||null }
    }
    return Response.json({ ok:true, data: result })
  }catch(e:any){
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'check failed' }), { status: 500 })
  }
}
