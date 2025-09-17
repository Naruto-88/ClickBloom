import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const { endpoint, token, pageUrl, postId, only } = await req.json()
    if(!endpoint || !token || (!pageUrl && !postId)){
      return NextResponse.json({ ok:false, error:'Missing endpoint/token/pageUrl|postId' }, { status: 400 })
    }
    const body:any = { token }
    if(pageUrl) body.url = pageUrl
    if(postId) body.postId = postId
    if(only) body.only = only
    const res = await fetch(`${String(endpoint).replace(/\/update$/, '')}/revert`, {
      method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)
    })
    const text = await res.text(); let data:any; try{ data = JSON.parse(text) }catch{ data = { raw:text } }
    if(!res.ok) return NextResponse.json({ ok:false, error:`WP ${res.status}`, data }, { status: res.status })
    return NextResponse.json({ ok:true, data })
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'revert failed' }, { status: 500 }) }
}

