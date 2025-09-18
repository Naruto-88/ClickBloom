import { kvGet, kvSet } from '@/lib/kv'

export type UserRecord = {
  email: string
  name?: string | null
  image?: string | null
  createdAt: string
  lastLoginAt: string
  status: 'active' | 'blocked'
  blockedAt?: string | null
  blockedBy?: string | null
}

type Store = Record<string, UserRecord>

const KEY = 'admin:users'

async function load(): Promise<Store>{
  const raw = await kvGet(KEY)
  if(!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Store
    if(parsed && typeof parsed === 'object') return parsed
    return {}
  } catch {
    return {}
  }
}

async function save(store: Store){
  await kvSet(KEY, JSON.stringify(store))
}

function normalize(email: string){
  return email.trim().toLowerCase()
}

export async function getUser(email: string): Promise<UserRecord | null>{
  const store = await load()
  const record = store[normalize(email)]
  return record ? { ...record } : null
}

export async function listUsers(): Promise<UserRecord[]>{
  const store = await load()
  const users = Object.values(store)
  users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return users
}

export async function upsertUser(profile: { email: string; name?: string | null; image?: string | null }){
  const email = normalize(profile.email)
  if(!email) return null
  const store = await load()
  const existing = store[email]
  const now = new Date().toISOString()
  const record: UserRecord = existing ? { ...existing } : {
    email: profile.email,
    name: profile.name ?? null,
    image: profile.image ?? null,
    createdAt: now,
    lastLoginAt: now,
    status: 'active'
  }
  if(existing){
    record.email = existing.email // preserve original casing
    record.createdAt = existing.createdAt
  }
  record.name = profile.name ?? record.name ?? null
  record.image = profile.image ?? record.image ?? null
  record.lastLoginAt = now
  if(record.status !== 'blocked'){
    record.status = 'active'
    record.blockedAt = null
    record.blockedBy = null
  }
  store[email] = record
  await save(store)
  return { ...record }
}

export async function blockUser(targetEmail: string, actorEmail?: string){
  const email = normalize(targetEmail)
  if(!email) return null
  const store = await load()
  const existing = store[email]
  if(!existing) return null
  const now = new Date().toISOString()
  store[email] = {
    ...existing,
    status: 'blocked',
    blockedAt: now,
    blockedBy: actorEmail ?? null
  }
  await save(store)
  return { ...store[email] }
}

export async function unblockUser(targetEmail: string){
  const email = normalize(targetEmail)
  if(!email) return null
  const store = await load()
  const existing = store[email]
  if(!existing) return null
  store[email] = {
    ...existing,
    status: 'active',
    blockedAt: null,
    blockedBy: null
  }
  await save(store)
  return { ...store[email] }
}

export async function removeUser(targetEmail: string){
  const email = normalize(targetEmail)
  if(!email) return false
  const store = await load()
  if(store[email]){
    delete store[email]
    await save(store)
    return true
  }
  return false
}
