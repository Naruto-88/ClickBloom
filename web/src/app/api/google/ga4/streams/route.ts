import { auth } from '@/lib/auth'

export async function GET(req: Request){
  try{
    const { searchParams } = new URL(req.url)
    const property = searchParams.get('property') // e.g., properties/12345
    if(!property) return new Response(JSON.stringify({ error:'Missing property' }), { status: 400 })
    const session = await auth()
    if(!session) return new Response(JSON.stringify({ error:'Unauthorized' }), { status: 401 })
    // @ts-ignore
    const token = session.access_token as string | undefined
    if(!token) return new Response(JSON.stringify({ error:'No access token' }), { status: 401 })
    const url = `https://analyticsadmin.googleapis.com/v1beta/${property}/dataStreams`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const text = await res.text()
    if(!res.ok){ return new Response(text || res.statusText, { status: res.status }) }
    return new Response(text, { status: 200, headers: { 'content-type':'application/json' } })
  }catch(e:any){ return new Response(JSON.stringify({ error: e?.message||'streams error' }), { status: 500 }) }
}

