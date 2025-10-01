/**
 * WordPress auto-connect helpers for ClickBloom/ClickRank app
 * Option A: user provides only the site homepage URL. We discover the REST base,
 * verify the plugin, configure it with our app base, and return usable endpoints.
 */

export type WpInfo = {
  ok: boolean
  plugin?: string
  version?: string
  site_url?: string
  activated?: boolean
  has_key?: boolean
  endpoints?: { update: string; revert: string; settings: string; config: string }
}

export type ConnectResult = {
  restBase: string
  info: WpInfo
  activated: boolean
  endpoints: { update: string; revert: string; settings: string; config: string }
}

function normalizeUrl(u: string){
  const tryParse = (s:string)=>{ try{ const url=new URL(s); return url.origin }catch{ return null } }
  const trimmed = (u||'').trim().replace(/\/$/, '')
  let out = tryParse(trimmed)
  if(out) return out
  out = tryParse('https://'+trimmed)
  if(out) return out
  out = tryParse('http://'+trimmed)
  return out || trimmed
}

async function fetchText(url: string, init?: RequestInit){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 8000)
  try{ const res = await fetch(url, { ...init, signal: ctrl.signal }); return await res.text() } finally { clearTimeout(t) }
}

export async function discoverRestBase(siteUrl: string){
  const base = normalizeUrl(siteUrl)
  const tryHtml = async (origin:string)=>{
    const html = await fetchText(origin + '/')
    const m = html.match(/<link[^>]+rel=["']https?:\/\/api\.w\.org\/["'][^>]*href=["']([^"']+)["']/i)
    if(m && m[1]) return m[1].replace(/\/$/, '')
    return origin + '/wp-json'
  }
  // Try https then http if needed
  try{ return await tryHtml(base) }catch{}
  if(!/^https?:\/\//i.test(base)){
    try{ return await tryHtml('https://'+base) }catch{}
    try{ return await tryHtml('http://'+base) }catch{}
  }else if(base.startsWith('https://')){
    try{ return await tryHtml(base.replace('https://','http://')) }catch{}
  }
  return base + '/wp-json'
}

export async function getPluginInfo(restBase: string): Promise<WpInfo>{
  try{
    const res = await fetch(restBase.replace(/\/$/,'') + '/clickbloom/v1/info', { cache: 'no-store' })
    const json = await res.json().catch(()=>({ ok:false }))
    return json
  }catch{ return { ok:false } }
}

function isLocalhostUrl(u?: string){
  if(!u) return false
  return /^(http(s)?:\/\/)?(localhost|127\.0\.0\.1|\[::1\]|.+\.local)([:/]|$)/i.test(u)
}

export async function configurePlugin(restBase: string, key: string, appBase?: string){
  const payload: any = { token: key }
  if(appBase && !isLocalhostUrl(appBase)) payload.api_base = appBase
  const body = JSON.stringify(payload)
  const res = await fetch(restBase.replace(/\/$/,'') + '/clickbloom/v1/config', { method:'POST', headers:{ 'content-type':'application/json' }, body })
  return res.json().catch(()=>({ ok:false })) as Promise<{ ok:boolean; activated?:boolean }>
}

export async function autoConnect(siteUrl: string, key: string, appBase?: string): Promise<ConnectResult>{
  const restBase = await discoverRestBase(siteUrl)
  // Quick ping
  try{ await fetch(restBase + '/clickbloom/v1/ping').then(()=>{}) }catch{}
  // Fetch info
  let info = await getPluginInfo(restBase)
  // If not activated or no key, configure now
  if(!info?.activated){
    await configurePlugin(restBase, key, appBase)
    info = await getPluginInfo(restBase)
  }
  // Fallback: if info endpoint blocked, infer update endpoint
  const base = restBase.replace(/\/$/,'')
  const endpoints = info?.endpoints || {
    update: base + '/clickbloom/v1/update',
    revert: base + '/clickbloom/v1/revert',
    settings: base + '/clickbloom/v1/settings',
    config: base + '/clickbloom/v1/config',
  }
  return { restBase, info: info||{ ok:true }, activated: !!info?.activated, endpoints }
}

// Optional: map purchase key -> site URL via your license API
// Implement in your Next.js backend and call it here to avoid exposing the license server.
export async function lookupSiteByKey(_key: string): Promise<string|null>{
  // Example (if you add /api/license/site-by-key):
  // const r = await fetch('/api/license/site-by-key?key='+encodeURIComponent(_key))
  // const j = await r.json(); return j?.siteUrl || null
  return null
}
