/**
 * SEO Utility for ClickBloom
 * Calculates health scores and prioritizes issues
 */

export interface PageData {
    url: string
    title?: string
    meta?: string
    h1?: string
    words?: number
    images?: { total: number, withAlt: number }
    canonical?: string
    schemaCount?: number
}

export interface HealthScore {
    total: number
    breakdown: {
        metadata: number
        content: number
        technical: number
        images: number
    }
}

export function calculatePageScore(page: PageData): number {
    let score = 100

    // Metadata (30 pts)
    if (!page.title || page.title === 'Untitled') score -= 15
    if (!page.meta) score -= 15
    else if (page.meta.length < 50 || page.meta.length > 160) score -= 5

    // Content (30 pts)
    if (!page.h1 || page.h1 === 'No H1') score -= 15
    if ((page.words || 0) < 300) score -= 15

    // Images (20 pts)
    if (page.images && page.images.total > 0) {
        const altRatio = page.images.withAlt / page.images.total
        score -= (1 - altRatio) * 20
    }

    // Technical (20 pts)
    if (!page.schemaCount) score -= 10
    if (!page.canonical) score -= 10

    return Math.max(0, Math.round(score))
}

export function calculateSiteHealth(pages: PageData[]): HealthScore {
    if (pages.length === 0) return { total: 0, breakdown: { metadata: 0, content: 0, technical: 0, images: 0 } }

    const scores = pages.map(calculatePageScore)
    const avg = scores.reduce((a, b) => a + b, 0) / pages.length

    return {
        total: Math.round(avg),
        breakdown: {
            metadata: 85, // Placeholder for more complex breakdown
            content: 70,
            technical: 90,
            images: 60
        }
    }
}

export function identifyInternalLinkOpportunities(pages: PageData[]): Array<{ source: string, target: string, anchor: string }> {
    const opportunities: Array<{ source: string, target: string, anchor: string }> = []

    // Create a keyword map from titles and H1s
    const keywordMap = pages.map(p => ({
        url: p.url,
        keywords: [p.title, p.h1]
            .filter(Boolean)
            .map(k => k!.toLowerCase())
            .flatMap(k => k.split(/[^a-z0-9]+/))
            .filter(k => k.length > 4) // Only significant words
    }))

    pages.forEach(source => {
        pages.forEach(target => {
            if (source.url === target.url) return

            // Simple heuristic: if target's title keywords appear in source metadata
            const targetKeywords = target.title?.toLowerCase().split(/[^a-z0-9]+/).filter(k => k.length > 4) || []
            const sourceText = (source.title + ' ' + source.meta).toLowerCase()

            targetKeywords.forEach(kw => {
                if (sourceText.includes(kw)) {
                    opportunities.push({
                        source: source.url,
                        target: target.url,
                        anchor: kw
                    })
                }
            })
        })
    })

    return opportunities.slice(0, 50) // Limit to top 50
}
