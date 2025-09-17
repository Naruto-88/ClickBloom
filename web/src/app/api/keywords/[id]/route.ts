import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { kvGet, kvSet } from '@/lib/kv'

export const runtime = 'nodejs'

type Kw = { id:string, query:string, targetUrl?:string, targetDomain?:string, notes?:string, history:Array<{date:string, position:number|null, source?:'api'|'manual', provider?:string, foundUrl?:string}> }
type Store = { [email:string]: { [siteId:string]: Kw[] } }
const KEY = 'keywords:store'

async function load(): Promise<Store>{ const raw = await kvGet(KEY); if(!raw) return {}; try{ return JSON.parse(raw) }catch{ return {} } }
async function save(s:Store){ await kvSet(KEY, JSON.stringify(s)) }

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }){
  const session = await auth(); if(!session) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 })
  const email = session.user?.email || session.user?.name || 'anon'
  const body = await req.json().catch(()=>({})) as Partial<Kw> & { siteId?:string }
  const siteId = String(body.siteId||'')
  if(!siteId) return NextResponse.json({ ok:false, error:'Missing siteId' }, { status:400 })
  const store = await load()
  const list = store[email]?.[siteId] || []
  const i = list.findIndex(x=> x.id===params.id)
  if(i<0) return NextResponse.json({ ok:false, error:'Not found' }, { status:404 })
  const cur = list[i]
  list[i] = { ...cur, query: body.query?.trim()||cur.query, targetUrl: body.targetUrl?.trim()||cur.targetUrl, targetDomain: body.targetDomain?.trim()||cur.targetDomain, notes: body.notes??cur.notes }
  await save(store)
  return NextResponse.json({ ok:true, data:list[i] })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }){
  const session = await auth(); if(!session) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 })
  const email = session.user?.email || session.user?.name || 'anon'
  const siteId = String(new URL(req.url).searchParams.get('siteId')||'')
  if(!siteId) return NextResponse.json({ ok:false, error:'Missing siteId' }, { status:400 })
  const store = await load()
  const cur = store[email]?.[siteId] || []
  const next = cur.filter(x=> x.id!==params.id)
  if(store[email]?.[siteId]) store[email][siteId] = next
  await save(store)
  return NextResponse.json({ ok:true })
}

