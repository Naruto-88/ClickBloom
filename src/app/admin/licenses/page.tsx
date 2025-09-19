import AdminGuard from "@/components/AdminGuard"
import { Sidebar } from "@/components/Sidebar"
import LicensesClient from "./LicensesClient"

export const dynamic = 'force-dynamic'

export default async function LicensesPage(){
  return (
    <AdminGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <div className="page-topbar">
            <div className="page-header" style={{marginBottom:0}}>
              <h2 style={{margin:0}}>Licenses</h2>
            </div>
          </div>
          <LicensesClient/>
        </main>
      </div>
    </AdminGuard>
  )
}
