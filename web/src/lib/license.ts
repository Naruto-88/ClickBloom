import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'

export type License = {
  id: string
  key_hash: string
  owner_email?: string
  plan?: string
  max_sites: number
  crawl_credits?: number
  status: 'active'|'disabled'
  created_at: string
  expires_at?: string | null
}

export type Activation = {
  id: string
  license_id: string
  site_url: string
  created_at: string
  revoked?: boolean
}

type Store = { licenses: License[]; activations: Activation[] }

const JSON_FILE = process.env.LICENSE_DB_FILE || path.join(process.cwd(), 'web-data', 'licenses.json')
const BACKEND = process.env.LICENSE_BACKEND || 'json' // 'json' | 'sqlite'
const SQLITE_FILE = process.env.LICENSE_SQLITE_FILE || path.join(process.cwd(), 'web-data', 'licenses.sqlite')
const PEPPER = process.env.LICENSE_PEPPER || 'clickbloom_pepper_v1'

async function ensureDir() {
  const dir = path.dirname(JSON_FILE)
  await fs.mkdir(dir, { recursive: true })
}

// -- JSON backend helpers --
async function jsonLoad(): Promise<Store>{
  await ensureDir()
  try{ const raw = await fs.readFile(JSON_FILE, 'utf8'); const data = JSON.parse(raw); return { licenses:data.licenses||[], activations:data.activations||[] } }catch{ return { licenses:[], activations:[] } }
}
async function jsonSave(s: Store){ await ensureDir(); await fs.writeFile(JSON_FILE, JSON.stringify(s, null, 2), 'utf8') }

// -- SQLite backend helpers (optional) --
type DB = any
function getSqlite(): DB | null{
  if(BACKEND !== 'sqlite') return null
  try{
    // Use eval('require') to avoid bundlers trying to resolve optional deps
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const req: any = (0, eval)('require')
    const Database = req('better-sqlite3')
    const db = new Database(SQLITE_FILE)
    db.pragma('journal_mode = WAL')
    db.exec(`CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL,
      owner_email TEXT,
      plan TEXT,
      max_sites INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT
    );`)
    db.exec(`CREATE TABLE IF NOT EXISTS activations (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL,
      site_url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked INTEGER DEFAULT 0
    );`)
    return db
  }catch{ return null }
}

export async function loadStore(): Promise<Store>{
  const db = getSqlite()
  if(db){
    const licenses = db.prepare('SELECT * FROM licenses').all()
    const activations = db.prepare('SELECT * FROM activations').all().map((a:any)=> ({...a, revoked: !!a.revoked}))
    return { licenses, activations }
  }
  return jsonLoad()
}

export async function saveStore(s: Store){
  const db = getSqlite()
  if(db){
    // For sqlite backend, avoid wholesale overwrite; this function is a no-op.
    // Callers should use high-level helpers below.
    return
  }
  await jsonSave(s)
}

export function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key + '|' + PEPPER).digest('hex')
}

export function genKey(prefix = 'CBL'): string {
  const b = crypto.randomBytes(20)
  const base = b.toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const s = base.slice(0, 25)
  return `${prefix}-${s.slice(0,5)}-${s.slice(5,10)}-${s.slice(10,15)}-${s.slice(15,20)}-${s.slice(20,25)}`
}

export function normalizeUrl(u: string){
  try{ const url = new URL(u); url.hash=''; url.search=''; return url.toString().replace(/\/$/,'') }catch{ return u }
}

// High-level helpers that work across backends
export async function createLicense(input: { email?: string, plan?: string, max_sites?: number, expires_at?: string|null, crawl_credits?: number }){
  const key = genKey('CBL')
  const lic: License = {
    id: crypto.randomUUID(),
    key_hash: hashKey(key),
    owner_email: input.email || undefined,
    plan: input.plan || 'standard',
    max_sites: Math.max(1, Number(input.max_sites||1)),
    crawl_credits: typeof input.crawl_credits==='number'? Math.max(0, Math.floor(input.crawl_credits)) : undefined,
    status: 'active',
    created_at: new Date().toISOString(),
    expires_at: input.expires_at ?? null,
  }
  const db = getSqlite()
  if(db){
    db.prepare('INSERT INTO licenses (id,key_hash,owner_email,plan,max_sites,status,created_at,expires_at) VALUES (@id,@key_hash,@owner_email,@plan,@max_sites,@status,@created_at,@expires_at)').run(lic)
    return { key, license: lic }
  }
  const s = await jsonLoad(); s.licenses.push(lic); await jsonSave(s); return { key, license: lic }
}

