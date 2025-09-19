import { NextRequest, NextResponse } from 'next/server'
import { load } from 'cheerio'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const { url, alts } = await req.json()
    if(!url) return NextResponse.json({ ok:false, error:'Missing url' }, { status: 400 })
    const res = await fetch(url, { headers:{ 'user-agent':'Mozilla/5.0 (compatible; ClickBloom/preview)' } })
    if(!res.ok){ return NextResponse.json({ ok:false, error:`Fetch ${res.status}` }, { status: res.status }) }
    const html = await res.text()
    const $ = load(html)
    const map: Record<string,string> = (alts && typeof alts==='object')? alts : {}
    const setAlt = (img:any, alt:string)=>{ if(!alt) return; img.attr('alt', alt) }
    const byStem: Record<string,string> = {}
    const stem = (u:string)=>{ try{ const p=new URL(u, url); const b=p.pathname.split('/').pop()||''; return b.replace(/-[0-9]+x[0-9]+(?=\.[a-z0-9]+$)/i,'').replace(/\.[a-z0-9]+$/i,'') }catch{ return '' } }
    Object.entries(map).forEach(([k,v])=>{ const s=stem(k); if(s) byStem[s]=v })
    $('img').each((_,el)=>{
      const img = $(el)
      const src = img.attr('src')||img.attr('data-src')||img.attr('data-lazy-src')||img.attr('data-original')||''
      if(!src) return
      const ab = (()=>{ try{ return new URL(src, url).toString() }catch{ return src } })()
      if(map[ab]) return setAlt(img, map[ab])
      const s = stem(ab); if(s && byStem[s]) return setAlt(img, byStem[s])
    })
    // Return HTML string with injected alts
    return NextResponse.json({ ok:true, html: $.html() })
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'preview failed' }, { status: 500 }) }
}

