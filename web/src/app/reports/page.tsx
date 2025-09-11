import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"
import WebsitePicker from "@/components/dashboard/WebsitePicker"

export default async function Reports(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <div className="page-topbar"><WebsitePicker/></div>
          <div className="page-header">
            <h2 style={{margin:0}}>Reports</h2>
          </div>
          <div className="card">Export to PDF/CSV and scheduled email reports will appear here.</div>
        </main>
      </div>
    </AuthGuard>
  )
}

