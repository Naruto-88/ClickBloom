import { NextRequest, NextResponse } from 'next/server'
import { deleteLicense } from '@/lib/license'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const ct = req.headers.get('content-type')||''
    let license_id = ''
    if(ct.includes('application/json')){ const b = await req.json(); license_id = String(b.license_id||'') }
    else { const raw = await req.text(); const p = new URLSearchParams(raw); license_id = String(p.get('license_id')||'') }
    if(!license_id) return NextResponse.json({ ok:false, error:'Missing license_id' }, { status:400 })
    await deleteLicense(license_id)
    return NextResponse.json({ ok:true })
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'delete failed' }, { status:500 }) }
}

