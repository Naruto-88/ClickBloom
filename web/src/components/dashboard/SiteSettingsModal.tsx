"use client"
import Modal from "@/components/ui/Modal"
import { useEffect, useMemo, useState } from "react"

export type SiteRecord = { id: string; name: string; url: string; industry?: string; description?: string; language?: string; country?: string; createdAt?: number }

export default function SiteSettingsModal({ open, onClose, site, onSave, onDelete, onRecrawl }:{ open:boolean, onClose:()=>void, site: SiteRecord|undefined, onSave:(s: SiteRecord)=>void, onDelete:(id:string)=>void, onRecrawl:(id:string)=>void }){
  const initial = useMemo(()=> site ? { ...site } : undefined, [site])
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [vw, setVw] = useState<number>(typeof window!=='undefined'? window.innerWidth : 1200)
  const [language, setLanguage] = useState("Original Page Content")
  const [country, setCountry] = useState("Original Page Content")
  const [industry, setIndustry] = useState("Others")
  const [desc, setDesc] = useState("")

  useEffect(()=>{
    if(!initial) return
    setName(initial.name||""); setUrl(initial.url||"")
    setLanguage(initial.language||"Original Page Content")
    setCountry(initial.country||"Original Page Content")
    setIndustry(initial.industry||"Others")
    setDesc(initial.description||"")
  }, [initial])

  useEffect(()=>{
    const onR = () => setVw(window.innerWidth)
    window.addEventListener('resize', onR)
    return ()=> window.removeEventListener('resize', onR)
  },[])

  if(!open || !site) return null

  const save = () => {
    onSave({ ...site, name, url, language, country, industry, description: desc })
  }

  const reset = () => {
    if(!initial) return
    setName(initial.name||""); setUrl(initial.url||"")
    setLanguage(initial.language||"Original Page Content")
    setCountry(initial.country||"Original Page Content")
    setIndustry(initial.industry||"Others")
    setDesc(initial.description||"")
  }

  const hostname = (()=>{ try{ return new URL(url||site.url||"").hostname }catch{ return (url||site.url||"") } })()

  const GrayIcon = ({ name }: { name: 'settings'|'sliders'|'compass'|'plug'|'robot'|'logs' }) => {
    const common = { width:18, height:18, viewBox:'0 0 24 24', stroke:'currentColor', fill:'none', strokeWidth:1.7 } as any
    const colorStyle = { color:'#9aa0b4' }
    switch(name){
      case 'settings':
        return (
          <svg {...common} style={colorStyle}>
            <path d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z"/>
            <path d="M19.4 15a7.97 7.97 0 0 0 .1-1 7.97 7.97 0 0 0-.1-1l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.4a.5.5 0 0 0-.6-.2l-2.5 1a8.2 8.2 0 0 0-1.7-1l-.4-2.7a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4l-.4 2.7a8.2 8.2 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.4a.5.5 0 0 0 .1.6L4.6 13a7.97 7.97 0 0 0-.1 1 7.97 7.97 0 0 0 .1 1L2.5 16.6a.5.5 0 0 0-.1.6l2 3.4a.5.5 0 0 0 .6.2l2.5-1a8.2 8.2 0 0 0 1.7 1l.4 2.7a.5.5 0 0 0 .5.4h4a.5.5 0 0 0 .5-.4l.4-2.7a8.2 8.2 0 0 0 1.7-1l2.5 1a.5.5 0 0 0 .6-.2l2-3.4a.5.5 0 0 0-.1-.6L19.4 15Z"/>
          </svg>
        )
      case 'sliders':
        return (
          <svg {...common} style={colorStyle}>
            <path d="M4 8h8M20 8h-4M10 8v8M14 16h6M4 16h4M14 16v-8"/>
          </svg>
        )
      case 'compass':
        return (
          <svg {...common} style={colorStyle}>
            <circle cx="12" cy="12" r="9"/>
            <path d="M10 14l2-6 6-2-2 6-6 2Z"/>
          </svg>
        )
      case 'plug':
        return (
          <svg {...common} style={colorStyle}>
            <path d="M8 12h8M9 7v5m6-5v5M12 12v5a3 3 0 0 1-3 3h0"/>
          </svg>
        )
      case 'robot':
        return (
          <svg {...common} style={colorStyle}>
            <rect x="5" y="8" width="14" height="9" rx="2"/>
            <circle cx="9" cy="12" r="1.5"/>
            <circle cx="15" cy="12" r="1.5"/>
            <path d="M12 8V5"/>
          </svg>
        )
      case 'logs':
        return (
          <svg {...common} style={colorStyle}>
            <rect x="5" y="4" width="14" height="16" rx="2"/>
            <path d="M9 8h6M9 12h6M9 16h6"/>
          </svg>
        )
    }
  }

  const singleCol = vw < 980

  return (
    <Modal open={open} onClose={onClose} wide>
      <div style={{display:'grid', gridTemplateColumns: singleCol? '1fr' : '320px 1fr', gap:16, width:'100%'}}>
        {/* Left column */}
        <div style={{background:'#0b0f1a', border:'1px solid #1f2937', borderRadius:12, padding:16, color:'#e5e7eb'}}>
          <div style={{height:180, borderRadius:8, background:'#111827', border:'1px solid #1f2937', marginBottom:12, overflow:'hidden', position:'relative'}}>
            {url || site.url ? (
              <iframe src={(url||site.url)} style={{position:'absolute', top:0, left:0, width:'200%', height:'200%', transform:'scale(.5)', transformOrigin:'0 0', border:0, pointerEvents:'none'}}/>
            ) : (
              <div style={{height:'100%', display:'grid', placeItems:'center', color:'#94a3b8'}}>Preview</div>
            )}
          </div>
          <div style={{textAlign:'center'}}>
            <a href={url||site.url} target="_blank" rel="noreferrer" style={{display:'block', fontWeight:800, fontSize:20, color:'#e5e7eb', textDecoration:'none'}}>
              {name||site.name}
            </a>
            <a href={url||site.url} target="_blank" rel="noreferrer" style={{color:'#93c5fd', textDecoration:'none'}}>
              {hostname}
            </a>
          </div>
          <div style={{height:16}}/>
          <div style={{display:'grid', gap:14}}>
            <div style={{display:'flex', alignItems:'center', gap:10, color:'#a78bfa'}}>
              <div style={{width:3, height:20, background:'#7c3aed', borderRadius:2}}/>
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <GrayIcon name="settings"/>
                <span style={{fontWeight:700}}>Settings</span>
              </div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:10, color:'#cbd0ea', opacity:.85}}><GrayIcon name="sliders"/> <span>Global Settings</span></div>
            <div style={{display:'flex', alignItems:'center', gap:10, color:'#cbd0ea', opacity:.85}}><GrayIcon name="compass"/> <span>Crawler settings</span></div>
            <div style={{display:'flex', alignItems:'center', gap:10, color:'#cbd0ea', opacity:.85}}><GrayIcon name="plug"/> <span>Integrations</span></div>
            <div style={{display:'flex', alignItems:'center', gap:10, color:'#cbd0ea', opacity:.85}}><GrayIcon name="robot"/> <span>Automation settings</span></div>
            <div style={{display:'flex', alignItems:'center', gap:10, color:'#cbd0ea', opacity:.85}}><GrayIcon name="logs"/> <span>Activity Logs</span></div>
          </div>
          <div style={{height:16}}/>
          <div style={{display:'flex', gap:10}}>
            <button className="btn secondary" style={{background:'#7f1d1d'}} onClick={()=>onDelete(site.id)}>Delete</button>
            <button className="btn secondary" onClick={reset}>Reset</button>
          </div>
          <div style={{height:10}}/>
          <button className="btn" style={{width:'100%', background:'#6d28d9'}} onClick={()=>onRecrawl(site.id)}>Recrawl</button>
        </div>

        {/* Right form */}
        <div style={{background:'#0b0f1a', border:'1px solid #1f2937', borderRadius:12, color:'#e5e7eb'}}>
          <div style={{borderBottom:'1px solid #1f2937', padding:'12px 16px', fontWeight:800}}>Settings</div>
          <div style={{padding:16}}>
            <div className="form-grid" style={{gridTemplateColumns: singleCol? '1fr' : '1fr 1fr', columnGap:16}}>
              <label>Website Name *</label>
              <label>Website URL *</label>
              <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="My Site"/>
              <div style={{display:'grid', gridTemplateColumns:'86px 1fr', gap:8}}>
                <input className="input" value="https://" readOnly/>
                <input className="input" value={hostname.replace(/^https?:\/\//,'')} onChange={e=>{ const h=e.target.value; setUrl((h.startsWith('http')?'': 'https://')+h) }} placeholder="example.com"/>
              </div>

              <label>Website Language *</label>
              <label>Website Country *</label>
              <select className="input" value={language} onChange={e=>setLanguage(e.target.value)}>
                <option>Original Page Content</option>
                <option>English</option>
                <option>Spanish</option>
                <option>French</option>
              </select>
              <select className="input" value={country} onChange={e=>setCountry(e.target.value)}>
                <option>Original Page Content</option>
                <option>United States</option>
                <option>Australia</option>
                <option>United Kingdom</option>
              </select>

              <label>Website Industry *</label>
              <div/>
              <select className="input" value={industry} onChange={e=>setIndustry(e.target.value)}>
                <option>Others</option>
                <option>eCommerce</option>
                <option>Services</option>
                <option>SaaS</option>
              </select>

              <label style={{gridColumn:'1 / -1'}}>Website Description *</label>
              <textarea className="textarea" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Description" style={{gridColumn:'1 / -1', minHeight:120}}/>
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', marginTop:14}}>
              <button className="btn" style={{background:'#6d28d9'}} onClick={save}>Save Changes</button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
