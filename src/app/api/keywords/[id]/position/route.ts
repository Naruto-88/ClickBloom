import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { kvGet, kvSet } from '@/lib/kv'

export const runtime = 'nodejs'

type Kw = { id:string, history:Array<{date:string, position:number|null, source?:'api'|'manual', provider?:string, foundUrl?:string}> }
type Store = { [email:string]: { [siteId:string]: Kw[] } }
const KEY = 'keywords:store'
const today = ()=> new Date().toISOString().slice(0,10)

async function load(): Promise<Store>{ const raw = await kvGet(KEY); if(!raw) return {}; try{ return JSON.parse(raw) }catch{ return {} } }
async function save(s:Store){ await kvSet(KEY, JSON.stringify(s)) }

export async function POST(req: NextRequest, { params }: { params: { id: string } }){
  const session = await auth(); if(!session) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 })
  const email = session.user?.email || session.user?.name || 'anon'
  const body = await req.json().catch(()=>({})) as { siteId?:string, date?:string, position?:number|null, source?:'api'|'manual', provider?:string, foundUrl?:string }
  const siteId = String(body.siteId||'')
  if(!siteId) return NextResponse.json({ ok:false, error:'Missing siteId' }, { status:400 })
  const d = body.date || today()
  const store = await load()
  const list = store[email]?.[siteId] || []
  const i = list.findIndex(k=> k.id===params.id)
  if(i<0) return NextResponse.json({ ok:false, error:'Not found' }, { status:404 })
  const h = list[i].history || []
  const j = h.findIndex(x=> x.date===d)
  const rec = { date:d, position: (body.position===null? null : (typeof body.position==='number'? body.position : null)), source: body.source, provider: body.provider, foundUrl: body.foundUrl }
  if(j>=0) h[j] = rec; else h.unshift(rec)
  list[i].history = h.slice(0, 120)
  await save(store)
  return NextResponse.json({ ok:true })
}

