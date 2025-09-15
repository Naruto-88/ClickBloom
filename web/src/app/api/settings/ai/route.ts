import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

type AiSettings = { openaiKey?: string, model?: string }

function getRedisCfg(){
  const base = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if(!base || !token) return null
  return { base, token }
}

function encKey(){
  const s = process.env.CRYPTO_SECRET || process.env.NEXTAUTH_SECRET || ''
  if(!s) return null
  // derive 32 bytes from secret
  const buf = Buffer.alloc(32)
  Buffer.from(s).copy(buf)
  return buf
}

function aesEncrypt(plain: string){
  const key = encKey(); if(!key) return plain // fallback (not ideal)
  const crypto = require('crypto') as typeof import('crypto')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

function aesDecrypt(data: string){
  const key = encKey(); if(!key) return data
  const crypto = require('crypto') as typeof import('crypto')
  const raw = Buffer.from(data, 'base64')
  const iv = raw.subarray(0,12)
  const tag = raw.subarray(12,28)
  const ct = raw.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}

async function redisGet(key: string): Promise<string|null>{
  const cfg = getRedisCfg(); if(!cfg) return null
  const r = await fetch(`${cfg.base}/get/${encodeURIComponent(key)}`, { headers:{ Authorization: `Bearer ${cfg.token}` } })
  if(!r.ok) return null
  const j = await r.json().catch(()=>null) as any
  return j?.result || null
}

async function redisSet(key: string, value: string){
  const cfg = getRedisCfg(); if(!cfg) return
  await fetch(cfg.base, { method:'POST', headers:{ Authorization:`Bearer ${cfg.token}`, 'Content-Type':'application/json' }, body: JSON.stringify({ command: ["SET", key, value] }) })
}

function userKey(session: any){
  const email = session?.user?.email || session?.user?.name || 'anon'
  return `ai:settings:${email}`
}

export async function GET(){
  const session = await auth()
  if(!session) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status: 401 })
  const cfgKey = userKey(session)
  const raw = await redisGet(cfgKey)
  if(!raw) return NextResponse.json({ ok:true, hasKey:false })
  const obj = JSON.parse(raw) as { openaiKey?: string, model?: string }
  return NextResponse.json({ ok:true, hasKey: !!obj.openaiKey, model: obj.model||'' })
}

export async function POST(req: NextRequest){
  const session = await auth()
  if(!session) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(()=>({})) as AiSettings & { clearKey?: boolean }
  const cfgKey = userKey(session)
  let current: AiSettings = {}
  const raw = await redisGet(cfgKey)
  if(raw){ try{ current = JSON.parse(raw) }catch{} }
  if(body.clearKey){ delete current.openaiKey }
  if(body.openaiKey){ current.openaiKey = aesEncrypt(body.openaiKey) }
  if(body.model!==undefined){ current.model = body.model }
  await redisSet(cfgKey, JSON.stringify(current))
  return NextResponse.json({ ok:true })
}

