import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import axios from 'axios';

// API_URL is a runtime env var for server-side calls (not baked in at build time like NEXT_PUBLIC_*)
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const res = await axios.post(`${API_URL}/api/v1/auth/login`, credentials);
          const { user, accessToken } = res.data;
          return { ...user, accessToken };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = (user as any).accessToken;
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      (session.user as any).id = token.id;
      (session.user as any).role = token.role;
      return session;
    },
  },
  pages: {
    signIn: '/auth/login',
  },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
