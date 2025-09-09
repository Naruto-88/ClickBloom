import { NextRequest, NextResponse } from 'next/server'
import { createLicense } from '@/lib/license'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const body = await req.json().catch(async ()=>{
      const raw = await req.text(); const p = new URLSearchParams(raw); return {
        email: p.get('email')||undefined,
        plan: p.get('plan')||undefined,
        max_sites: p.get('max_sites')? Number(p.get('max_sites')): undefined,
        expires_at: p.get('expires_at')||undefined,
        crawl_credits: p.get('crawl_credits')? Number(p.get('crawl_credits')): undefined,
      }
    })
    const { key, license } = await createLicense({
      email: body.email,
      plan: body.plan,
      max_sites: body.max_sites,
      expires_at: body.expires_at ?? null,
      crawl_credits: body.crawl_credits
    })
    return NextResponse.json({ ok:true, key, license })
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'create failed' }, { status:500 }) }
}

