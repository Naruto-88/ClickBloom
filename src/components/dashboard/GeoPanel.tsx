"use client"

export default function GeoPanel(){
  const countries = [
    { name:'Australia', pct: 87.8, clicks: 193 },
    { name:'United Kingdom', pct: 4.9, clicks: 10 },
    { name:'New Zealand', pct: 3.8, clicks: 8 },
    { name:'India', pct: 0.9, clicks: 2 },
    { name:'United States', pct: 0.9, clicks: 2 },
  ]
  return (
    <div className="card">
      <div className="panel-title"><div><strong>Geographic Performance</strong><div className="muted">Track performance by country</div></div><span className="badge">9 Countries</span></div>
      <div className="map-box">
        <div className="fake-map"/>
      </div>
      <div style={{height:10}}/>
      <div className="num-list">
        {countries.map((c,i)=> (
          <div key={c.name} className="row">
            <div style={{display:'flex', alignItems:'center'}}><span className="num-badge">{i+1}</span>{c.name}</div>
            <div className="muted">{c.pct}% • {c.clicks} clicks</div>
          </div>
        ))}
      </div>
    </div>
  )
}

