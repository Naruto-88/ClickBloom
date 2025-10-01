import { sqlCacheGet } from '@/lib/sql-cache'

export type PlanName = 'basic'|'pro'|'agency'

export async function getMaxDaysForEmail(email?: string): Promise<number>{
  if(!email) return 30
  try{
    const key = `plan:${email.toLowerCase()}`
    const plan = await sqlCacheGet<{ name?: PlanName }>(key)
    const name = (plan?.name||'basic') as PlanName
    const map: Record<PlanName, number> = { basic: 30, pro: 365, agency: 3650 }
    return map[name] ?? 30
  }catch{ return 30 }
}

export function clampRangeByDays(start: string, end: string, maxDays: number){
  try{
    const sd = new Date(start), ed = new Date(end)
    const days = Math.max(1, Math.round((ed.getTime()-sd.getTime())/86400000)+1)
    if(days>maxDays){ const from = new Date(ed.getTime() - (maxDays-1)*86400000); return from.toISOString().slice(0,10) }
    return start
  }catch{ return start }
}

export async function getSiteLimitForEmail(email?: string): Promise<number>{
  if(!email) return 1
  try{
    const key = `plan:${email.toLowerCase()}`
    const plan = await sqlCacheGet<{ name?: PlanName }>(key as any) // dynamic import avoidance
    const name = (plan?.name||'basic') as PlanName
    const map: Record<PlanName, number> = { basic: 1, pro: 5, agency: 50 }
    return map[name] ?? 1
  }catch{ return 1 }
}
