export const runtime = 'nodejs'

export async function POST(req: Request){
  const origin = new URL(req.url).origin
  try{
    const reg = await fetch(`${origin}/api/registry/sites`)
    const regJ = await reg.json(); const sites = Array.isArray(regJ?.sites)? regJ.sites: []
    if(sites.length===0) return new Response(JSON.stringify({ ok:true, message:'No sites' }), { status:200 })
    await fetch(`${origin}/api/cron/perf-prewarm`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ sites, ranges:['7d','30d','lastm'] }) })
    return new Response(JSON.stringify({ ok:true }), { status:200, headers:{'content-type':'application/json'} })
  }catch(e:any){ return new Response(String(e?.message||'cron error'), { status:500 }) }
}

