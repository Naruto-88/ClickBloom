import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { kvGet, kvSet } from '@/lib/kv'
import { aesEncrypt } from '@/lib/crypto'

export const runtime = 'nodejs'

type Body = { provider?: 'serper'|'serpapi', apiKey?: string, clear?: boolean }

export async function GET(){
  const session = await auth(); if(!session) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 })
  const email = session.user?.email || session.user?.name || 'anon'
  const raw = await kvGet(`serp:settings:${email}`)
  if(!raw) return NextResponse.json({ ok:true, provider:'serper', hasKey:false })
  try{ const s = JSON.parse(raw) as any; return NextResponse.json({ ok:true, provider: s.provider||'serper', hasKey: !!s.apiKeyEnc }) }
  catch{ return NextResponse.json({ ok:true, provider:'serper', hasKey:false }) }
}

export async function POST(req: NextRequest){
  const session = await auth(); if(!session) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 })
  const email = session.user?.email || session.user?.name || 'anon'
  const body = await req.json().catch(()=>({})) as Body
  const key = `serp:settings:${email}`
  if(body.clear){ await kvSet(key, JSON.stringify({ provider:'serper', apiKeyEnc:'' })); return NextResponse.json({ ok:true }) }
  if(!body.provider || !body.apiKey) return NextResponse.json({ ok:false, error:'Missing provider/apiKey' }, { status:400 })
  await kvSet(key, JSON.stringify({ provider: body.provider, apiKeyEnc: aesEncrypt(body.apiKey) }))
  return NextResponse.json({ ok:true })
}
