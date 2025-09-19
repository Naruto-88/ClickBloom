import OpenAI from 'openai'

const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

export async function seoOptimizeWithAI(input: {
  url?: string
  extracted?: {
    title?: string
    description?: string
    h1?: string
    headings?: string[]
    wordCount?: number
    imagesWithoutAlt?: number
    canonical?: string | null
    robots?: string | null
    textSample?: string
  }
  targetKeywords?: string[]
}){
  const apiKey = process.env.OPENAI_API_KEY
  if(!apiKey){
    throw new Error('Missing OPENAI_API_KEY')
  }
  const openai = new OpenAI({ apiKey })
  const sys = `You are an expert technical SEO and content optimizer.
Return JSON with keys: title, metaDescription, h1, issues (array of {id, title, severity: Critical|Warning|Info, details, fix}), schema (JSON-LD object), internalLinks (array of {anchor, reason}), imageAlts (array of {selector, alt}), contentOutline (array of {h2, bullets[]}), keywords ({primary:[], secondary:[]}), notes.
Focus on on-page fixes, clarity, and best practices. Keep responses concise and actionable.`

  const page = JSON.stringify(input.extracted || {}, null, 2)
  const prompt = `Analyze this page context and suggest improvements.
Target keywords: ${(input.targetKeywords||[]).join(', ') || 'N/A'}
URL: ${input.url||'N/A'}
Page context JSON: ${page}`

  const resp = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3
  })
  const content = resp.choices?.[0]?.message?.content || '{}'
  return JSON.parse(content)
}

