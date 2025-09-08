import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

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
    async jwt({ token, account }){
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
      // @ts-ignore
      session.access_token = (token as any).access_token
      // @ts-ignore
      session.refresh_token = (token as any).refresh_token
      // @ts-ignore
      session.expires_at = (token as any).expires_at
      return session
    }
  },
  debug: process.env.NODE_ENV !== 'production'
})