export async function activateLicense(key: string, site_url: string){
  const site = normalizeUrl(site_url)
  const h = hashKey(key)
  const db = getSqlite()
  if(db){
    const lic = db.prepare('SELECT * FROM licenses WHERE key_hash=?').get(h) as License|undefined
    if(!lic) return { ok:false, error:'Invalid key' as const }
    if(lic.status!=='active') return { ok:false, error:'License disabled' as const }
    if(lic.expires_at && new Date(lic.expires_at) < new Date()) return { ok:false, error:'License expired' as const }
    const used = db.prepare('SELECT COUNT(*) as c FROM activations WHERE license_id=? AND revoked=0').get(lic.id).c as number
    const exists = db.prepare('SELECT * FROM activations WHERE license_id=? AND site_url=? AND revoked=0').get(lic.id, site)
    if(!exists && used >= lic.max_sites) return { ok:false, error:'Seat limit reached' as const }
    if(!exists){ db.prepare('INSERT INTO activations (id,license_id,site_url,created_at,revoked) VALUES (?,?,?,?,0)').run(crypto.randomUUID(), lic.id, site, new Date().toISOString()) }
    return { ok:true, license: { id: lic.id, plan: lic.plan, max_sites: lic.max_sites, expires_at: lic.expires_at } }
  }
  const s = await jsonLoad()
  const lic = s.licenses.find(l=> l.key_hash===h)
  if(!lic) return { ok:false, error:'Invalid key' as const }
  if(lic.status!=='active') return { ok:false, error:'License disabled' as const }
  if(lic.expires_at && new Date(lic.expires_at) < new Date()) return { ok:false, error:'License expired' as const }
  const used = s.activations.filter(a=> a.license_id===lic.id && !a.revoked)
  const exists = used.find(a=> a.site_url===site)
  if(!exists && used.length>=lic.max_sites) return { ok:false, error:'Seat limit reached' as const }
  if(!exists){ s.activations.push({ id: crypto.randomUUID(), license_id: lic.id, site_url: site, created_at: new Date().toISOString(), revoked:false }) }
  await jsonSave(s)
  return { ok:true, license: { id: lic.id, plan: lic.plan, max_sites: lic.max_sites, expires_at: lic.expires_at } }
}

export async function validateLicense(key: string, site_url?: string){
  const h = hashKey(key)
  const site = site_url? normalizeUrl(site_url) : undefined
  const db = getSqlite()
  if(db){
    const lic = db.prepare('SELECT * FROM licenses WHERE key_hash=?').get(h) as License|undefined
    if(!lic) return { ok:true, valid:false }
    const expired = !!(lic.expires_at && new Date(lic.expires_at) < new Date())
    const used = db.prepare('SELECT * FROM activations WHERE license_id=? AND revoked=0').all(lic.id)
    const bound = site? !!used.find((a:any)=> a.site_url===site) : undefined
    return { ok:true, valid: lic.status==='active' && !expired, plan: lic.plan, max_sites: lic.max_sites, expires_at: lic.expires_at, bound, crawl_credits: lic.crawl_credits }
  }
  const s = await jsonLoad()
  const lic = s.licenses.find(l=> l.key_hash===h)
  if(!lic) return { ok:true, valid:false }
  const expired = !!(lic.expires_at && new Date(lic.expires_at) < new Date())
  const used = s.activations.filter(a=> a.license_id===lic.id && !a.revoked)
  const bound = site? !!used.find(a=> a.site_url===site) : undefined
  return { ok:true, valid: lic.status==='active' && !expired, plan: lic.plan, max_sites: lic.max_sites, expires_at: lic.expires_at, bound, crawl_credits: lic.crawl_credits }
}

export async function setLicenseStatus(license_id: string, status: 'active'|'disabled'){
  const db = getSqlite()
  if(db){ db.prepare('UPDATE licenses SET status=? WHERE id=?').run(status, license_id); return }
  const s = await jsonLoad(); const lic = s.licenses.find(l=> l.id===license_id); if(lic){ lic.status=status; await jsonSave(s) }
}

