import LicensesClient from './LicensesClient'

async function getData(){
  const res = await fetch(`${process.env.NEXTAUTH_URL || ''}/api/admin/license/list`, { cache:'no-store' })
  if(!res.ok) return { licenses:[], activations:[] }
  return res.json()
}

export default async function LicensesPage(){
  return (
    <div className="container">
      <h2>Licenses</h2>
      <LicensesClient/>
    </div>
  )
}
