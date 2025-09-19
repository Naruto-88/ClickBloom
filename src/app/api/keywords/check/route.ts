import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { kvGet } from '@/lib/kv'
import { aesDecrypt } from '@/lib/crypto'

export const runtime = 'nodejs'

type Provider = 'serper'|'serpapi'

async function pickProviderForUser(): Promise<{ provider: Provider|null, apiKey?: string }>{
  const session = await auth().catch(()=>null as any)
  // Prefer global
  const g = await kvGet('serp:global')
  if(g){ try{ const s = JSON.parse(g) as any; if(s?.provider && s?.apiKeyEnc){ return { provider: s.provider, apiKey: aesDecrypt(s.apiKeyEnc) } } }catch{} }
  // Then per-user
  const email = session?.user?.email || session?.user?.name || ''
  if(email){ const raw = await kvGet(`serp:settings:${email}`); if(raw){ try{ const s = JSON.parse(raw) as any; if(s?.provider && s?.apiKeyEnc){ return { provider: s.provider, apiKey: aesDecrypt(s.apiKeyEnc) } } }catch{} } }
  if(process.env.SERPER_API_KEY) return { provider:'serper', apiKey: process.env.SERPER_API_KEY }
  if(process.env.SERPAPI_KEY) return { provider:'serpapi', apiKey: process.env.SERPAPI_KEY }
  return { provider:null }
}

export async function POST(req: NextRequest){
  try{
    const { q, targetUrl, targetDomain, country = 'au', lang = 'en' } = await req.json()
    if(!q) return NextResponse.json({ ok:false, error:'Missing q' }, { status: 400 })
    const { provider, apiKey } = await pickProviderForUser()
    if(!provider || !apiKey){
      // No provider configured: return a noop response so UI can still function manually
      return NextResponse.json({ ok:true, data:{ position:null, foundUrl:null, provider:null } })
    }

    if(provider === 'serper'){
      // https://serper.dev search API
      const r = await fetch('https://google.serper.dev/search', {
        method:'POST',
        headers:{ 'X-API-KEY': apiKey, 'content-type':'application/json' },
        body: JSON.stringify({ q, gl: country, hl: lang, num: 100 })
      })
      const j = await r.json()
      const organic: any[] = j.organic || []
      let position: number|null = null; let foundUrl: string|null = null
      const matches = (u:string)=>{
        try{
          const U = new URL(u)
          if(targetUrl){ if(u.startsWith(targetUrl)) return true }
          if(targetDomain){ if(U.hostname.replace(/^www\./,'') === String(targetDomain).replace(/^www\./,'')) return true }
        }catch{}
        return false
      }
      for(let i=0;i<organic.length;i++){
        const u = organic[i]?.link || organic[i]?.url || ''
        if(u && matches(u)){ position = i+1; foundUrl = u; break }
      }
      return NextResponse.json({ ok:true, data:{ position, foundUrl, provider } })
    }

    if(provider === 'serpapi'){
      const url = new URL('https://serpapi.com/search.json')
      url.searchParams.set('engine','google')
      url.searchParams.set('q', q)
      url.searchParams.set('gl', country)
      url.searchParams.set('hl', lang)
      url.searchParams.set('num','100')
      url.searchParams.set('api_key', apiKey)
      const r = await fetch(url.toString())
      const j = await r.json()
      const organic: any[] = j.organic_results || []
      let position: number|null = null; let foundUrl: string|null = null
      const matches = (u:string)=>{
        try{
          const U = new URL(u)
          if(targetUrl){ if(u.startsWith(targetUrl)) return true }
          if(targetDomain){ if(U.hostname.replace(/^www\./,'') === String(targetDomain).replace(/^www\./,'')) return true }
        }catch{}
        return false
      }
      for(let i=0;i<organic.length;i++){
        const u = organic[i]?.link || ''
        if(u && matches(u)){ position = organic[i].position || (i+1); foundUrl = u; break }
      }
      return NextResponse.json({ ok:true, data:{ position, foundUrl, provider } })
    }

    return NextResponse.json({ ok:false, error:'No provider' }, { status: 500 })
  }catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message||'check failed' }, { status: 500 })
  }
}
