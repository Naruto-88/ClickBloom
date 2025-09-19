import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"
import WebsitesClient from "./WebsitesClient"
import WebsitesTopbarClient from "./WebsitesTopbarClient"

export default async function Websites(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <WebsitesTopbarClient/>
          <WebsitesClient/>
        </main>
      </div>
    </AuthGuard>
  )
}
