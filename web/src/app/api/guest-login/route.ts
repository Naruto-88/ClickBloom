import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest){
  const res = NextResponse.redirect(new URL('/pricing', req.url))
  res.cookies.set('guest', '1', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60*60*24*7 })
  return res
}

export async function POST(req: NextRequest){
  return GET(req)
}

