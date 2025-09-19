import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get('siteId')
  if(!siteId) return NextResponse.json({ ok:false, error:'Missing siteId' }, { status:400 })
  const file = path.join(process.cwd(), 'web-data', 'crawls', `${siteId}.json`)
  try{
    const raw = await fs.readFile(file, 'utf8')
    return new NextResponse(raw, { status:200, headers:{ 'content-type':'application/json' } })
  }catch{ return NextResponse.json({ ok:false, error:'No results' }, { status:404 }) }
}

