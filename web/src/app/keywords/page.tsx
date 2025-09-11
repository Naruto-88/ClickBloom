import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"
import WebsitePicker from "@/components/dashboard/WebsitePicker"

export default async function Keywords(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <div className="page-topbar"><WebsitePicker/></div>
          <div className="page-header">
            <h2 style={{margin:0}}>Keywords</h2>
          </div>
          <div className="card">Demo keywords table coming soon.</div>
        </main>
      </div>
    </AuthGuard>
  )
}

