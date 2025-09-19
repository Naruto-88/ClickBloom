import { NextRequest, NextResponse } from 'next/server'
import { loadStore, saveStore, setLicenseStatus } from '@/lib/license'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  const admin = req.headers.get('x-admin-secret') || ''
  const expected = process.env.LICENSE_ADMIN_SECRET || ''
  if(!expected || admin !== expected){
    return NextResponse.json({ ok:false, error:'Unauthorized' }, { status: 401 })
  }
  const { license_id, status } = await req.json()
  if(!license_id) return NextResponse.json({ ok:false, error:'Missing license_id' }, { status: 400 })
  const store = await loadStore()
  const lic = store.licenses.find(l=> l.id===license_id)
  if(!lic) return NextResponse.json({ ok:false, error:'Not found' }, { status: 404 })
  if(status && (status==='active' || status==='disabled')) await setLicenseStatus(license_id, status)
  return NextResponse.json({ ok:true })
}
