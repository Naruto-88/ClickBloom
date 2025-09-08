import { NextRequest, NextResponse } from 'next/server'
import { validateLicense } from '@/lib/license'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const { key, site_url } = await req.json()
    if(!key) return NextResponse.json({ ok:false, error:'Missing key' }, { status: 400 })
    const out = await validateLicense(String(key), site_url? String(site_url): undefined)
    return NextResponse.json(out)
  }catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message || 'validate failed' }, { status: 500 })
  }
}
