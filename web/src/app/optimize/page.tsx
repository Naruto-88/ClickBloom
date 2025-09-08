import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"
import OptimizeClient from "./OptimizeClient"

export default async function Optimize(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <OptimizeClient/>
        </main>
      </div>
    </AuthGuard>
  )
}
