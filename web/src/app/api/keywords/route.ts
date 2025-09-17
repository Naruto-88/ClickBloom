import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { kvGet, kvSet } from '@/lib/kv'

export const runtime = 'nodejs'

type Kw = { id:string, query:string, targetUrl?:string, targetDomain?:string, notes?:string, history:Array<{date:string, position:number|null, source?:'api'|'manual', provider?:string, foundUrl?:string}> }

type Store = { [email:string]: { [siteId:string]: Kw[] } }

const KEY = 'keywords:store'
const today = ()=> new Date().toISOString().slice(0,10)

async function load(): Promise<Store>{
  const raw = await kvGet(KEY)
  if(!raw) return {}
  try{ return JSON.parse(raw) }catch{ return {} }
}
async function save(store: Store){ await kvSet(KEY, JSON.stringify(store)) }

export async function GET(req: NextRequest){
  const session = await auth(); if(!session) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 })
  const email = session.user?.email || session.user?.name || 'anon'
  const siteId = String(new URL(req.url).searchParams.get('siteId')||'')
  if(!siteId) return NextResponse.json({ ok:false, error:'Missing siteId' }, { status:400 })
  const store = await load()
  const list = store[email]?.[siteId] || []
  return NextResponse.json({ ok:true, data:list })
}

export async function POST(req: NextRequest){
  const session = await auth(); if(!session) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 })
  const email = session.user?.email || session.user?.name || 'anon'
  const body = await req.json().catch(()=>({})) as Partial<Kw> & { siteId?:string }
  const siteId = String(body.siteId||'')
  if(!siteId || !body.query) return NextResponse.json({ ok:false, error:'Missing siteId/query' }, { status:400 })
  const store = await load()
  const cur = store[email] || (store[email] = {})
  const list = cur[siteId] || (cur[siteId] = [])
  const id = String(Date.now())
  const item: Kw = { id, query: body.query!.trim(), targetUrl: body.targetUrl?.trim()||undefined, targetDomain: body.targetDomain?.trim()||undefined, notes: body.notes||'', history: [] }
  list.unshift(item)
  await save(store)
  return NextResponse.json({ ok:true, data:item })
}

