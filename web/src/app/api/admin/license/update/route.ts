import { NextRequest, NextResponse } from 'next/server'
import { setCrawlCredits } from '@/lib/license'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const { license_id, crawl_credits } = await req.json()
    if(!license_id || typeof crawl_credits!=='number') return NextResponse.json({ ok:false, error:'Missing fields' }, { status:400 })
    await setCrawlCredits(String(license_id), Math.floor(crawl_credits))
    return NextResponse.json({ ok:true })
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'update failed' }, { status:500 }) }
}

