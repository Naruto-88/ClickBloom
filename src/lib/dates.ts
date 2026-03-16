export const GSC_LAG_DAYS = 2 // User confirmed Feb 28 is available on March 2nd

export type DateRange = { from: Date; to: Date }

export function getGscSafeDate(): Date {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - GSC_LAG_DAYS)
    return d
}

export function fmtDateISO(d: Date): string {
    const pad = (n: number) => (n < 10 ? '0' + n : n)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function buildDaysRange(days: number): DateRange {
    const end = getGscSafeDate()
    const start = new Date(end)
    start.setDate(end.getDate() - (days - 1))
    return { from: start, to: end }
}

export function buildMonthRange(monthOffset: number): DateRange {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const to = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0)
    return { from, to }
}

export function getPresets() {
    const end = getGscSafeDate()
    return [
        { key: '7d', label: 'Last 7 Days', range: buildDaysRange(7) },
        { key: '28d', label: 'Last 28 Days', range: buildDaysRange(28) },
        { key: '30d', label: 'Last 30 Days', range: buildDaysRange(30) },
        { key: '3m', label: 'Last 3 Months', range: buildDaysRange(90) },
        { key: '6m', label: 'Last 6 Months', range: buildDaysRange(180) },
        { key: '1y', label: 'Last 12 Months', range: buildDaysRange(365) },
        {
            key: 'this',
            label: 'This Month',
            range: { from: new Date(end.getFullYear(), end.getMonth(), 1), to: end },
        },
        {
            key: 'last',
            label: 'Last Month',
            range: {
                from: new Date(end.getFullYear(), end.getMonth() - 1, 1),
                to: new Date(end.getFullYear(), end.getMonth(), 0),
            },
        },
    ]
}
