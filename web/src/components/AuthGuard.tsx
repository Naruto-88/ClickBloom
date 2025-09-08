import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { ReactNode } from "react"
import { cookies } from 'next/headers'

export default async function AuthGuard({ children }: { children: ReactNode }){
  const session = await auth()
  const guest = cookies().get('guest')?.value === '1'
  if(!session && !guest){
    redirect('/login')
  }
  return <>{children}</>
}
