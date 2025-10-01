import "@/styles/globals.css"
import { ReactNode } from "react"
import { Providers } from "@/components/providers"
import { ThemeToggle } from "@/components/ThemeToggle"

export const metadata = {
  title: "ClickBloom",
  description: "Audit, optimize and track SEO performance"
}

export default function RootLayout({ children }: { children: ReactNode }){
  return (
    <html lang="en">
      <head>
        {/* Performance hints for third‑party APIs used by the app */}
        <link rel="preconnect" href="https://www.googleapis.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://analyticsdata.googleapis.com" crossOrigin="anonymous" />
        <meta name="color-scheme" content="light dark" />
        {/* Set theme early to avoid FOUC */}
        <script
          dangerouslySetInnerHTML={{ __html: `
            (function(){
              try{
                var t = localStorage.getItem('theme');
                if(!t){ t = 'dark'; }
                document.documentElement.dataset.theme = t;
              }catch(e){ document.documentElement.dataset.theme = 'light'; }
            })();
          `}}
        />
      </head>
      <body>
        <Providers>
          <ThemeToggle />
          {children}
        </Providers>
      </body>
    </html>
  )
}
