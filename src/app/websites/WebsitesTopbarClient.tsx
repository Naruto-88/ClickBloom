"use client"
import { useEffect, useState } from 'react'
import WebsitePicker from '@/components/dashboard/WebsitePicker'
import Modal from '@/components/ui/Modal'

export default function WebsitesTopbarClient(){
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState<'save'|'test'|null>(null)
  const [status, setStatus] = useState<string>('')

  // Load current per-site AI settings into the form when opening
  useEffect(()=>{
    if(!open) return
    try{
      const siteId = localStorage.getItem('activeWebsiteId') || ''
      if(siteId){
        const cur = JSON.parse(localStorage.getItem('ai:'+siteId)||'{}')
        setApiKey(cur?.openaiKey||'')
        setModel(cur?.model||'')
      } else {
        setApiKey(''); setModel('')
      }
    }catch{ setApiKey(''); setModel('') }
  }, [open])

  const save = async () => {
    const siteId = localStorage.getItem('activeWebsiteId') || ''
    if(!siteId){ alert('Select a website first'); return }
    try{
      setBusy('save')
      const obj: any = {}
      if(apiKey) obj.openaiKey = apiKey
      if(model!==undefined) obj.model = model
      localStorage.setItem('ai:'+siteId, JSON.stringify(obj))
      setStatus('Saved for this site')
      setTimeout(()=> setStatus(''), 2500)
      setOpen(false)
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    try{
      setBusy('test'); setStatus('')
      const r = await fetch('/api/settings/ai/test', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ apiKey: apiKey||undefined, model: model||undefined }) })
      const j = await r.json().catch(()=>null)
      if(j?.ok){ setStatus(`Key OK${j.model? ' • Model '+j.model:''}`) }
      else { setStatus(j?.error||'Test failed') }
    }catch(e:any){ setStatus(e?.message||'Test failed') }
    finally{ setBusy(null); setTimeout(()=> setStatus(''), 3000) }
  }

  return (
    <div className="page-topbar" style={{display:'flex', alignItems:'center', gap:12, justifyContent:'space-between'}}>
      <WebsitePicker/>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <button className="btn" onClick={()=> setOpen(true)}>Add Integration</button>
      </div>
      <Modal open={open} onClose={()=> setOpen(false)}>
        <h3>Add Integration</h3>
        <div className="muted" style={{marginTop:4}}>OpenAI API key and model for AI features. Stored per-website.</div>
        <div style={{height:8}}/>
        <div style={{display:'grid', gap:10}}>
          <div className="form-grid" style={{gridTemplateColumns:'180px 1fr'}}>
            <label>OpenAI API Key</label>
            <input className="input" placeholder="sk-..." value={apiKey} onChange={e=> setApiKey(e.target.value)} />
          </div>
          <div className="form-grid" style={{gridTemplateColumns:'180px 1fr'}}>
            <label>Model</label>
            <input className="input" placeholder="gpt-4o-mini" value={model} onChange={e=> setModel(e.target.value)} />
          </div>
          <div className="actions" style={{justifyContent:'flex-start', gap:8}}>
            <button className="btn" disabled={busy!==null} onClick={save}>{busy==='save'? 'Saving...' : 'Save'}</button>
            <button className="btn secondary" disabled={busy!==null} onClick={test}>{busy==='test'? 'Testing...' : 'Test Key'}</button>
          </div>
          {status && (<div className="muted">{status}</div>)}
          <div className="muted" style={{fontSize:12}}>Note: This does not use env variables. The key is saved locally for the selected website.</div>
        </div>
      </Modal>
    </div>
  )
}

