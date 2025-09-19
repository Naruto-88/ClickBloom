import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest){
  try{
    const { searchParams } = new URL(req.url)
    const endpoint = searchParams.get('endpoint') || ''
    const token = searchParams.get('token') || ''
    const pageUrl = searchParams.get('pageUrl') || ''
    const postId = searchParams.get('postId') || ''
    if(!endpoint || !token){ return NextResponse.json({ ok:false, error:'Missing endpoint or token' }, { status:400 }) }
    const url = new URL(endpoint)
    // force /read path
    url.pathname = '/wp-json/clickbloom/v1/read'
    if(pageUrl) url.searchParams.set('url', pageUrl)
    if(postId) url.searchParams.set('postId', String(postId))
    url.searchParams.set('token', token)
    const res = await fetch(url.toString(), { method:'GET' })
    const text = await res.text(); let data: any
    try{ data = JSON.parse(text) }catch{ data = { raw:text } }
    if(!res.ok){ return NextResponse.json({ ok:false, error:`WP ${res.status}: ${text.slice(0,200)}` }, { status: res.status }) }
    return NextResponse.json({ ok:true, data })
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message || 'read failed' }, { status:500 }) }
}

