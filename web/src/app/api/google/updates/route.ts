import { NextResponse } from 'next/server'
import { load } from 'cheerio'
import path from 'path'
import fs from 'fs/promises'

export const runtime = 'nodejs'

type Update = { title: string, type: 'core'|'spam'|'ranking'|'other', start: string, end?: string|null, url?: string }

async function readLocal(): Promise<Update[]>{
  try{
    const p = path.join(process.cwd(), 'web', 'src', 'data', 'search_updates.json')
    const raw = await fs.readFile(p, 'utf8').catch(()=> '[]')
    const j = JSON.parse(raw)
    if(Array.isArray(j)) return j as Update[]
  }catch{}
  return []
}

async function fetchRankingPage(): Promise<Update[]>{
  try{
    const res = await fetch('https://developers.google.com/search/updates/ranking', { headers:{ 'user-agent':'Mozilla/5.0 (ClickBloom)' } })
    if(!res.ok) return []
    const html = await res.text()
    const $ = load(html)
    const out: Update[] = []
    $('article, devsite-article, .devsite-article').each((_,el)=>{
      const a = $(el)
      const title = a.find('h2, h3').first().text().trim() || a.find('a').first().text().trim()
      const link = a.find('a').first().attr('href') || ''
      // Try to find date-like text
      let dateText = a.find('time').first().attr('datetime') || a.find('time').first().text().trim() || ''
      if(!dateText){
        const t = a.text(); const m = t.match(/\b(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\w+ \d{1,2}, \d{4})/)
        dateText = m?.[0] || ''
      }
      const start = dateText? new Date(dateText).toISOString().slice(0,10) : ''
      if(!title || !start) return
      const low = title.toLowerCase()
      const type: Update['type'] = low.includes('core update')? 'core' : (low.includes('spam')? 'spam' : (low.includes('ranking')? 'ranking':'other'))
      out.push({ title, type, start, url: link && link.startsWith('http')? link : (link? 'https://developers.google.com'+link : undefined) })
    })
    // Deduplicate by title+start
    const seen = new Set<string>()
    const list = out.filter(u=>{ const k=u.title+'|'+u.start; if(seen.has(k)) return false; seen.add(k); return true })
    return list
  }catch{ return [] }
}

export async function GET(){
  const local = await readLocal()
  const remote = await fetchRankingPage()
  // prefer remote items; fall back to local
  const byKey = new Map<string, Update>()
  for(const u of [...local, ...remote]){ const k=u.title+'|'+u.start; byKey.set(k, u) }
  const updates = Array.from(byKey.values()).sort((a,b)=> (a.start<b.start? 1: -1))
  return NextResponse.json({ ok:true, updates })
}

