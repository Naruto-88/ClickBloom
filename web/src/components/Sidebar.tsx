"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/performance", label: "Performance" },
  { href: "/optimize", label: "Optimize" },
  { href: "/keywords", label: "Keywords" },
  { href: "/audit", label: "Site Audit" },
  { href: "/reports", label: "Reports" },
  { href: "/websites", label: "Websites" },
]

export function Sidebar(){
  const pathname = usePathname()
  return (
    <aside className="sidebar">
      <div className="logo">
        <span style={{width:10,height:10,background:"var(--accent)",borderRadius:3,display:"inline-block"}}/>
        <span>ClickBloom</span>
      </div>
      <nav>
        {items.map(it => (
          <Link key={it.href} href={it.href} className={pathname?.startsWith(it.href) ? "active" : ""}>{it.label}</Link>
        ))}
      </nav>
    </aside>
  )
}
