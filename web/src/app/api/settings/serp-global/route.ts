import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { kvGet, kvSet } from '@/lib/kv'
import { aesEncrypt } from '@/lib/crypto'

export const runtime = 'nodejs'

export async function GET(){
  // Require any signed-in user; global settings apply across all users in this instance
  const session = await auth(); if(!session) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 })
  const raw = await kvGet('serp:global')
  if(!raw) return NextResponse.json({ ok:true, provider:'serper', hasKey:false })
  try{ const s = JSON.parse(raw) as any; return NextResponse.json({ ok:true, provider: s.provider||'serper', hasKey: !!s.apiKeyEnc }) }
  catch{ return NextResponse.json({ ok:true, provider:'serper', hasKey:false }) }
}

export async function POST(req: NextRequest){
  const session = await auth(); if(!session) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 })
  const body = await req.json().catch(()=>({})) as { provider?:'serper'|'serpapi', apiKey?:string, clear?: boolean }
  if(body.clear){ await kvSet('serp:global', JSON.stringify({ provider:'serper', apiKeyEnc:'' })); return NextResponse.json({ ok:true }) }
  if(!body.provider || !body.apiKey) return NextResponse.json({ ok:false, error:'Missing provider/apiKey' }, { status:400 })
  await kvSet('serp:global', JSON.stringify({ provider: body.provider, apiKeyEnc: aesEncrypt(body.apiKey) }))
  return NextResponse.json({ ok:true })
}

