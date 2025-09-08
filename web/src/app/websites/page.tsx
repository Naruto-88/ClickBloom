import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"
import WebsitesClient from "./WebsitesClient"

export default async function Websites(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <WebsitesClient/>
        </main>
      </div>
    </AuthGuard>
  )
}
