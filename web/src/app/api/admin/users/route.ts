import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'
import { blockUser, listUsers, removeUser, unblockUser } from '@/lib/users'

async function ensureAdmin(){
  const session = await auth()
  const email = (session as any)?.user?.email as string | undefined
  if(!session || !isAdminEmail(email)){
    return null
  }
  return email
}

export async function GET(){
  const adminEmail = await ensureAdmin()
  if(!adminEmail){
    return NextResponse.json({ ok:false, error:'Forbidden' }, { status:403 })
  }
  const users = await listUsers()
  return NextResponse.json({ ok:true, users })
}

export async function POST(req: NextRequest){
  const adminEmail = await ensureAdmin()
  if(!adminEmail){
    return NextResponse.json({ ok:false, error:'Forbidden' }, { status:403 })
  }
  const body = await req.json().catch(()=>null)
  const action = body?.action as 'block'|'unblock'|'delete'|undefined
  const email = body?.email as string | undefined
  if(!action || !email){
    return NextResponse.json({ ok:false, error:'Missing action or email' }, { status:400 })
  }
  if(email.toLowerCase() === adminEmail.toLowerCase()){
    return NextResponse.json({ ok:false, error:'You cannot perform this action on your own account' }, { status:400 })
  }
  if(action === 'block'){
    const user = await blockUser(email, adminEmail)
    if(!user){
      return NextResponse.json({ ok:false, error:'User not found' }, { status:404 })
    }
    return NextResponse.json({ ok:true, user })
  }
  if(action === 'unblock'){
    const user = await unblockUser(email)
    if(!user){
      return NextResponse.json({ ok:false, error:'User not found' }, { status:404 })
    }
    return NextResponse.json({ ok:true, user })
  }
  if(action === 'delete'){
    const removed = await removeUser(email)
    if(!removed){
      return NextResponse.json({ ok:false, error:'User not found' }, { status:404 })
    }
    return NextResponse.json({ ok:true })
  }
  return NextResponse.json({ ok:false, error:'Unsupported action' }, { status:400 })
}
