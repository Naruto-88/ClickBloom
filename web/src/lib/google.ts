export async function googleApi<T>(token: string, url: string){
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if(!res.ok){
    const text = await res.text()
    throw new Error(`Google API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

