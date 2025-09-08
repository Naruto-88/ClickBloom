import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"

export default async function Audit(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <h2>Site Audit</h2>
          <div className="card">Crawler + technical checks to be added. For now we will show issues like missing meta, broken links, slow pages etc.</div>
        </main>
      </div>
    </AuthGuard>
  )
}

