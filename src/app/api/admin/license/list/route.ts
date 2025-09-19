import { NextRequest, NextResponse } from 'next/server'
import { loadStore } from '@/lib/license'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest){
  try{
    const s = await loadStore()
    return NextResponse.json({ ok:true, licenses: s.licenses, activations: s.activations })
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'list failed' }, { status:500 }) }
}

