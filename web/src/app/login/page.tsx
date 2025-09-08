"use client"
import { signIn } from "next-auth/react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

function LoginInner(){
  const search = useSearchParams()
  const error = search?.get('error')
  return (
    <div className="container" style={{display:'grid',gridTemplateColumns:'1.1fr .9fr',gap:32,minHeight:'100vh',alignItems:'center'}}>
      <section>
        <h1 style={{fontSize:48,margin:0,fontWeight:800}}>ClickBloom</h1>
        <p className="muted" style={{maxWidth:520}}>Skyrocket your organic traffic in minutes, not months. Analyze, audit and optimize your entire site with AI-assisted workflows.</p>
      </section>
      <section className="card" style={{maxWidth:520, margin:'0 0 0 auto'}}>
        <h2 style={{marginTop:0}}>Sign In</h2>
        {error && <div style={{marginBottom:12, color:'var(--warning)'}}>Auth error: {error}</div>}
        <button className="btn" style={{width:'100%'}} onClick={() => signIn('google', { callbackUrl: '/pricing' })}>
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M44.5 20H43V20H24V28H36.9C35 33.5 29.9 37 24 37C16.8 37 11 31.2 11 24C11 16.8 16.8 11 24 11C27.1 11 29.9 12.1 32.1 14L38.8 7.3C35.2 4.1 29.9 2 24 2C10.7 2 0 12.7 0 26C0 39.3 10.7 50 24 50C37.3 50 48 39.3 48 26C48 24.3 47.8 22.6 47.5 21L44.5 20Z" fill="#fff"/></svg>
          Sign in with Google
        </button>
        <div style={{height:12}}/>
        <div style={{height:12}}/>
        <a className="btn secondary" href="/api/guest-login" style={{width:'100%', justifyContent:'center'}}>Continue as Guest (temporary)</a>
      </section>
    </div>
  )
}

export default function Login(){
  return (
    <Suspense>
      <LoginInner/>
    </Suspense>
  )
}
