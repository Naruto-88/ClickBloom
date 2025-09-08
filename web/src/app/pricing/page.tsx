"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

const allowFree = (process.env.NEXT_PUBLIC_ALLOW_FREE === 'true' || process.env.ALLOW_FREE_ACCESS === 'true' || process.env.ALLOW_FREE_ACCESS === undefined)
const enablePayments = (process.env.NEXT_PUBLIC_ENABLE_PAYMENTS === 'true' || process.env.ENABLE_PAYMENTS === 'true')

type Plan = {
  id: string; name: string; price: number; period: 'Mon' | 'Year'; features: string[];
}

const plans: Plan[] = [
  { id:'solo', name:'Solo', price:59, period:'Mon', features:['1 Website & 1 User', 'Crawl Up To 2000 Pages', '1‑Click Technical Issues Fix', 'Titles Optimization', 'Meta Description Optimization', 'Images Alt & Title Generation', 'Schema Markup Generation', 'Internal Links Generation', 'Headings Optimization', 'Content Optimization']},
  { id:'business', name:'Business', price:79, period:'Mon', features:['Everything in Solo', 'Higher limits', 'Team access']},
  { id:'agency', name:'Agency', price:399, period:'Mon', features:['Everything in Business', 'Multiple workspaces', 'Priority support']},
]

declare global {
  interface Window { paypal?: any }
}

export default function Pricing(){
  const [active, setActive] = useState('solo')
  const selected = useMemo(()=> plans.find(p=>p.id===active)!, [active])

  useEffect(()=>{
    if(!enablePayments) return
    if(window.paypal) return
    const script = document.createElement('script')
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || ''
    const env = (process.env.NEXT_PUBLIC_PAYPAL_ENV || process.env.PAYPAL_ENV || 'sandbox')
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture&components=buttons&enable-funding=card&commit=true&debug=false&${env==='sandbox'?'buyer-country=US':''}`
    script.async = true
    document.body.appendChild(script)
  },[])

  const handleSubscribe = async ()=>{
    if(!enablePayments){
      window.location.href = '/dashboard'
      return
    }
    const Buttons = window.paypal?.Buttons
    if(!Buttons){ alert('PayPal not loaded'); return }
    Buttons({
      createOrder: (_:any, actions:any) => actions.order.create({
        purchase_units: [{ amount: { value: String(selected.price) }, description: `${selected.name} Plan (${selected.period})` }]
      }),
      onApprove: async (_:any, actions:any) => {
        await actions.order.capture()
        window.location.href = '/dashboard'
      },
      onError: (err:any)=>{ console.error(err); alert('Payment error') }
    }).render('#paypal-container')
  }

  return (
    <div className="container" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
      <div>
        <h2>Ready to Skyrocket Your Google Rankings?</h2>
        <div className="pricing-toggle">
          <button className="active">Monthly</button>
          <button>Annual</button>
        </div>
        <div style={{height:16}}/>
        {plans.map(p=> (
          <div key={p.id} className={`plan ${p.id===active?'active':''}`} onClick={()=>setActive(p.id)}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:10,height:10,borderRadius:999,background:p.id===active?'#22c55e':'#3f3f68'}}/>
                <strong>{p.name}</strong>
              </div>
              <div className="muted">Perfect for {p.id==='solo'?'solo webmasters & freelancers': p.id==='business'?'small businesses & professionals':'agencies and large teams'}</div>
            </div>
            <div style={{fontSize:28,fontWeight:800}}>${p.price}<span className="muted" style={{fontSize:14}}>/{p.period}</span></div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3 style={{marginTop:0}}>What's in {selected.name} Plan?</h3>
        <ul className="checklist">
          {selected.features.map(f=> <li key={f}>✅ {f}</li>)}
        </ul>
        <div style={{height:16}}/>
        <button id="subscribe" className="btn" onClick={handleSubscribe}>Subscribe</button>
        {allowFree && (
          <>
            <span className="muted" style={{display:'block',margin:'8px 0'}}>or</span>
            <Link className="btn secondary" href="/dashboard">Continue without buying (temp)</Link>
          </>
        )}
        <div id="paypal-container" style={{marginTop:16}} />
      </div>
    </div>
  )
}
