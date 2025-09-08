import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const { endpoint, token, testUrl } = await req.json()
    if(!endpoint || !token){ return NextResponse.json({ ok:false, error:'Missing endpoint or token' }, { status: 400 }) }
    const body = JSON.stringify({ token, url: testUrl || 'https://example.com/' })
    const res = await fetch(endpoint, { method:'POST', headers:{ 'content-type':'application/json' }, body })
    const status = res.status
    const text = await res.text()
    if(status===200){ return NextResponse.json({ ok:true, status, message:'OK' }) }
    if(status===404){ return NextResponse.json({ ok:true, status, message:'Authenticated (post not found)' }) }
    if(status===401){ return NextResponse.json({ ok:false, status, error:'Unauthorized (invalid key / not activated)' }) }
    return NextResponse.json({ ok:false, status, error:`HTTP ${status}: ${text.slice(0,200)}` }, { status })
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message || 'test failed' }, { status: 500 }) }
}

