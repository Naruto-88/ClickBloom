"use client"
import Modal from "@/components/ui/Modal"
import { useState } from "react"

export type Website = { id: string; name: string; url: string; industry?: string; description?: string }

export default function AddWebsiteModal({ open, onClose, onCreate }: { open: boolean, onClose: () => void, onCreate: (w: Website) => void }){
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [industry, setIndustry] = useState("")
  const [desc, setDesc] = useState("")

  const submit = () => {
    if(!name || !url) return alert('Name and URL are required')
    const id = (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : String(Date.now())
    const w: Website = { id, name, url, industry, description: desc }
    onCreate(w)
    setName(""); setUrl(""); setIndustry(""); setDesc("")
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h3>Add Website</h3>
      <div className="form-grid">
        <label>Website Name</label>
        <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="My Site"/>
        <label>Website URL</label>
        <input className="input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com"/>
        <label>Website Industry</label>
        <input className="input" value={industry} onChange={e=>setIndustry(e.target.value)} placeholder="E‑commerce, SaaS, Blog…"/>
        <label>Website Description</label>
        <textarea className="textarea" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Short description"/>
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Close</button>
        <button className="btn" onClick={submit}>Create</button>
      </div>
    </Modal>
  )
}
