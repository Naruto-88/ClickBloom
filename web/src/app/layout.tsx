import "@/styles/globals.css"
import { ReactNode } from "react"
import { Providers } from "@/components/providers"
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "ClickBloom",
  description: "Audit, optimize and track SEO performance"
}

export default function RootLayout({ children }: { children: ReactNode }){
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
