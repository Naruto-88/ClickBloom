// Simple AES-GCM helpers reused across settings routes
export function getAesKey(){
  const s = process.env.CRYPTO_SECRET || process.env.NEXTAUTH_SECRET || ''
  if(!s) return null
  const buf = Buffer.alloc(32)
  Buffer.from(s).copy(buf)
  return buf
}

export function aesEncrypt(plain: string){
  const key = getAesKey(); if(!key) return plain
  const crypto = require('crypto') as typeof import('crypto')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function aesDecrypt(data: string){
  const key = getAesKey(); if(!key) return data
  const crypto = require('crypto') as typeof import('crypto')
  const raw = Buffer.from(data, 'base64')
  const iv = raw.subarray(0,12)
  const tag = raw.subarray(12,28)
  const ct = raw.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}

