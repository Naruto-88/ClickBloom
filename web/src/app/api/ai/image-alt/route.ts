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
    const primary = Array.isArray(keywords) && keywords[0] ? String(keywords[0]).trim() : ''
    const ensureIncludes = (text: string, kw: string) => {
      if(!kw) return text
      const has = text.toLowerCase().includes(kw.toLowerCase())
      if(has) return text
      // If not present, append keyword once (keep concise)
      const joined = `${text} ${kw}`.trim()
      return joined
    }
    const allowed = (u:string)=> /^https?:\/\//i.test(u) && /(\.png|\.jpe?g|\.gif|\.webp)([?#].*)?$/i.test(u)
    const mkFromFilename = (u:string)=>{
      try{ const url = new URL(u); const file = url.pathname.split('/').pop()||''; const base = file.replace(/\.[a-zA-Z0-9]+$/, ''); const words = base.replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim(); const kw = Array.isArray(keywords)&&keywords[0]? (' '+keywords[0]):''; return (words||'image')+kw }catch{ return (Array.isArray(keywords)&&keywords[0])? (keywords[0]+' image') : 'image' }
    }
    for(const src of list){
      if(!allowed(src)){
        ideas[src] = ensureIncludes(mkFromFilename(src), primary)
        continue
      }
      try{
        const msgs: any[] = [
          { role: 'system', content: 'You write concise, descriptive, accessible image alt text (<= 14 words), using natural language. Always include the primary keyword phrase exactly once if provided. Output plain text, no quotes or punctuation at the ends.' },
          { role: 'user', content: [
            { type:'text', text:`Primary keyword(s): ${(Array.isArray(keywords)?keywords:[]).join(', ')||'N/A'}\nDescribe this image for the alt attribute.${variant? `\nReturn a different variation #${variant}.`:''}` },
            { type:'image_url', image_url:{ url: src } }
          ] }
        ]
        const r = await openai.chat.completions.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: msgs as any, temperature: 0.5 })
        const raw = r.choices?.[0]?.message?.content?.trim()?.replace(/^"|"$/g,'') || mkFromFilename(src)
        ideas[src] = ensureIncludes(raw, primary)
      }catch{
        ideas[src] = ensureIncludes(mkFromFilename(src), primary)
      }
    }
    return NextResponse.json({ ok:true, alts: ideas })
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'alt failed' }, { status: 500 }) }
}
