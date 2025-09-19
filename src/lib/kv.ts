import { promises as fs } from 'fs'
import path from 'path'

type RedisCfg = { base: string, token: string } | null

export function getRedisCfg(): RedisCfg{
  const base = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if(!base || !token) return null
  return { base, token }
}

export async function kvGet(key: string): Promise<string|null>{
  const cfg = getRedisCfg()
  if(cfg){
    try{
      const r = await fetch(`${cfg.base}/get/${encodeURIComponent(key)}`, { headers:{ Authorization:`Bearer ${cfg.token}` } })
      if(!r.ok) return null
      const j = await r.json().catch(()=>null) as any
      return j?.result || null
    }catch{ return null }
  }
  try{
    const fp = filePath(key)
    const b = await fs.readFile(fp, 'utf8')
    return b
  }catch{ return null }
}

export async function kvSet(key: string, value: string){
  const cfg = getRedisCfg()
  if(cfg){
    await fetch(cfg.base, { method:'POST', headers:{ Authorization:`Bearer ${cfg.token}`, 'Content-Type':'application/json' }, body: JSON.stringify({ command:["SET", key, value] }) })
    return
  }
  const fp = filePath(key)
  await fs.mkdir(path.dirname(fp), { recursive:true })
  await fs.writeFile(fp, value, 'utf8')
}

function filePath(key: string){
  // safe-ish filename from key
  const name = key.replace(/[^a-zA-Z0-9:_-]/g,'_') + '.json'
  return path.join(process.cwd(), 'web-data', 'kv', name)
}

