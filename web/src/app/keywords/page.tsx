import AuthGuard from "@/components/AuthGuard"
import { Sidebar } from "@/components/Sidebar"
import WebsitePicker from "@/components/dashboard/WebsitePicker"
import dynamic from 'next/dynamic'

const KeywordsClient = dynamic(()=> import('./KeywordsClient'), { ssr: false })

export default async function Keywords(){
  return (
    <AuthGuard>
      <div className="layout">
        <Sidebar/>
        <main className="content">
          <div className="page-topbar"><WebsitePicker/></div>
          <div className="page-header">
            <h2 style={{margin:0, display:'flex', alignItems:'center', gap:8}}>
              Keywords Tracker
              <span
                className="badge"
                style={{
                  background: 'var(--preset-active-bg)',
                  borderColor: 'var(--preset-active-border)',
                  color: 'var(--preset-active-fg)'
                }}
              >
                BETA
              </span>
            </h2>
          </div>
          <KeywordsClient/>
        </main>
      </div>
    </AuthGuard>
  )
}

