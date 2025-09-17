import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet } from '@/lib/kv'
import { aesDecrypt } from '@/lib/crypto'

export const runtime = 'nodejs'

type Provider = 'serper'|'serpapi'
type Kw = { id:string, query:string, targetUrl?:string, targetDomain?:string, history:Array<{date:string, position:number|null, source?:'api'|'manual', provider?:string, foundUrl?:string}> }
type Store = { [email:string]: { [siteId:string]: Kw[] } }
const KEY = 'keywords:store'
const today = ()=> new Date().toISOString().slice(0,10)

async function load(): Promise<Store>{ const raw = await kvGet(KEY); if(!raw) return {}; try{ return JSON.parse(raw) }catch{ return {} } }
async function save(store:Store){ await kvSet(KEY, JSON.stringify(store)) }

async function getGlobalKey(): Promise<{ provider: Provider|null, apiKey?: string }>{
  const g = await kvGet('serp:global')
  if(g){ try{ const s = JSON.parse(g) as any; if(s?.provider && s?.apiKeyEnc){ return { provider: s.provider, apiKey: aesDecrypt(s.apiKeyEnc) } } }catch{}
  return { provider:null }
}

async function checkOne(q:string, targetUrl?:string, targetDomain?:string, provider?:Provider, apiKey?:string){
  if(!provider || !apiKey) return { position:null as number|null, foundUrl:null as string|null, provider:null as any }
  const country='au', lang='en'
  if(provider==='serper'){
    const r = await fetch('https://google.serper.dev/search', { method:'POST', headers:{ 'X-API-KEY': apiKey, 'content-type':'application/json' }, body: JSON.stringify({ q, gl: country, hl: lang, num: 100 }) })
    const j = await r.json().catch(()=>({})) as any
    const organic: any[] = j?.organic||[]
    let position: number|null = null; let foundUrl: string|null = null
    const matches = (u:string)=>{ try{ const U = new URL(u); if(targetUrl && u.startsWith(targetUrl)) return true; if(targetDomain && U.hostname.replace(/^www\./,'') === String(targetDomain).replace(/^www\./,'')) return true }catch{}; return false }
    for(let i=0;i<organic.length;i++){ const u = organic[i]?.link || organic[i]?.url || ''; if(u && matches(u)){ position=i+1; foundUrl=u; break } }
    return { position, foundUrl, provider }
  }
  if(provider==='serpapi'){
    const url = new URL('https://serpapi.com/search.json')
    url.searchParams.set('engine','google'); url.searchParams.set('q', q); url.searchParams.set('gl',country); url.searchParams.set('hl',lang); url.searchParams.set('num','100'); url.searchParams.set('api_key', apiKey)
    const r = await fetch(url.toString()); const j = await r.json().catch(()=>({})) as any
    const organic: any[] = j?.organic_results||[]
    let position: number|null = null; let foundUrl: string|null = null
    const matches = (u:string)=>{ try{ const U = new URL(u); if(targetUrl && u.startsWith(targetUrl)) return true; if(targetDomain && U.hostname.replace(/^www\./,'') === String(targetDomain).replace(/^www\./,'')) return true }catch{}; return false }
    for(let i=0;i<organic.length;i++){ const u = organic[i]?.link || ''; if(u && matches(u)){ position=organic[i].position || (i+1); foundUrl=u; break } }
    return { position, foundUrl, provider }
  }
  return { position:null, foundUrl:null, provider:null as any }
}

export async function GET(){
  // This endpoint is intended for cron. It runs without user session using the global key.
  const { provider, apiKey } = await getGlobalKey()
  const store = await load()
  const d = today()
  for(const email of Object.keys(store)){
    const sites = store[email]
    for(const siteId of Object.keys(sites)){
      const list = sites[siteId]
      for(let i=0;i<list.length;i++){
        const k = list[i]
        const res = await checkOne(k.query, k.targetUrl, k.targetDomain, provider as any, apiKey as any)
        const h = k.history || []
        const idx = h.findIndex(x=> x.date===d)
        const rec = { date:d, position: res.position, source:'api' as const, provider: res.provider||undefined, foundUrl: res.foundUrl||undefined }
        if(idx>=0) h[idx]=rec; else h.unshift(rec)
        list[i].history = h.slice(0,120)
      }
    }
  }
  await save(store)
  return NextResponse.json({ ok:true, checked:true })
}

