import { kvGet, kvSet } from '@/lib/kv'

type CacheEnvelope<T> = { ts: number; value: T }

export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T>{
  const namespaced = `cache:${key}`
  try{
    const raw = await kvGet(namespaced)
    if(raw){
      try{
        const env = JSON.parse(raw) as CacheEnvelope<T>
        if(env && typeof env.ts === 'number' && (Date.now() - env.ts) < ttlSeconds*1000){
          return env.value
        }
      }catch{}
    }
  }catch{}
  const value = await fetcher()
  try{ await kvSet(namespaced, JSON.stringify({ ts: Date.now(), value })) }catch{}
  return value
}

