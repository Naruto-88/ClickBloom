import { getPool, hasMySql, query } from '@/lib/db'

type Row = { k: string; v: string; expires_at: Date | null }

export async function sqlCacheGet<T=any>(key: string): Promise<T|null>{
  if(!hasMySql()) return null
  const rows = await query<Row>(`SELECT k, v, expires_at FROM kv_cache WHERE k=? LIMIT 1`, [key])
  if(rows.length===0) return null
  const r = rows[0]
  if(r.expires_at && r.expires_at.getTime() < Date.now()){
    try{ await query(`DELETE FROM kv_cache WHERE k=?`, [key]) }catch{}
    return null
  }
  try{ return JSON.parse(r.v) as T }catch{ return null }
}

export async function sqlCacheSet<T=any>(key: string, value: T, ttlSeconds?: number){
  if(!hasMySql()) return
  await query(
    `INSERT INTO kv_cache (k, v, expires_at) VALUES (?,?, ${ttlSeconds? 'DATE_ADD(NOW(), INTERVAL ? SECOND)' : 'NULL'})
     ON DUPLICATE KEY UPDATE v=VALUES(v), expires_at=VALUES(expires_at)`,
    ttlSeconds? [key, JSON.stringify(value), ttlSeconds] : [key, JSON.stringify(value)]
  )
}

