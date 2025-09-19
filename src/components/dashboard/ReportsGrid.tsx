"use client"

const items = [
  'New Keywords\nInsights', 'New Pages\nInsights', 'Low CTRs\nBy Page', 'Low CTRs\nBy Query', 'Top Query\nPer Page', 'Long Tail\nKeywords'
]

export default function ReportsGrid(){
  return (
    <div className="card">
      <div className="panel-title"><div><strong>Reports</strong><div className="muted">Get actionable SEO insights on keywords, queries, CTRs, top queries, and more</div></div><a className="btn secondary" href="#">View Reports</a></div>
      <div className="reports">
        {items.map((t)=> <div key={t} className="report-card">{t}</div>)}
      </div>
    </div>
  )
}

