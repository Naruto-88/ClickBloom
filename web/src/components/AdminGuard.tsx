import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { redirect } from "next/navigation"
import { ReactNode } from "react"

export default async function AdminGuard({ children }: { children: ReactNode }){
  const session = await auth()
  const email = (session as any)?.user?.email as string | undefined
  if(!session || !isAdminEmail(email)){
    redirect('/')
  }
  return <>{children}</>
}
