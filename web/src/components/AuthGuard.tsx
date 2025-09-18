import { auth } from "@/lib/auth"
import { getUser, upsertUser } from "@/lib/users"
import { redirect } from "next/navigation"
import { ReactNode } from "react"
import { cookies } from 'next/headers'

export default async function AuthGuard({ children }: { children: ReactNode }){
  const session = await auth()
  const guest = cookies().get('guest')?.value === '1'
  if(!session && !guest){
    redirect('/login')
  }
  const email = (session as any)?.user?.email as string | undefined
  if(email){
    const record = await getUser(email)
    if(record?.status === 'blocked'){
      redirect('/login?error=AccessDenied')
    }
    if(!record){
      await upsertUser({
        email,
        name: (session as any)?.user?.name,
        image: (session as any)?.user?.image
      })
    }
  }
  return <>{children}</>
}
