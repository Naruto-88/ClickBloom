import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { isAdminEmail } from "@/lib/admin"
import { getUser, upsertUser } from "@/lib/users"

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
if(!googleClientId || !googleClientSecret){
  console.warn("[auth] Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. Set them in .env.local")
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: googleClientId || "",
      clientSecret: googleClientSecret || "",
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/webmasters.readonly',
            'https://www.googleapis.com/auth/analytics.readonly'
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',
          include_granted_scopes: 'true'
        }
      }
    })
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    async signIn({ user }){
      const email = user?.email
      if(!email){
        console.warn('[auth] Sign-in attempt without email')
        return '/login?error=AccessDenied'
      }
      const existing = await getUser(email)
      if(existing?.status === 'blocked'){
        console.warn(`[auth] Blocked sign-in attempt for ${email}`)
        return '/login?error=AccessDenied'
      }
      await upsertUser({ email, name: user?.name, image: user?.image })
      return true
    },
    async jwt({ token, account, user }){
      if(user?.email){
        // @ts-ignore storing custom flag on token
        token.isAdmin = isAdminEmail(user.email)
      } else if(token?.email){
        // @ts-ignore ensure flag persists across refreshes
        token.isAdmin = isAdminEmail(String(token.email))
      }
      if(account){
        // Persist OAuth tokens
        // @ts-ignore
        token.access_token = (account as any).access_token
        // @ts-ignore
        token.refresh_token = (account as any).refresh_token || (token as any).refresh_token
        // @ts-ignore
        token.expires_at = (account as any).expires_at || (Date.now()/1000 + 3600)
      }
      return token
    },
    async session({ session, token }){
      // @ts-ignore propagate OAuth details
      session.access_token = (token as any).access_token
      // @ts-ignore
      session.refresh_token = (token as any).refresh_token
      // @ts-ignore
      session.expires_at = (token as any).expires_at
      if(session?.user){
        // @ts-ignore expose admin flag to client
        session.user.isAdmin = Boolean((token as any).isAdmin || isAdminEmail(session.user.email || undefined))
      }
      return session
    }
  },
  debug: process.env.NODE_ENV !== 'production'
})
