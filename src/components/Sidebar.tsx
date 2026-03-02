"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"

const items = [
  { href: "/dashboard", label: "Dashboard", icon: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></> },
  { href: "/performance", label: "Performance", icon: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></> },
  { href: "/optimize", label: "Optimize", icon: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /> },
  { href: "/keywords", label: "Keywords Tracker", icon: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></> },
  { href: "/audit", label: "Site Audit", icon: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></> },
  { href: "/reports", label: "Reports", icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></> },
  { href: "/clients", label: "Clients", icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></> },
  { href: "/websites", label: "Websites", icon: <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></> },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isAdmin = Boolean((session as any)?.user?.isAdmin)

  return (
    <aside className="sidebar">
      <div className="logo" style={{ marginBottom: 32 }}>
        <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', borderRadius: 10, display: 'grid', placeItems: 'center', boxShadow: '0 8px 16px rgba(139, 92, 246, 0.2)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 4.7 5.1.5-3.9 3.2 1.2 4.9L12 14.9 7.7 17.3 8.9 12.4 5 8.2l5.1-.5L12 3z" />
          </svg>
        </div>
        <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em' }}>ClickBloom</span>
      </div>
      <nav>
        {items.map(it => (
          <Link key={it.href} href={it.href} className={pathname?.startsWith(it.href) ? "active" : ""}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: pathname?.startsWith(it.href) ? 1 : 0.7 }}>
              {it.icon}
            </svg>
            {it.label}
          </Link>
        ))}
        {isAdmin && (
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ opacity: .5, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 16px 12px' }}>Admin Panel</div>
            <Link href="/admin" className={pathname === '/admin' ? "active" : ""}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
              Dashboard
            </Link>
            <Link href="/admin/licenses" className={pathname?.startsWith('/admin/licenses') ? "active" : ""}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              Licenses
            </Link>
          </div>
        )}
      </nav>
    </aside>
  )
}
