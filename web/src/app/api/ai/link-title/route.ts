import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

export async function POST(req: NextRequest){
  try{
    const { href, text, url, apiKey: bodyKey, model: bodyModel } = await req.json()
    const headerKey = req.headers.get('x-openai-key') || undefined
    const apiKey = bodyKey || headerKey || process.env.OPENAI_API_KEY
    if(!apiKey){
      return NextResponse.json({ ok:false, error:'Missing API key (set OPENAI_API_KEY or send apiKey)' }, { status: 400 })
    }
    const model = bodyModel || process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const userPrompt = [
      `Page URL: ${url || 'N/A'}`,
      `Link href: ${href || 'N/A'}`,
      `Link text: ${text || 'N/A'}`,
      'Generate a concise (ideally 5-12 word), descriptive title attribute for this link that clarifies where it goes. Respond with just the title text.'
    ].join('\n')
    const openai = new OpenAI({ apiKey })
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role:'system', content:'You are an SEO expert that writes accessible link title attributes.' },
        { role:'user', content: userPrompt }
      ],
      temperature: 0.4,
      max_tokens: 64
    })
    const textOut = response.choices?.[0]?.message?.content?.trim() || ''
    const title = textOut.split('\n')[0].trim()
    if(!title){
      return NextResponse.json({ ok:false, error:'AI returned empty title' }, { status: 500 })
    }
    return NextResponse.json({ ok:true, title })
  }catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message || 'link title generation failed' }, { status: 500 })
  }
}
