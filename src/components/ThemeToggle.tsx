"use client"
import { useEffect, useState } from "react"

function applyTheme(theme: 'light'|'dark'){
  try{
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
    // Prefer correct color-scheme for form controls
    const meta = document.querySelector('meta[name="color-scheme"]') as HTMLMetaElement | null
    if(meta) meta.content = theme === 'dark' ? 'dark light' : 'light dark'
  }catch{}
}

export function ThemeToggle(){
  const [theme, setTheme] = useState<'light'|'dark'>(()=> 'light')
  useEffect(()=>{
    try{
      const stored = (localStorage.getItem('theme') as 'light'|'dark' | null)
      const initial = stored || 'light'
      setTheme(initial)
      applyTheme(initial)
    }catch{}
  }, [])
  return (
    <button
      aria-label="Toggle theme"
      title={theme==='dark'? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={()=>{ const next = theme==='dark'? 'light':'dark'; setTheme(next); applyTheme(next) }}
      className="theme-toggle"
    >
      {theme==='dark' ? (
        // Sun icon
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4V2m0 20v-2M4 12H2m20 0h-2M5.64 5.64L4.22 4.22m15.56 15.56-1.42-1.42M18.36 5.64l1.42-1.42M5.64 18.36l-1.42 1.42M12 8a4 4 0 100 8 4 4 0 000-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ) : (
        // Moon icon
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      )}
    </button>
  )
}

