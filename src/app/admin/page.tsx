import AdminGuard from "@/components/AdminGuard"
import { Sidebar } from "@/components/Sidebar"
import AdminDashboardClient from "./AdminDashboardClient"

export const dynamic = 'force-dynamic'

export default async function AdminPage(){
  return (
    <AdminGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <div className="page-topbar">
            <div className="page-header" style={{marginBottom:0}}>
              <h2 style={{margin:0}}>Administration</h2>
            </div>
          </div>
          <AdminDashboardClient/>
        </main>
      </div>
    </AdminGuard>
  )
}
