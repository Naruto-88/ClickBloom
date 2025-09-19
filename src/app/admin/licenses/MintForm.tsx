"use client"
import { useFormState, useFormStatus } from "react-dom"

export default function MintForm({ action }: { action: (prev: any, formData: FormData)=> Promise<any> }){
  const [state, formAction] = useFormState<any>(action as any, {} as any)
  const { pending } = useFormStatus()
  return (
    <form action={formAction} style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8}}>
      <input name="email" className="input" placeholder="Owner email (optional)" />
      <select name="plan" className="input" defaultValue="standard">
        <option value="standard">Standard</option>
        <option value="pro">Pro</option>
        <option value="enterprise">Enterprise</option>
      </select>
      <input name="max_sites" type="number" min={1} className="input" placeholder="Max sites" defaultValue={1}/>
      <input name="expires_at" type="date" className="input" placeholder="Expires (optional)" />
      <div style={{gridColumn:'1 / -1', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div className="muted">{(state as any)?.key ? `New key: ${(state as any).key}` : ''}</div>
        <button className="btn" disabled={pending}>{pending? 'Generating…' : 'Generate'}</button>
      </div>
    </form>
  )
}

