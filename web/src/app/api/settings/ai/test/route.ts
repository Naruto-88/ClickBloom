import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import OpenAI from 'openai'

export const runtime = 'nodejs'

async function getStoredKey(session:any){
  const base = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if(!base || !token) return null
  const key = `ai:settings:${session?.user?.email || session?.user?.name || 'anon'}`
  const r = await fetch(`${base}/get/${encodeURIComponent(key)}`, { headers:{ Authorization:`Bearer ${token}` } })
  if(!r.ok) return null
  const j = await r.json().catch(()=>null) as any
  const raw = j?.result; if(!raw) return null
  try{
    const obj = JSON.parse(raw)
    const val = obj?.openaiKey; if(!val) return null
    // best effort decrypt if CRYPTO_SECRET present
    try{
      const crypto = require('crypto') as typeof import('crypto')
      const secret = process.env.CRYPTO_SECRET || process.env.NEXTAUTH_SECRET
      if(!secret) return val
      const buf = Buffer.alloc(32); Buffer.from(secret).copy(buf)
      const data = Buffer.from(val, 'base64'); const iv=data.subarray(0,12); const tag=data.subarray(12,28); const ct=data.subarray(28)
      const decipher = crypto.createDecipheriv('aes-256-gcm', buf, iv); decipher.setAuthTag(tag)
      const pt = Buffer.concat([decipher.update(ct), decipher.final()])
      return pt.toString('utf8')
    }catch{ return val }
  }catch{ return null }
}

export async function POST(req: NextRequest){
  const session = await auth()
  if(!session) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status: 401 })
  const { apiKey: bodyKey, model } = await req.json().catch(()=>({})) as { apiKey?: string, model?: string }
  const apiKey = bodyKey || await getStoredKey(session) || process.env.OPENAI_API_KEY
  if(!apiKey) return NextResponse.json({ ok:false, error:'Missing API key' }, { status: 400 })
  try{
    const openai = new OpenAI({ apiKey })
    // Cheap capability probe: list models or do a tiny noop
    const m = model || process.env.OPENAI_MODEL || 'gpt-4o-mini'
    await openai.chat.completions.create({ model: m, messages:[{ role:'user', content:'ping' }], max_tokens: 1 })
    return NextResponse.json({ ok:true, model: m })
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'test failed' }, { status: 400 }) }
}

