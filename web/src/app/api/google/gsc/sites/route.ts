import { auth } from '@/lib/auth'
export async function GET(){
  try{
    const session = await auth()
    if(!session){ return new Response(JSON.stringify({ error:'Unauthorized' }), { status: 401 }) }
    // @ts-ignore
    const token = session.access_token as string | undefined
    if(!token) return new Response(JSON.stringify({ error:'No access token' }), { status: 401 })
    const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', { headers: { Authorization: `Bearer ${token}` } })
    if(!res.ok){
      const text = await res.text()
      return new Response(JSON.stringify({ error: text || res.statusText }), { status: res.status })
    }
    const data = await res.json()
    return Response.json(data)
  }catch(e:any){
    return new Response(JSON.stringify({ error: e?.message || 'GSC list error' }), { status: 500 })
  }
}
