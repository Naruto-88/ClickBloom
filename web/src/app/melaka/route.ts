import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest){
  const auth = req.headers.get('authorization') || ''
  const expected = 'Basic ' + Buffer.from('melaka:sanara').toString('base64')
  if(auth !== expected){
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="ClickBloom Admin"' }
    })
  }
  return NextResponse.redirect(new URL('/admin/licenses', req.url))
}

