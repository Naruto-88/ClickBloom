import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"

export default async function Keywords(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <h2>Keywords</h2>
          <div className="card">Demo keywords table coming soon.</div>
        </main>
      </div>
    </AuthGuard>
  )
}

