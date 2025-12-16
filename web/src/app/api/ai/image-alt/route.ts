import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const { images, keywords, variant } = await req.json()
    if(!Array.isArray(images) || images.length===0) return NextResponse.json({ ok:false, error:'Missing images' }, { status: 400 })
    const apiKey = process.env.OPENAI_API_KEY
    if(!apiKey) return NextResponse.json({ ok:false, error:'Missing OPENAI_API_KEY' }, { status: 500 })
    const openai = new OpenAI({ apiKey })
    const ideas: Record<string,string> = {}
    const list: string[] = images // process all provided images
    const allowed = (u:string)=> /^https?:\/\//i.test(u) && /(\.png|\.jpe?g|\.gif|\.webp)([?#].*)?$/i.test(u)
    const mkFromFilename = (u:string)=>{
      try{ const url = new URL(u); const file = url.pathname.split('/').pop()||''; const base = file.replace(/\.[a-zA-Z0-9]+$/, ''); const words = base.replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim(); return words || 'image' }catch{ return 'image' }
    }
    const normalizeText = (text: string) => text.trim().toLowerCase()
    const seen = new Set<string>()
    const ensureUniqueText = (text: string) => {
      const base = text.trim() || 'image'
      let candidate = base
      let normalized = normalizeText(candidate)
      let suffix = 1
      while(normalized && seen.has(normalized)){
        suffix++
        candidate = `${base} ${suffix}`
        normalized = normalizeText(candidate)
      }
      if(normalized) seen.add(normalized)
      return candidate
    }
    for(const src of list){
      if(!allowed(src)){
        ideas[src] = ensureUniqueText(mkFromFilename(src))
        continue
      }
      try{
        const msgs: any[] = [
          { role: 'system', content: 'You write concise, descriptive, accessible image alt text (8–14 words) using natural language. Include the primary keyword phrase exactly once if provided. Do not start with "image of" or "photo of". Do not use brand names unless essential. Avoid punctuation at the start/end, emojis, and keyword stuffing. Output plain text only.' },
          { role: 'user', content: [
            { type:'text', text:`Primary keyword(s): ${(Array.isArray(keywords)?keywords:[]).join(', ')||'N/A'}\nDescribe this image for the alt attribute.${variant? `\nReturn a different variation #${variant}.`:''}` },
            { type:'image_url', image_url:{ url: src } }
          ] }
        ]
        const r = await openai.chat.completions.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: msgs as any, temperature: 0.5 })
        let raw = r.choices?.[0]?.message?.content?.trim()?.replace(/^"|"$/g,'') || ''
        let normalized = normalizeText(raw)
        let attempts = 0
        while(attempts < 3 && normalized && seen.has(normalized)){
          attempts++
          const retry = await openai.chat.completions.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: msgs as any, temperature: 0.5 })
          raw = retry.choices?.[0]?.message?.content?.trim()?.replace(/^"|"$/g,'') || ''
          normalized = normalizeText(raw)
        }
        if(!raw) raw = mkFromFilename(src)
        ideas[src] = ensureUniqueText(raw)
      }catch{
        ideas[src] = ensureUniqueText(mkFromFilename(src))
      }
    }
    return NextResponse.json({ ok:true, alts: ideas })
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'alt failed' }, { status: 500 }) }
}
