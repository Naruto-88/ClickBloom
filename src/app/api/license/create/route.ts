import { NextRequest, NextResponse } from 'next/server'
import { createLicense } from '@/lib/license'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  const admin = req.headers.get('x-admin-secret') || ''
  const expected = process.env.LICENSE_ADMIN_SECRET || ''
  if(!expected || admin !== expected){
    return NextResponse.json({ ok:false, error:'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(()=>({})) as { email?: string, plan?: string, max_sites?: number, expires_at?: string|null }
  const { key, license } = await createLicense(body)
  return NextResponse.json({ ok:true, key, license: { id: license.id, plan: license.plan, max_sites: license.max_sites, expires_at: license.expires_at } })
}
