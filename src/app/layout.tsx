import "@/styles/globals.css"
import { ReactNode } from "react"
import { Providers } from "@/components/providers"

export const metadata = {
  title: "ClickBloom",
  description: "Audit, optimize and track SEO performance"
}

export default function RootLayout({ children }: { children: ReactNode }){
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
