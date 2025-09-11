import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"
import WebsitePicker from "@/components/dashboard/WebsitePicker"

export default async function Audit(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <div className="page-topbar"><WebsitePicker/></div>
          <div className="page-header">
            <h2 style={{margin:0}}>Site Audit</h2>
          </div>
          <div className="card">Crawler + technical checks to be added. For now we will show issues like missing meta, broken links, slow pages etc.</div>
        </main>
      </div>
    </AuthGuard>
  )
}

