import { NextRequest, NextResponse } from 'next/server'
import { autoConnect } from '@/lib/wpConnect'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const { siteUrl, key, appBase, overrideEndpoint, localDev } = await req.json()
    if(!siteUrl || !key) return NextResponse.json({ ok:false, error:'Missing siteUrl or key' }, { status: 400 })

    // If override endpoint provided, just return as-is (frontend will test it)
    if(overrideEndpoint){
      return NextResponse.json({ ok:true, activated:false, endpoints:{ update: overrideEndpoint } })
    }

    const base = appBase || process.env.NEXTAUTH_URL || process.env.VERCEL_URL || ''
    const appBaseUrl = (typeof base === 'string' && base.length>0) ? (base.startsWith('http')? base : `https://${base}`) : ''
    const isLocal = /localhost|127\.0\.0\.1|\[::1\]|\.local/i.test(appBaseUrl)
    const out = await autoConnect(siteUrl, key, (localDev || isLocal) ? undefined : appBaseUrl)
    return NextResponse.json({ ok:true, activated: out.activated, endpoints: out.endpoints })
  }catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message || 'auto-connect failed' }, { status: 500 })
  }
}
