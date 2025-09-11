import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"
import PerformanceClient from "./PerformanceClient"

export default async function Performance(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <div className="page-header">
            <h2 style={{margin:0}}>Performance</h2>
          </div>
          <PerformanceClient/>
        </main>
      </div>
    </AuthGuard>
  )
}

