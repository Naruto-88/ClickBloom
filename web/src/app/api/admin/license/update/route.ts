import { NextRequest, NextResponse } from 'next/server'
import { setCrawlCredits, setLicenseExpiry } from '@/lib/license'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const ct = req.headers.get('content-type')||''
    let license_id = ''
    let crawl_credits: any
    let expires_at: any = undefined
    if(ct.includes('application/json')){
      const body = await req.json(); license_id = String(body.license_id||''); crawl_credits = body.crawl_credits!==undefined? Number(body.crawl_credits) : NaN; expires_at = body.expires_at===undefined? undefined : (body.expires_at===null? null : String(body.expires_at))
    }else{
      const raw = await req.text(); const p = new URLSearchParams(raw); license_id = String(p.get('license_id')||''); const cc = p.get('crawl_credits'); crawl_credits = (cc===null||cc===undefined||cc==='')? NaN : Number(cc); const ex = p.get('expires_at'); expires_at = (ex===null||ex===undefined||ex==='')? undefined : String(ex)
    }
    if(!license_id) return NextResponse.json({ ok:false, error:'Missing license_id' }, { status:400 })
    if(!Number.isNaN(crawl_credits)){
      await setCrawlCredits(String(license_id), Math.floor(crawl_credits))
    }
    if(expires_at !== undefined){
      await setLicenseExpiry(String(license_id), expires_at)
    }
    return NextResponse.json({ ok:true })
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'update failed' }, { status:500 }) }
}