export async function setCrawlCredits(license_id: string, credits: number){
  const db = getSqlite()
  if(db){ db.prepare('UPDATE licenses SET crawl_credits=? WHERE id=?').run(Math.max(0, Math.floor(credits)), license_id); return }
  const s = await jsonLoad(); const lic = s.licenses.find(l=> l.id===license_id); if(lic){ lic.crawl_credits = Math.max(0, Math.floor(credits)); await jsonSave(s) }
}

export async function spendCrawlCreditsByKey(key: string, amount: number): Promise<{ ok:boolean, remaining?: number, error?: string }>{
  const h = hashKey(key)
  const db = getSqlite()
  if(db){
    const lic = db.prepare('SELECT * FROM licenses WHERE key_hash=?').get(h) as License|undefined
    if(!lic) return { ok:false, error:'Invalid key' }
    const left = typeof lic.crawl_credits==='number'? lic.crawl_credits : Infinity
    if(amount>0 && isFinite(left) && left < amount) return { ok:false, error:'Insufficient crawl credits' }
    if(isFinite(left)){
      const next = left - amount
      db.prepare('UPDATE licenses SET crawl_credits=? WHERE id=?').run(next, lic.id)
      return { ok:true, remaining: next }
    }
    return { ok:true }
  }
  const s = await jsonLoad(); const lic = s.licenses.find(l=> l.key_hash===h)
  if(!lic) return { ok:false, error:'Invalid key' }
  const left = typeof lic.crawl_credits==='number'? lic.crawl_credits : Infinity
  if(amount>0 && isFinite(left) && left < amount) return { ok:false, error:'Insufficient crawl credits' }
  if(isFinite(left)){
    lic.crawl_credits = left - amount
    await jsonSave(s)
    return { ok:true, remaining: lic.crawl_credits }
  }
  await jsonSave(s)
  return { ok:true }
}

export async function setLicenseExpiry(license_id: string, expires_at: string|null){
  const db = getSqlite()
  if(db){ db.prepare('UPDATE licenses SET expires_at=? WHERE id=?').run(expires_at, license_id); return }
  const s = await jsonLoad(); const lic = s.licenses.find(l=> l.id===license_id); if(lic){ lic.expires_at = expires_at; await jsonSave(s) }
}

export async function revokeActivation(activation_id: string){
  const db = getSqlite()
  if(db){ db.prepare('UPDATE activations SET revoked=1 WHERE id=?').run(activation_id); return }
  const s = await jsonLoad(); const a = s.activations.find(x=> x.id===activation_id); if(a){ a.revoked=true; await jsonSave(s) }
}

export async function deleteLicense(license_id: string){
  const db = getSqlite()
  if(db){
    db.prepare('DELETE FROM activations WHERE license_id=?').run(license_id)
    db.prepare('DELETE FROM licenses WHERE id=?').run(license_id)
    return
  }
  const s = await jsonLoad()
  s.activations = s.activations.filter(a=> a.license_id!==license_id)
  s.licenses = s.licenses.filter(l=> l.id!==license_id)
  await jsonSave(s)
}

export async function unRevokeActivation(activation_id: string){
  const db = getSqlite()
  if(db){ db.prepare('UPDATE activations SET revoked=0 WHERE id=?').run(activation_id); return }
  const s = await jsonLoad(); const a = s.activations.find(x=> x.id===activation_id); if(a){ a.revoked=false; await jsonSave(s) }
}

export async function deleteDisabledOrExpired(): Promise<{ removed: number }>{
  const now = new Date()
  const db = getSqlite()
  if(db){
    const list = db.prepare('SELECT id, status, expires_at FROM licenses').all()
    let removed = 0
    const toDelete = list.filter((l:any)=> l.status==='disabled' || (l.expires_at && new Date(l.expires_at) < now))
    for(const lic of toDelete){
      db.prepare('DELETE FROM activations WHERE license_id=?').run(lic.id)
      db.prepare('DELETE FROM licenses WHERE id=?').run(lic.id)
      removed++
    }
    return { removed }
  }
  const s = await jsonLoad()
  const keep: License[] = []
  let removed = 0
  for(const lic of s.licenses){
    const expired = !!(lic.expires_at && new Date(lic.expires_at) < now)
    if(lic.status==='disabled' || expired){
      s.activations = s.activations.filter(a=> a.license_id!==lic.id)
      removed++
    } else {
      keep.push(lic)
    }
  }
  s.licenses = keep
  await jsonSave(s)
  return { removed }
}
