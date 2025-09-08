import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"

export default async function Reports(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <h2>Reports</h2>
          <div className="card">Export to PDF/CSV and scheduled email reports will appear here.</div>
        </main>
      </div>
    </AuthGuard>
  )
}

