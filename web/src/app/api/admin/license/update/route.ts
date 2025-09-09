import { NextRequest, NextResponse } from 'next/server'
import { setCrawlCredits } from '@/lib/license'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const ct = req.headers.get('content-type')||''
    let license_id = ''
    let crawl_credits: any
    if(ct.includes('application/json')){
      const body = await req.json(); license_id = String(body.license_id||''); crawl_credits = Number(body.crawl_credits)
    }else{
      const raw = await req.text(); const p = new URLSearchParams(raw); license_id = String(p.get('license_id')||''); crawl_credits = Number(p.get('crawl_credits')||'')
    }
    if(!license_id || Number.isNaN(crawl_credits)) return NextResponse.json({ ok:false, error:'Missing fields' }, { status:400 })
    await setCrawlCredits(String(license_id), Math.floor(crawl_credits))
    return NextResponse.json({ ok:true })
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'update failed' }, { status:500 }) }
}
