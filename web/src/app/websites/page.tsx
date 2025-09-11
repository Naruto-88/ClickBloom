import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"
import WebsitePicker from "@/components/dashboard/WebsitePicker"
import WebsitesClient from "./WebsitesClient"

export default async function Websites(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <div className="page-topbar"><WebsitePicker/></div>
          <WebsitesClient/>
        </main>
      </div>
    </AuthGuard>
  )
}
