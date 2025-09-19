import { NextRequest, NextResponse } from 'next/server'
import { activateLicense } from '@/lib/license'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const { key, site_url } = await req.json()
    if(!key || !site_url) return NextResponse.json({ ok:false, error:'Missing key or site_url' }, { status: 400 })
    const out = await activateLicense(String(key), String(site_url))
    if(!out.ok){
      const code = out.error==='Invalid key'?401: out.error==='Seat limit reached'?409 : 403
      return NextResponse.json(out, { status: code })
    }
    return NextResponse.json(out)
  }catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message || 'activate failed' }, { status: 500 })
  }
}
