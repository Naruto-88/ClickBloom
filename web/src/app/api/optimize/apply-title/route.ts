export const runtime = 'nodejs'

export async function POST(req: Request){
  try{
    const { endpoint, token, pageUrl, title, postId } = await req.json()
    if(!endpoint || !token) return new Response(JSON.stringify({ ok:false, error:'No WordPress endpoint configured' }), { status: 400 })
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type':'application/json' },
      body: JSON.stringify({ token, url: pageUrl, title, postId })
    })
    const text = await res.text()
    if(!res.ok) return new Response(JSON.stringify({ ok:false, error:`WP ${res.status}: ${text.slice(0,200)}` }), { status: res.status })
    // Try to parse JSON; if not JSON, still treat as ok
    let data: any = null; try{ data = JSON.parse(text) }catch{}
    return new Response(JSON.stringify({ ok:true, data }), { status: 200 })
  }catch(e:any){
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'apply failed' }), { status: 500 })
  }
}
