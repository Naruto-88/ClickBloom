import { Suspense } from 'react'

async function getData(){
  const res = await fetch(`${process.env.NEXTAUTH_URL || ''}/api/admin/license/list`, { cache:'no-store' })
  if(!res.ok) return { licenses:[], activations:[] }
  return res.json()
}

export default async function LicensesPage(){
  const data = await getData()
  const actsByLic: Record<string, any[]> = {}
  for(const a of data.activations||[]){ (actsByLic[a.license_id] ||= []).push(a) }
  return (
    <div className="container">
      <h2>Licenses</h2>
      <div className="card">
        <table className="table" style={{width:'100%'}}>
          <thead><tr><th>ID</th><th>Plan</th><th>Sites</th><th>Crawl Credits</th><th>Expires</th><th>Actions</th></tr></thead>
          <tbody>
            {(data.licenses||[]).map((l:any)=> (
              <tr key={l.id}>
                <td>{l.id.slice(0,8)}...</td>
                <td>{l.plan||'-'}</td>
                <td>{(actsByLic[l.id]||[]).length} / {l.max_sites}</td>
                <td>{l.crawl_credits ?? 'Unlimited'}</td>
                <td>{l.expires_at || '-'}</td>
                <td>
                  <form action="/api/admin/license/update" method="post" style={{display:'flex', gap:6}}>
                    <input type="hidden" name="license_id" value={l.id}/>
                    <input name="crawl_credits" className="input" placeholder="credits" defaultValue={l.crawl_credits??''} style={{width:120}}/>
                    <button className="btn" style={{height:36}}>Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{marginTop:12}}>
        <h3>Activations</h3>
        <table className="table" style={{width:'100%'}}>
          <thead><tr><th>License</th><th>Site</th><th>Created</th><th>Revoked</th></tr></thead>
          <tbody>
            {(data.activations||[]).map((a:any)=> (
              <tr key={a.id}><td>{a.license_id.slice(0,8)}...</td><td>{a.site_url}</td><td>{a.created_at}</td><td>{a.revoked? 'Yes':'No'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

