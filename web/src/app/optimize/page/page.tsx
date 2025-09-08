import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"
import PageClient from "./PageClient"

export default async function PageOptimization(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <PageClient/>
        </main>
      </div>
    </AuthGuard>
  )
}

