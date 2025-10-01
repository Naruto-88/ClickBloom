"use client"
import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"

type AdminUser = {
  email: string
  name?: string | null
  image?: string | null
  createdAt: string
  lastLoginAt: string
  status: 'active' | 'blocked'
  blockedAt?: string | null
  blockedBy?: string | null
}

type LoadState = 'idle' | 'loading' | 'error'

function formatDate(value?: string | null){
  if(!value) return '-'
  try{
    const date = new Date(value)
    return date.toLocaleString()
  }catch{
    return value
  }
}

export default function AdminDashboardClient(){
  const { data: session } = useSession()
  const currentEmail = (session as any)?.user?.email as string | undefined
  const [users, setUsers] = useState<AdminUser[]>([])
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [plans, setPlans] = useState<Record<string, string>>({})

  const load = async()=>{
    setState('loading')
    setError(null)
    try{
      const res = await fetch('/api/admin/users', { cache:'no-store' })
      if(!res.ok){
        throw new Error(`Request failed (${res.status})`)
      }
      const data = await res.json()
      setUsers(Array.isArray(data?.users) ? data.users : [])
      setState('idle')
      // Load plans for each user
      try{
        const emails: string[] = (Array.isArray(data?.users)? data.users:[]).map((u:any)=>u.email)
        const next: Record<string,string> = {}
        await Promise.all(emails.map(async(email)=>{
          try{ const r = await fetch('/api/admin/plan?email='+encodeURIComponent(email)); const j= await r.json(); if(j?.plan?.name) next[email]=j.plan.name }catch{}
        }))
        setPlans(next)
      }catch{}
    }catch(err:any){
      setError(err?.message || 'Failed to load users')
      setState('error')
    }
  }

  useEffect(()=>{ load() }, [])

  const activeCount = useMemo(()=> users.filter(u=>u.status==='active').length, [users])
  const blockedCount = useMemo(()=> users.filter(u=>u.status==='blocked').length, [users])

  const runAction = async(action: 'block'|'unblock'|'delete', email: string)=>{
    if(action === 'delete' && !confirm(`Remove ${email} from ClickBloom? This will delete their history.`)){
      return
    }
    setBusyKey(`${action}:${email}`)
    setError(null)
    try{
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, email })
      })
      if(!res.ok){
        const body = await res.json().catch(()=>({}))
        throw new Error(body?.error || `Action failed (${res.status})`)
      }
      const body = await res.json()
      if(action === 'delete'){
        setUsers(prev => prev.filter(u => u.email !== email))
      }else if(body?.user){
        setUsers(prev => prev.map(u => u.email === email ? body.user : u))
      }
    }catch(err:any){
      setError(err?.message || 'Action failed')
    }finally{
      setBusyKey(null)
    }
  }

  return (
    <div className="card" style={{padding:16, display:'grid', gap:16}}>
      <header style={{display:'flex', flexWrap:'wrap', gap:16, justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <h2 style={{margin:0}}>Admin Dashboard</h2>
          <p className="muted" style={{margin:'4px 0 0 0'}}>Manage user access and monitor licenses from a single hub.</p>
        </div>
        <div style={{display:'flex', gap:12}}>
          <div className="chip" style={{background:'#162042', border:'1px solid #243266', padding:'8px 12px', borderRadius:12}}>
            <strong>{activeCount}</strong> active
          </div>
          <div className="chip" style={{background:'#2b152b', border:'1px solid #4c244c', padding:'8px 12px', borderRadius:12}}>
            <strong>{blockedCount}</strong> blocked
          </div>
        </div>
      </header>

      <section>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <h3 style={{margin:0}}>Users</h3>
          <button className="btn secondary" onClick={load} disabled={state==='loading'}>
            {state==='loading' ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {error && (
          <div style={{marginBottom:12, padding:'10px 12px', borderRadius:8, border:'1px solid #4c2c2c', background:'#2b152b', color:'#f59e0b'}}>
            {error}
          </div>
        )}
        <div style={{overflowX:'auto'}}>
          <table className="table" style={{width:'100%', borderCollapse:'separate', borderSpacing:'0 8px'}}>
            <thead>
              <tr className="muted" style={{textAlign:'left'}}>
                <th style={{padding:'8px 12px'}}>User</th>
                <th style={{padding:'8px 12px'}}>Email</th>
                <th style={{padding:'8px 12px'}}>Status</th>
                <th style={{padding:'8px 12px'}}>Last Login</th>
                <th style={{padding:'8px 12px'}}>Created</th>
                <th style={{padding:'8px 12px'}}>Blocked</th>
                <th style={{padding:'8px 12px'}}>Plan</th>
                <th style={{padding:'8px 12px'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const key = user.email
                const isSelf = currentEmail && currentEmail.toLowerCase() === user.email.toLowerCase()
                const blocking = busyKey === `block:${key}`
                const unblocking = busyKey === `unblock:${key}`
                const deleting = busyKey === `delete:${key}`
                return (
                  <tr key={user.email} style={{background:'#0f0f20', borderRadius:12}}>
                    <td style={{padding:'10px 12px', fontWeight:600}}>{user.name || '-'}</td>
                    <td style={{padding:'10px 12px', fontFamily:'var(--mono, monospace)', fontSize:13}}>{user.email}</td>
                    <td style={{padding:'10px 12px'}}>
                      <span className="badge" style={{background:user.status==='active'? '#143b2b':'#3b1b1b', borderColor:user.status==='active'? '#1f5b40':'#4c2c2c'}}>{user.status}</span>
                    </td>
                    <td style={{padding:'10px 12px'}}>{formatDate(user.lastLoginAt)}</td>
                    <td style={{padding:'10px 12px'}}>{formatDate(user.createdAt)}</td>
                    <td style={{padding:'10px 12px'}}>
                      {user.status === 'blocked' ? (
                        <div style={{display:'grid'}}>
                          <span>{formatDate(user.blockedAt)}</span>
                          {user.blockedBy && <span className="muted" style={{fontSize:12}}>by {user.blockedBy}</span>}
                        </div>
                      ) : '-'}
                    </td>
                    <td style={{padding:'10px 12px'}}>
                      <select className="input" value={plans[user.email]||'basic'} onChange={async(e)=>{
                        const name = e.target.value
                        setPlans(prev=> ({ ...prev, [user.email]: name }))
                        try{ await fetch('/api/admin/plan', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email: user.email, plan: name }) }) }catch{}
                      }} style={{height:32}}>
                        <option value="basic">basic</option>
                        <option value="pro">pro</option>
                        <option value="agency">agency</option>
                      </select>
                    </td>
                    <td style={{padding:'10px 12px'}}>
                      <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                        {user.status === 'active' ? (
                          <button
                            className="btn secondary"
                            onClick={()=> runAction('block', user.email)}
                            disabled={blocking || deleting || isSelf}
                            style={{opacity: isSelf? 0.5:1}}
                          >
                            {blocking ? 'Blocking...' : 'Block'}
                          </button>
                        ) : (
                          <button
                            className="btn secondary"
                            onClick={()=> runAction('unblock', user.email)}
                            disabled={unblocking || deleting}
                          >
                            {unblocking ? 'Unblocking...' : 'Unblock'}
                          </button>
                        )}
                        <button
                          className="btn secondary"
                          onClick={()=> runAction('delete', user.email)}
                          disabled={deleting || isSelf}
                          style={{opacity: isSelf? 0.5:1}}
                        >
                          {deleting ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {users.length===0 && state !== 'loading' && (
                <tr>
                  <td colSpan={7} style={{padding:'16px 12px', textAlign:'center'}} className="muted">No users found yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {state === 'loading' && <div className="muted" style={{marginTop:8}}>Loading users...</div>}
      </section>

      <section className="muted" style={{fontSize:13}}>
        Need to manage licenses? Head to <a href="/admin/licenses" className="link">Admin -> Licenses</a>.
      </section>
    </div>
  )
}
