import { createHash } from 'crypto'
import { kvGet, kvSet } from './kv'

export type MetaCacheValue = {
  meta: string
  model: string
  promptHash: string
  ctxHash: string
  createdAt: number
  expiresAt: number
}

export type ExtractCacheValue = {
  title: string
  meta: string
  text: string
  createdAt: number
  expiresAt: number
}

const META_TTL_SECONDS = Number(process.env.META_CACHE_TTL_SECONDS || 12 * 60 * 60)
const EXTRACT_TTL_SECONDS = Number(process.env.PAGE_EXTRACT_CACHE_TTL_SECONDS || 30 * 60)

const globalAny = globalThis as typeof globalThis & {
  __meta_cache_mem?: Map<string, MetaCacheValue>
  __meta_extract_cache_mem?: Map<string, ExtractCacheValue>
}

const metaMem = globalAny.__meta_cache_mem || new Map<string, MetaCacheValue>()
const extractMem = globalAny.__meta_extract_cache_mem || new Map<string, ExtractCacheValue>()

globalAny.__meta_cache_mem = metaMem
globalAny.__meta_extract_cache_mem = extractMem

const now = () => Date.now()

export function metaCacheKey(url: string, keywords: string[], model: string){
  const raw = JSON.stringify({ url, keywords: [...keywords].sort(), model })
  return `meta:${hash(raw)}`
}

export function extractCacheKey(url: string){
  return `meta:ctx:${hash(url)}`
}

export async function readMetaCache(key: string): Promise<MetaCacheValue | null>{
  const hit = metaMem.get(key)
  if(hit && hit.expiresAt > now()) return hit
  const raw = await kvGet(key)
  if(!raw) return null
  try{
    const parsed = JSON.parse(raw) as MetaCacheValue
    if(parsed.expiresAt <= now()) return null
    metaMem.set(key, parsed)
    return parsed
  }catch{
    return null
  }
}

export async function writeMetaCache(key: string, value: MetaCacheValue): Promise<MetaCacheValue>{
  metaMem.set(key, value)
  await kvSet(key, JSON.stringify(value))
  return value
}

export async function readExtractCache(url: string): Promise<ExtractCacheValue | null>{
  const key = extractCacheKey(url)
  const hit = extractMem.get(key)
  if(hit && hit.expiresAt > now()) return hit
  const raw = await kvGet(key)
  if(!raw) return null
  try{
    const parsed = JSON.parse(raw) as ExtractCacheValue
    if(parsed.expiresAt <= now()) return null
    extractMem.set(key, parsed)
    return parsed
  }catch{
    return null
  }
}

export async function writeExtractCache(url: string, value: Omit<ExtractCacheValue, 'createdAt' | 'expiresAt'>): Promise<ExtractCacheValue>{
  const key = extractCacheKey(url)
  const createdAt = now()
  const expiresAt = createdAt + EXTRACT_TTL_SECONDS * 1000
  const record: ExtractCacheValue = { ...value, createdAt, expiresAt }
  extractMem.set(key, record)
  await kvSet(key, JSON.stringify(record))
  return record
}

export function buildMetaRecord(meta: string, model: string, prompt: string, ctx: ExtractCacheValue | null): MetaCacheValue{
  const createdAt = now()
  const expiresAt = createdAt + META_TTL_SECONDS * 1000
  return {
    meta,
    model,
    promptHash: hash(prompt),
    ctxHash: ctx ? hash(JSON.stringify({ title: ctx.title, meta: ctx.meta })) : 'na',
    createdAt,
    expiresAt
  }
}

export const metaCacheTtlSeconds = META_TTL_SECONDS
export const extractCacheTtlSeconds = EXTRACT_TTL_SECONDS

function hash(input: string){
  return createHash('sha256').update(input).digest('hex')
}
