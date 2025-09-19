import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const { endpoint, token, images } = await req.json()
    if(!endpoint || !token || !Array.isArray(images)){
      return NextResponse.json({ ok:false, error:'Missing endpoint/token/images' }, { status: 400 })
    }
    const res = await fetch(`${String(endpoint).replace(/\/update$/, '')}/resolve-alts`, {
      method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ token, images: images.map(String) })
    })
    const text = await res.text(); let data:any; try{ data = JSON.parse(text) }catch{ data = { raw:text } }
    if(!res.ok) return NextResponse.json({ ok:false, error:`WP ${res.status}`, data }, { status: res.status })
    return NextResponse.json({ ok:true, alts: data.alts||{} })
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'resolve failed' }, { status: 500 }) }
}
