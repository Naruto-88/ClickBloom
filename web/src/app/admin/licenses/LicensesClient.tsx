"use client"
import { useEffect, useState } from 'react'

type Lic = { id:string, plan?:string, max_sites:number, crawl_credits?:number, status:'active'|'disabled', created_at:string, expires_at?:string|null }
type Act = { id:string, license_id:string, site_url:string, created_at:string, revoked?:boolean }

export default function LicensesClient(){
  const [licenses, setLicenses] = useState<Lic[]>([])
  const [acts, setActs] = useState<Act[]>([])
  const [search, setSearch] = useState('')
  const [gen, setGen] = useState({ email:'', plan:'standard', max_sites:1, crawl_credits:'', expires_at:'' })
  const [genKey, setGenKey] = useState<string>('')

  const load = async ()=>{
    const r = await fetch('/api/admin/license/list'); const j = await r.json(); setLicenses(j.licenses||[]); setActs(j.activations||[])
  }
  useEffect(()=>{ load() },[])

  const copy = (s:string)=>{ if(!s) return; navigator.clipboard?.writeText(s).catch(()=>{}); }

  const doCreate = async ()=>{
    const body:any = { email:gen.email||undefined, plan:gen.plan, max_sites:Number(gen.max_sites)||1 }
    if(gen.crawl_credits) body.crawl_credits = Number(gen.crawl_credits)
    if(gen.expires_at) body.expires_at = gen.expires_at
    const r = await fetch('/api/admin/license/create', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
    const j = await r.json(); if(!j?.ok){ alert(j?.error||'Create failed'); return }
    setGenKey(j.key); await load()
  }

  const doDelete = async (id:string)=>{ if(!confirm('Delete license?')) return; await fetch('/api/admin/license/delete', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ license_id:id }) as any }); await load() }

  const actsByLic: Record<string, Act[]> = {}; acts.forEach(a=> (actsByLic[a.license_id] ||= []).push(a))
  const filtered = licenses.filter(l=> !search || (l.id.includes(search) || (l.plan||'').includes(search)))

  return (
    <div className="card">
      <h3>Generate License</h3>
      <div className="form-grid" style={{gridTemplateColumns:'1fr 1fr 1fr 1fr'}}>
        <input className="input" placeholder="Owner Email" value={gen.email} onChange={e=>setGen({...gen, email:e.target.value})}/>
        <input className="input" placeholder="Plan" value={gen.plan} onChange={e=>setGen({...gen, plan:e.target.value})}/>
        <input className="input" placeholder="Max Sites" value={gen.max_sites} onChange={e=>setGen({...gen, max_sites: Number(e.target.value)||1})}/>
        <input className="input" placeholder="Crawl Credits" value={gen.crawl_credits} onChange={e=>setGen({...gen, crawl_credits:e.target.value})}/>
        <label style={{gridColumn:'1 / -1'}}>Expires At (YYYY-MM-DD or empty)</label>
        <input className="input" placeholder="2026-12-31" value={gen.expires_at} onChange={e=>setGen({...gen, expires_at:e.target.value})} style={{gridColumn:'1 / -1'}}/>
      </div>
      <div className="actions">
        <button className="btn" onClick={doCreate}>Generate</button>
        {genKey && <button className="btn secondary" onClick={()=>copy(genKey)}>Copy New Key</button>}
      </div>

      <div className="toolbar" style={{marginTop:8}}>
        <input className="input" placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:320}}/>
      </div>

      <table className="table" style={{width:'100%'}}>
        <thead><tr><th>ID</th><th>Plan</th><th>Status</th><th>Sites</th><th>Crawl Credits</th><th>Expires</th><th>Actions</th></tr></thead>
        <tbody>
          {filtered.map(l=>{
            const expired = !!(l.expires_at && new Date(l.expires_at) < new Date())
            const status = expired? 'Expired' : (l.status==='active'? 'Active':'Disabled')
            const badgeStyle:any = status==='Active'? { background:'#0b1f16', border:'1px solid #1e3d2f', color:'#34d399' } : (status==='Expired'? { background:'#2a1212', border:'1px solid #432020', color:'#fca5a5' } : { background:'#2a1212', border:'1px solid #432020', color:'#f87171' })
            const used = (actsByLic[l.id]||[]).length
            // Update credits and expiry inline
            const [credits, setCreds] = [l.crawl_credits, (v:number)=>fetch('/api/admin/license/update', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ license_id:l.id, crawl_credits:v }) }).then(()=>load())]
            const [exp, setExp] = [l.expires_at||'', (v:string)=>fetch('/api/admin/license/update', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ license_id:l.id, crawl_credits: l.crawl_credits||0, expires_at:v||null }) }).then(()=>load())]
            return (
              <tr key={l.id}>
                <td>{l.id.slice(0,8)}...</td>
                <td>{l.plan||'-'}</td>
                <td><span style={{fontSize:12, padding:'2px 6px', borderRadius:999, ...badgeStyle }}>{status}</span></td>
                <td>{used} / {l.max_sites}</td>
                <td>
                  <div style={{display:'flex', gap:8}}>
                    <input className="input" defaultValue={l.crawl_credits??''} onBlur={e=>{ const n = Number(e.target.value); if(!Number.isNaN(n)) setCreds(n) }} style={{width:120}}/>
                  </div>
                </td>
                <td>
                  <input className="input" defaultValue={exp} onBlur={e=> setExp(e.target.value)} style={{width:140}}/>
                </td>
                <td>
                  <button className="btn secondary" onClick={()=>doDelete(l.id)}>Delete</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

