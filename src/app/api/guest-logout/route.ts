import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge'

export async function GET(req: NextRequest){
  const res = NextResponse.redirect(new URL('/login', req.url))
  res.cookies.set('guest', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}

