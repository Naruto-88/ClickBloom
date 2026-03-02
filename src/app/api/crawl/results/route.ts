import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { calculateSiteHealth, identifyInternalLinkOpportunities } from '@/lib/seo-utils'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get('siteId')
  if (!siteId) return NextResponse.json({ ok: false, error: 'Missing siteId' }, { status: 400 })
  const file = path.join(process.cwd(), 'web-data', 'crawls', `${siteId}.json`)
  try {
    const raw = await fs.readFile(file, 'utf8')
    const data = JSON.parse(raw)

    // Inject health score and link opportunities if pages exist
    if (data.pages && Array.isArray(data.pages)) {
      data.health = calculateSiteHealth(data.pages)
      data.internalLinkOpportunities = identifyInternalLinkOpportunities(data.pages)
    }

    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'No results' }, { status: 404 })
  }
}

