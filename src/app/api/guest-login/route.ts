import { NextResponse } from 'next/server'
export const runtime = 'edge'

function guestAccessDisabled(){
  return NextResponse.json({ error: 'Guest access is no longer available.' }, { status: 410 })
}

export async function GET(){
  return guestAccessDisabled()
}

export async function POST(){
  return guestAccessDisabled()
}

