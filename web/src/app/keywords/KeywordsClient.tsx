"use client"
import { useEffect, useMemo, useRef, useState } from 'react'

type Kw = {
  id: string
  query: string
  targetUrl?: string
  targetDomain?: string
  notes?: string
  history: Array<{ date: string, position: number|null }>
}

function activeSite(){ try{ return localStorage.getItem('activeWebsiteId')||'' }catch{ return '' } }
const today = ()=> new Date().toISOString().slice(0,10)

export default function KeywordsClient(){
  const [siteId, setSiteId] = useState('')
  const [sites, setSites] = useState<Array<{id:string,name:string,url:string}>>([])
  const [list, setList] = useState<Kw[]>([])
  const [q, setQ] = useState('')
  const [target, setTarget] = useState('')
  const [domain, setDomain] = useState('')
  const [busy, setBusy] = useState<'check'|'add'|null>(null)
  const [search, setSearch] = useState('')
  const [serpProvider, setSerpProvider] = useState<'serper'|'serpapi'>('serper')
  const [serpHasKey, setSerpHasKey] = useState<boolean>(false)
  const [serpKey, setSerpKey] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'list'|'history'>('list')
  const [trendDays, setTrendDays] = useState<number>(30)
  const [histDays, setHistDays] = useState<number>(7)
  const [posMin, setPosMin] = useState<number>(1)
  const [posMax, setPosMax] = useState<number>(100)
  const trendRef = useRef<HTMLCanvasElement|null>(null)
  const TOP_LIMIT = 20

  const getSiteDomain = ()=>{
    try{
      if(!siteId) return ''
      const integ = JSON.parse(localStorage.getItem('integrations:'+siteId)||'{}')
      const g = integ.gscSite as string|undefined
      if(g){ try{ const u = new URL(g); return u.hostname.replace(/^www\./,'') }catch{} }
    }catch{}
    return ''
  }

  // Init
  useEffect(()=>{ setSiteId(activeSite()); try{ setSites(JSON.parse(localStorage.getItem('websites')||'[]')) }catch{} }, [])
  // React to picker changes
  useEffect(()=>{
    let mounted = true
    let last = activeSite()
    const tick = ()=>{ const cur = activeSite(); if(mounted && cur!==last){ last=cur; setSiteId(cur) } }
    const id = setInterval(tick, 800); window.addEventListener('focus', tick)
    return ()=>{ mounted=false; clearInterval(id); window.removeEventListener('focus', tick) }
  }, [])
  // Load global SERP settings
  useEffect(()=>{ (async()=>{ const r=await fetch('/api/settings/serp-global'); const j=await r.json().catch(()=>null); if(j?.ok){ setSerpProvider(j.provider||'serper'); setSerpHasKey(!!j.hasKey) } })() }, [])
  // Load keywords for site
  useEffect(()=>{ (async()=>{
    if(!siteId) return
    const r = await fetch(`/api/keywords?siteId=${encodeURIComponent(siteId)}`)
    const j = await r.json().catch(()=>null)
    if(j?.ok) setList(Array.isArray(j.data)? j.data: [])
  })() }, [siteId])
  const save = (next:Kw[])=>{ setList(next) }

  // Actions
  const add = async ()=>{
    if(!q.trim() || !siteId) return
    const dom = (domain.trim()||getSiteDomain()||'')
    const r = await fetch('/api/keywords', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ siteId, query:q.trim(), targetUrl: target.trim()||undefined, targetDomain: dom||undefined }) })
    const j = await r.json().catch(()=>null)
    if(j?.ok && j.data){ setList([j.data, ...list]); setQ(''); setTarget(''); setDomain('') }
  }
  const remove = async (id:string)=>{ await fetch(`/api/keywords/${id}?siteId=${encodeURIComponent(siteId)}`, { method:'DELETE' }); setList(list.filter(x=> x.id!==id)) }
  const upsertForDate = (h:Array<{date:string, position:number|null}>, d:string, pos:number|null)=>{
    const i = h.findIndex(x=> x.date===d); if(i>=0){ const c=[...h]; c[i]={date:d, position:pos}; return c } return [{date:d, position:pos}, ...h].slice(0,120)
  }
  const setManual = async (id:string, pos:number|null, date?:string)=>{
    const d = (date && date.trim()) || today()
    await fetch(`/api/keywords/${id}/position`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ siteId, position: pos, source:'manual', date: d }) })
    const next = list.map(k=> k.id===id? { ...k, history: upsertForDate(k.history, d, pos) } : k)
    save(next)
  }
  const checkOne = async (k:Kw)=>{
    setBusy('check')
    try{
      const r = await fetch('/api/keywords/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ q: k.query, targetUrl: k.targetUrl, targetDomain: k.targetDomain, country:'au', lang:'en' }) })
      const j = await r.json(); if(!j?.ok){ alert(j?.error||'check failed'); return }
      const pos: number|null = j.data?.position ?? null
      await fetch(`/api/keywords/${k.id}/position`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ siteId, position: pos, source:'api', provider:j.data?.provider, foundUrl:j.data?.foundUrl }) })
      const next = list.map(x=> x.id===k.id? { ...x, history: upsertForDate(x.history, today(), pos) } : x)
      save(next)
    }finally{ setBusy(null) }
  }
  const checkAll = async ()=>{ for(const k of list){ await checkOne(k) } }

  // Derived rows
  const rows = useMemo(()=>{
    const fil = (search||'').toLowerCase()
    const out = (!fil? list : list.filter(x=> x.query.toLowerCase().includes(fil)))
    return out.map(k=>{
      const todayPos = k.history.find(h=> h.date===today())?.position ?? null
      const prevPos = k.history.filter(h=> h.position!==null)[1]?.position ?? null
      const delta = (todayPos!==null && prevPos!==null)? prevPos - todayPos : null // positive = improved
      const hue = todayPos===null? 230 : (todayPos<=TOP_LIMIT? 140 : todayPos<=50? 50 : 0)
      const color = todayPos===null? '#94a3b8' : (hue===140? '#34d399' : hue===50? '#f59e0b' : '#ef4444')
      return { k, todayPos, prevPos, delta, color }
    })
  }, [list, search, TOP_LIMIT])

  // Distribution, deltas, summary
  const [posFilter, setPosFilter] = useState<'all'|'top1'|'top3'|'top10'|'top20'|'top50'|'gt50'|'unknown'>('all')
  const onlyPos = rows.map(r=> r.todayPos).filter((n): n is number => typeof n==='number')
  const avgPos = onlyPos.length? Math.round((onlyPos.reduce((a,b)=>a+b,0)/onlyPos.length)*10)/10 : null
  const count = (pred:(n:number|null)=>boolean)=> rows.filter(r=> pred(r.todayPos)).length
  const counts = {
    all: rows.length,
    top1: count(n=> n===1),
    top3: count(n=> typeof n==='number' && n<=3),
    top10: count(n=> typeof n==='number' && n<=10),
    top20: count(n=> typeof n==='number' && n<=20),
    top50: count(n=> typeof n==='number' && n<=50),
    gt50: count(n=> typeof n==='number' && n>50),
    unknown: count(n=> n===null)
  }
  const bucket = (n:number|null)=>{ if(n===null) return 'unknown'; if(n===1) return 'top1'; if(n<=3) return 'top3'; if(n<=10) return 'top10'; if(n<=20) return 'top20'; if(n<=50) return 'top50'; return 'gt50' }
  const prevCounts = rows.reduce((acc:any,r)=>{ const b=bucket(r.prevPos); acc[b]=(acc[b]||0)+1; acc.all=(acc.all||0)+1; return acc },{} as any)
  const deltas:any = Object.fromEntries(Object.entries(counts).map(([k,v])=> [k, (v - (prevCounts as any)[k] || 0)]))
  const improved = rows.filter(r=> (typeof r.delta==='number' && r.delta>0)).length
  const dropped = rows.filter(r=> (typeof r.delta==='number' && r.delta<0)).length
  const rangeActive = posMin!==1 || posMax!==100

  // Avg trend series
  const trendSeries = useMemo(()=>{
    const map = new Map<string,{sum:number,count:number}>()
    for(const r of list){ for(const h of r.history){ if(h.position!=null){ const e=map.get(h.date)||{sum:0,count:0}; e.sum+=h.position; e.count+=1; map.set(h.date,e) } } }
    const dates = Array.from(map.keys()).sort()
    const last = dates.slice(-Math.min(trendDays, dates.length))
    return last.map(d=> ({ date:d, value: Math.round((map.get(d)!.sum/map.get(d)!.count)*10)/10 }))
  }, [JSON.stringify(list.map(l=>l.history)), trendDays])
  useEffect(()=>{
    if(!trendRef.current) return
    const c = trendRef.current; const ctx = c.getContext('2d')!
    ctx.clearRect(0,0,c.width,c.height)
    const pad=6; const w=c.width; const h=c.height
    if(!trendSeries.length){ ctx.fillStyle='#6b7280'; ctx.fillText('No data',8,16); return }
    const vals = trendSeries.map(s=> s.value)
    const min = Math.min(...vals), max = Math.max(...vals)
    const xs=(i:number)=> pad + (i*(w-pad*2))/Math.max(1, trendSeries.length-1)
    const ys=(v:number)=> h-pad - ((v-min)/Math.max(1,max-min))*(h-pad*2)
    ctx.strokeStyle='#22c55e'; ctx.lineWidth=2; ctx.beginPath()
    trendSeries.forEach((s,i)=>{ const x=xs(i), y=ys(s.value); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y) }); ctx.stroke()
  }, [trendSeries])

  const fmtDMY = (d:string)=>{ try{ const [Y,M,D] = d.split('-'); return `${D}/${M}/${Y}` }catch{ return d } }
  const parseDMY = (s:string)=>{ const m = s.match(/^(\d{1,2})[\/](\d{1,2})[\/-](\d{4})$/); if(!m) return today(); const D=m[1].padStart(2,'0'); const M=m[2].padStart(2,'0'); const Y=m[3]; return `${Y}-${M}-${D}` }
  const histDates = useMemo(()=>{
    const set = new Set<string>()
    for(const k of list){ for(const h of k.history){ set.add(h.date) } }
    const all = Array.from(set).sort()
    return all.slice(-Math.min(histDays, all.length))
  }, [JSON.stringify(list.map(l=>l.history)), histDays])

  return (
    <div className="card">
      <div className="panel-title" style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:8, alignItems:'center'}}>
        <div><strong>Keywords Tracker</strong><div className="muted">Google Australia (gl=au) - Highlighting Top {TOP_LIMIT}</div></div>
        <div style={{display:'flex', gap:8, alignItems:'center', justifyContent:'flex-end', flexWrap:'wrap'}}>
          <select className="input" value={serpProvider} onChange={e=> setSerpProvider(e.target.value as any)} style={{height:38, maxWidth:160}}>
            <option value="serper">Serper.dev</option>
            <option value="serpapi">SerpAPI</option>
          </select>
          <input className="input" placeholder={serpHasKey? 'Key stored - enter to replace' : 'API Key'} value={serpKey} onChange={e=> setSerpKey(e.target.value)} style={{maxWidth:260}} />
          <button className="btn secondary" onClick={async()=>{ if(!serpProvider || !serpKey.trim()){ alert('Enter provider + API key'); return } const r=await fetch('/api/settings/serp-global', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ provider: serpProvider, apiKey: serpKey.trim() }) }); const j=await r.json(); if(j?.ok){ setSerpHasKey(true); setSerpKey('') } else { alert(j?.error||'Save failed') } }}>Save</button>
          <button className="btn secondary" onClick={async()=>{ await fetch('/api/settings/serp-global', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ clear:true }) }); setSerpHasKey(false); setSerpKey('') }}>Clear</button>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center', justifyContent:'flex-end'}}>
          <input className="input" placeholder="Search keywords..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:220}}/>
          <button className="btn secondary" onClick={()=> setBulkOpen(true)}>Add Keywords</button>
          <button className="btn secondary" onClick={checkAll} disabled={busy==='check' || list.length===0}>{busy==='check'? <span className="spinner"/> : 'Recheck All'}</button>
          <button className="btn secondary" onClick={()=>{ const rows = list.map(k=>{ const todayPos = k.history.find(h=> h.date===today())?.position ?? null; const prevPos = k.history.filter(h=> h.position!==null)[1]?.position ?? null; return { query:k.query, target:k.targetUrl||k.targetDomain||'', today: todayPos??'', prev: prevPos??'' } }); const csv = ['query,target,today,prev', ...rows.map(r=> `${JSON.stringify(r.query)},${JSON.stringify(r.target)},${r.today},${r.prev}`)].join('\n'); const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='keywords.csv'; a.click(); URL.revokeObjectURL(url); }}>Export</button>
          <select className="input" value={viewMode} onChange={e=> setViewMode(e.target.value as any)} style={{height:34, maxWidth:140}}>
            <option value="list">View: List</option>
            <option value="history">View: History</option>
          </select>
        </div>
      </div>

      {/* Site short-code chips */}
      <div style={{display:'flex', flexWrap:'wrap', gap:8, marginBottom:10}}>
        {sites.map(s=>{
          const parts = (s.name||'').split(/\s+|-/).filter(Boolean)
          const code = parts.length? (parts[0][0] + (parts[1]?.[0]||'') + (parts[2]?.[0]||'')).toUpperCase() : (s.name||'??').slice(0,3).toUpperCase()
          const active = s.id===siteId
          return (
            <div key={s.id} onClick={()=>{ setSiteId(s.id); try{ localStorage.setItem('activeWebsiteId', s.id) }catch{} }}
              style={{ padding:'6px 10px', borderRadius:999, border:`1px solid ${active? '#3a3a5d':'#2b2b47'}`, background: active? '#1f1f3a':'#0f0f20', color: active? '#fff':'#cfd2e6', cursor:'pointer', fontWeight:700, letterSpacing:.3 }}>
              {code}
            </div>
          )
        })}
      </div>

      {/* Position filters + summary */}
      <div className="card" style={{marginTop:8, marginBottom:8, padding:'8px 10px', display:'grid', gridTemplateColumns:'1fr auto auto', alignItems:'center', gap:8}}>
        <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
          {([
            {key:'all', label:'All', color:'#6366f1'},
            {key:'top1', label:'Top 1', color:'#16a34a'},
            {key:'top3', label:'Top 3', color:'#22c55e'},
            {key:'top10', label:'Top 10', color:'#34d399'},
            {key:'top20', label:'Top 20', color:'#84cc16'},
            {key:'top50', label:'Top 50', color:'#f59e0b'},
            {key:'gt50', label:'>50', color:'#f97316'},
            {key:'unknown', label:'Unknown', color:'#94a3b8'},
          ] as Array<{key:any,label:string,color:string}>).map(b=>{
            const k=b.key as typeof posFilter
            const active = posFilter===k
            const n = (counts as any)[k] as number
            const d = (deltas as any)[k] as number || 0
            return (
              <button key={k} className="btn secondary" onClick={()=> setPosFilter(k)}
                style={{height:30, padding:'0 10px', background: active? '#1f1f3a':'#0f0f20', borderColor: active? '#3a3a5d':'#2b2b47', color: active? '#fff': b.color}}>
                {b.label} <span className="badge" style={{marginLeft:6, borderColor:b.color, color:b.color}}>{n}</span>
                <span style={{marginLeft:6, fontSize:12, color: d>0? '#34d399' : (d<0? '#ef4444':'#94a3b8')}}>{d>0? `+${d}` : (d<0? `${d}` : '±0')}</span>
              </button>
            )
          })}
        </div>
        <div className="muted" style={{fontSize:12}}>Average position: <strong>{avgPos??'—'}</strong> - In Top 10: <strong>{counts.top10}</strong> - In Top 20: <strong>{counts.top20}</strong></div>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <div className="muted" style={{fontSize:12}}>Changes: <span style={{color:'#34d399'}}>↑ {improved}</span> <span style={{marginLeft:8, color:'#ef4444'}}>↓ {dropped}</span></div>
          <div className="muted" style={{fontSize:12, marginLeft:10}}>Range:</div>
          <input type="number" className="input" value={posMin} onChange={e=> setPosMin(Math.max(1, Math.min(posMax, parseInt(e.target.value||'1')||1)))} style={{width:70, height:30}}/>
          <span className="muted" style={{fontSize:12}}>to</span>
          <input type="number" className="input" value={posMax} onChange={e=> setPosMax(Math.min(100, Math.max(posMin, parseInt(e.target.value||'100')||100)))} style={{width:70, height:30}}/>
        </div>
      </div>

      {/* Avg position trend */}
      <div className="card" style={{padding:12}}>
        <div className="panel-title" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div><strong>Average Position</strong> <span className="muted">last {trendDays} days</span></div>
          <div style={{display:'flex', gap:6}}>
            {[7,30,90].map(n=> (
              <button key={n} className="btn secondary" style={{height:26, padding:'0 10px', background: trendDays===n? '#1f1f3a':'#0f0f20', borderColor: trendDays===n? '#3a3a5d':'#2b2b47'}} onClick={()=> setTrendDays(n)}>{n===7? '7D': n===30? '1M':'3M'}</button>
            ))}
          </div>
        </div>
        <canvas ref={trendRef} width={560} height={90} style={{width:'100%', height:90, background:'#0f0f20', border:'1px solid #2b2b47', borderRadius:8}}/>
      </div>

      {/* Add single keyword inline */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 120px 120px 160px auto', gap:8, alignItems:'center'}}>
        <input className="input" placeholder="Add keyword" value={q} onChange={e=>setQ(e.target.value)} />
        <input className="input" placeholder="Target URL (optional)" value={target} onChange={e=>setTarget(e.target.value)} />
        <input className="input" placeholder={`Domain (optional) ${getSiteDomain()? '· '+getSiteDomain():''}`} value={domain} onChange={e=>setDomain(e.target.value)} />
        <div className="muted">&nbsp;</div>
        <div className="muted">&nbsp;</div>
        <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
          <button className="btn" onClick={add} disabled={!q.trim() || busy==='add'}>Add</button>
        </div>
      </div>

      {/* List view */}
      {viewMode==='list' && (
        <div className="q-list" style={{marginTop:12}}>
          {rows.filter(r=>{
            const n=r.todayPos
            switch(posFilter){
              case 'top1': return n===1
              case 'top3': return typeof n==='number' && n<=3
              case 'top10': return typeof n==='number' && n<=10
              case 'top20': return typeof n==='number' && n<=20
              case 'top50': return typeof n==='number' && n<=50
              case 'gt50': return typeof n==='number' && n>50
              case 'unknown': return n===null
              default: return true
            }
          }).filter(r=> !rangeActive || ((r.todayPos??101)>=posMin && (r.todayPos??101)<=posMax)).map(({k, todayPos, delta, color})=> {
            const defaultDate = today()
            return (
              <div key={k.id} className="q-row kw-row">
                <div className="q-name" title={k.query}>{k.query}</div>
                <div className="muted" title={k.targetUrl||k.targetDomain||''} style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{k.targetUrl||k.targetDomain||'—'}</div>
                <div className="kw-actions">
                  <span className="q-metric" style={{borderColor:'#2b2b47', color: (todayPos!==null && todayPos<=TOP_LIMIT)? '#34d399':'#e6e6f0', background:'#10102a'}} title="Today position">{todayPos===null? '—' : `#${todayPos}`}</span>
                  <span className="q-metric" style={{borderColor:'#2b2b47', color: color, background:'#0f0f20'}} title="Change vs previous">{delta===null? '0' : (delta>0? `+${delta}` : `${delta}`)}</span>
                  <button className="btn secondary" style={{height:32}} onClick={()=>checkOne(k)} disabled={busy==='check'}>{busy==='check'? <span className="spinner"/> : 'Check'}</button>
                  <input className="input" style={{width:70, height:32}} placeholder="#" title="Position" defaultValue={todayPos??''} id={`pos-${k.id}`} />
                  <input className="input" style={{width:120, height:32}} placeholder={fmtDMY(defaultDate)} defaultValue={fmtDMY(defaultDate)} id={`date-${k.id}`} />
                  <button className="btn secondary" style={{height:32}} onClick={()=>{
                    const posEl = document.getElementById(`pos-${k.id}`) as HTMLInputElement|null
                    const dateEl = document.getElementById(`date-${k.id}`) as HTMLInputElement|null
                    const raw = posEl?.value||''
                    const n = raw.trim()===''? null : Math.max(1, Math.min(100, parseInt(raw,10)||1))
                    const dIn = dateEl?.value||fmtDMY(defaultDate)
                    const d = parseDMY(dIn)
                    setManual(k.id, n, d)
                  }}>Set</button>
                  <button className="btn secondary" style={{height:32}} onClick={()=> remove(k.id)}>Delete</button>
                </div>
              </div>
            )})}
          {rows.length===0 && <div className="muted">No keywords yet.</div>}
        </div>
      )}

      {/* History view */}
      {viewMode==='history' && (
        <div className="card" style={{padding:12, marginTop:8}}>
          <div className="panel-title" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div><strong>Positions By Day</strong> <span className="muted">last {histDays} days</span></div>
            <div style={{display:'flex', gap:6}}>
              {[7,14,30].map(n=> (
                <button key={n} className="btn secondary" style={{height:26, padding:'0 10px', background: histDays===n? '#1f1f3a':'#0f0f20', borderColor: histDays===n? '#3a3a5d':'#2b2b47'}} onClick={()=> setHistDays(n)}>{n===7? '7D': n===14? '14D':'30D'}</button>
              ))}
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <div style={{display:'grid', gridTemplateColumns: `minmax(220px,2fr) ${histDates.map(()=> 'minmax(70px,1fr)').join(' ')}`, gap:8, alignItems:'center'}}>
              <div className="muted">Keyword</div>
              {histDates.map(d=> <div key={d} className="muted" style={{textAlign:'center'}}>{d.slice(5)}</div>)}
              {rows.map(r=> (
                <div key={r.k.id + '-row'} style={{display:'contents'}}>
                  <div className="q-name" title={r.k.query}>{r.k.query}</div>
                  {histDates.map(d=>{ const p = r.k.history.find(h=> h.date===d)?.position ?? null; const good = p!==null && p<=TOP_LIMIT; return (
                    <div key={r.k.id + d} style={{textAlign:'center', border:'1px solid #2b2b47', borderRadius:8, padding:'6px 4px', color: good? '#34d399': '#e6e6f0', background: '#10102a'}}>{p??'—'}</div>
                  )})}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="muted" style={{marginTop:8, fontSize:12}}>Tracks your home page and all site pages for the keywords above. We highlight only positions 1–{TOP_LIMIT}. You can raise this later (e.g., Top 50) by changing a single constant. Tip: Save a Serper.dev or SerpAPI key above to enable live checks (AU), or record positions manually.</div>

      {/* Bulk add modal */}
      {bulkOpen && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'grid', placeItems:'center', zIndex:50}} onClick={()=>setBulkOpen(false)}>
          <div className="card" style={{width:'min(720px, 92vw)', padding:12}} onClick={e=> e.stopPropagation()}>
            <div className="panel-title"><strong>Add Keywords</strong></div>
            <div style={{display:'grid', gap:8, gridTemplateColumns:'1fr 1fr'}}>
              <textarea id="bulk-kws" className="input" rows={10} placeholder={'keyword one\nkeyword two\nkeyword three'} style={{gridColumn:'1/-1'}}/>
              <input className="input" placeholder="Target URL (optional)" value={target} onChange={e=>setTarget(e.target.value)} />
              <input className="input" placeholder={`Domain (optional) ${getSiteDomain()? '· '+getSiteDomain():''}`} value={domain} onChange={e=>setDomain(e.target.value)} />
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:10}}>
              <button className="btn secondary" onClick={()=> setBulkOpen(false)}>Cancel</button>
              <button className="btn" onClick={async()=>{
                const ta = document.getElementById('bulk-kws') as HTMLTextAreaElement|null
                const lines = (ta?.value||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
                for(const line of lines){
                  const dom = (domain.trim()||getSiteDomain()||'')
                  const r = await fetch('/api/keywords', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ siteId, query:line, targetUrl: target.trim()||undefined, targetDomain: dom||undefined }) })
                  const j = await r.json().catch(()=>null)
                  if(j?.ok && j.data){ setList(prev=> [j.data, ...prev]) }
                }
                if(ta) ta.value=''
                setBulkOpen(false)
              }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

