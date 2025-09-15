import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"
import NextDynamic from "next/dynamic"

const ClientsDashboard = NextDynamic(()=> import("./ClientsDashboard"), { ssr: false })

export const dynamic = 'force-dynamic'

export default async function ClientsPage(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <ClientsDashboard/>
        </main>
      </div>
    </AuthGuard>
  )
}

