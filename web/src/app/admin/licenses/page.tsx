import AuthGuard from "@/components/AuthGuard"
import AdminGuard from "@/components/AdminGuard"
import { Sidebar } from "@/components/Sidebar"
import { loadStore, revokeActivation, setLicenseStatus, createLicense, deleteLicense, unRevokeActivation, deleteDisabledOrExpired } from "@/lib/license"
import { revalidatePath } from "next/cache"
import MintForm from "./MintForm"

async function mint(formData: FormData){
  'use server'
  const email = String(formData.get('email')||'')
  const plan = String(formData.get('plan')||'standard')
  const max = Math.max(1, Number(formData.get('max_sites')||'1'))
  const expires = String(formData.get('expires_at')||'')
  const { key } = await createLicense({ email, plan, max_sites: max, expires_at: expires||null })
  revalidatePath('/admin/licenses')
  return { key }
}
async function mintState(_prev: any, formData: FormData){
  'use server'
  return mint(formData)
}

export default async function LicensesAdmin(){
  const store = await loadStore()
  const usedCounts = new Map<string, number>()
  for(const a of store.activations){ if(!a.revoked){ usedCounts.set(a.license_id, (usedCounts.get(a.license_id)||0)+1) } }
  async function doRevoke(formData: FormData){
    'use server'
    const id = String(formData.get('activation_id')||'')
    if(id){ await revokeActivation(id); revalidatePath('/admin/licenses') }
  }
  async function toggleStatus(formData: FormData){
    'use server'
    const id = String(formData.get('license_id')||'')
    const status = String(formData.get('status')||'') as any
    if(id && (status==='active' || status==='disabled')){ await setLicenseStatus(id, status); revalidatePath('/admin/licenses') }
  }
  async function doUnrevoke(formData: FormData){
    'use server'
    const id = String(formData.get('activation_id')||'')
    if(id){ await unRevokeActivation(id); revalidatePath('/admin/licenses') }
  }
  async function bulkDeleteDisabled(formData: FormData){
    'use server'
    await deleteDisabledOrExpired(); revalidatePath('/admin/licenses')
  }
  return (
    <AuthGuard>
      <AdminGuard>
        <div className="layout">
          <Sidebar/>
          <main className="content">
            <h2 style={{marginTop:0}}>Licenses</h2>
            <div className="card" style={{marginBottom:16}}>
              <div className="panel-title"><strong>Mint License</strong></div>
              <MintForm action={mintState}/>
              <div className="muted" style={{marginTop:8}}>Keys are generated server‑side and stored hashed.</div>
            </div>

            <div className="card" style={{marginBottom:16}}>
              <div className="panel-title"><strong>Bulk Actions</strong></div>
              <form action={bulkDeleteDisabled}>
                <button className="btn secondary">Delete Disabled/Expired Licenses</button>
              </form>
            </div>

            <div className="card">
              <div className="panel-title"><strong>All Licenses</strong><span className="badge">{store.licenses.length} total</span></div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Owner</th>
                      <th>Plan</th>
                      <th>Status</th>
                      <th>Toggle</th>
                      <th>Seats</th>
                      <th>Expires</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {store.licenses.map(l=> (
                      <tr key={l.id}>
                        <td className="url">{l.id}</td>
                        <td>{l.owner_email||'-'}</td>
                        <td>{l.plan||'-'}</td>
                        <td>{l.status}</td>
                        <td>
                          <form action={toggleStatus}>
                            <input type="hidden" name="license_id" value={l.id}/>
                            <select className="input" name="status" defaultValue={l.status}>
                              <option value="active">active</option>
                              <option value="disabled">disabled</option>
                            </select>
                            <button className="btn secondary" style={{height:36, marginLeft:6}}>Update</button>
                          </form>
                          <form action={async (formData: FormData)=>{ 'use server'; const id = String(formData.get('license_id')||''); if(id){ await deleteLicense(id); revalidatePath('/admin/licenses') } }} style={{display:'inline-block', marginLeft:6}}>
                            <input type="hidden" name="license_id" value={l.id}/>
                            <button className="btn secondary" style={{height:36}}>Delete</button>
                          </form>
                        </td>
                        <td>{usedCounts.get(l.id)||0}/{l.max_sites}</td>
                        <td>{l.expires_at||'-'}</td>
                        <td>{new Date(l.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={{marginTop:16}}>
              <div className="panel-title"><strong>Activations</strong><span className="badge">{store.activations.length}</span></div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>License</th>
                      <th>Site</th>
                      <th>Created</th>
                      <th>Revoked</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {store.activations.map(a=> (
                      <tr key={a.id}>
                        <td className="url">{a.license_id}</td>
                        <td className="url">{a.site_url}</td>
                        <td>{new Date(a.created_at).toLocaleString()}</td>
                        <td>{a.revoked? 'Yes':'No'}</td>
                        <td>
                          {!a.revoked ? (
                            <form action={doRevoke}>
                              <input type="hidden" name="activation_id" value={a.id}/>
                              <button className="btn secondary" style={{height:32}}>Revoke</button>
                            </form>
                          ) : (
                            <form action={doUnrevoke}>
                              <input type="hidden" name="activation_id" value={a.id}/>
                              <button className="btn secondary" style={{height:32}}>Unrevoke</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </main>
        </div>
      </AdminGuard>
    </AuthGuard>
  )
}


