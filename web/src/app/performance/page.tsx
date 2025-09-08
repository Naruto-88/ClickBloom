import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"

export default async function Performance(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <h2>Performance</h2>
          <div className="card">Coming soon: GA4 + GSC connectors for performance trends.</div>
        </main>
      </div>
    </AuthGuard>
  )
}

