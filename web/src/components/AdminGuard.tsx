import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { ReactNode } from "react"

function isAdminEmail(email?: string | null){
  if(!email) return false
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)
  if(list.length===0) return true // if not configured, allow any signed-in user
  return list.includes(email.toLowerCase())
}

export default async function AdminGuard({ children }: { children: ReactNode }){
  const session = await auth()
  const email = (session as any)?.user?.email as string | undefined
  if(!session || !isAdminEmail(email)){
    redirect('/')
  }
  return <>{children}</>
}

