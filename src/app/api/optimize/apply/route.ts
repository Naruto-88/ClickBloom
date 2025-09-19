import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const { endpoint, token, pageUrl, title, seoTitle, description, canonical, schema, images, postId, htmlOnly } = await req.json()
    if(!endpoint || !token || !pageUrl){ return NextResponse.json({ ok:false, error:'Missing endpoint/token/pageUrl' }, { status: 400 }) }
    const payload: any = { token, url: pageUrl }
    if(title) payload.title = title
    if(seoTitle) payload.seoTitle = seoTitle
    if(description) payload.description = description
    if(canonical) payload.canonical = canonical
    if(schema){
      try{ payload.schema = typeof schema==='string'? JSON.parse(schema) : schema }
      catch{ payload.schema = schema } // pass through as-is if not valid JSON
    }
    if(Array.isArray(images)) payload.images = images
    if(htmlOnly) payload.htmlOnly = true
    if(postId) payload.postId = postId
    const res = await fetch(endpoint, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) })
    const text = await res.text(); let data; try{ data = JSON.parse(text) }catch{ data = { raw:text } }
    if(!res.ok) return NextResponse.json({ ok:false, error:`WP ${res.status}: ${text.slice(0,200)}` }, { status: res.status })
    return NextResponse.json({ ok:true, data })
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message || 'apply failed' }, { status: 500 }) }
}
