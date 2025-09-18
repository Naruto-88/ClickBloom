const DEFAULT_ADMIN_EMAILS = ['weerasinghemelaka@gmail.com']

function sanitize(list: string | undefined | null){
  if(!list) return []
  return list
    .split(/[,\s;]/)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
}

export function getAdminEmails(){
  const fromEnv = sanitize(process.env.ADMIN_EMAILS)
  const merged = new Set<string>()
  DEFAULT_ADMIN_EMAILS.forEach(email => merged.add(email.toLowerCase()))
  fromEnv.forEach(email => merged.add(email))
  return Array.from(merged)
}

export function isAdminEmail(email?: string | null){
  if(!email) return false
  return getAdminEmails().includes(email.toLowerCase())
}

export { DEFAULT_ADMIN_EMAILS }
