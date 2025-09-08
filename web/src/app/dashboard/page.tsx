import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"
import NextDynamic from "next/dynamic"
const DashboardView = NextDynamic(()=> import("./DashboardView"), { ssr: false })

export const dynamic = 'force-dynamic'

export default async function Dashboard(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <DashboardView/>
        </main>
      </div>
    </AuthGuard>
  )
}
