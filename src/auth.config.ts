import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.companyId = user.companyId;
        token.companyIds = user.companyIds;
        token.accessToken = (user as any).accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        session.user.companyId = token.companyId as string | undefined;
        session.user.companyIds = (token.companyIds as string[]) || [];
        (session.user as any).accessToken = token.accessToken as string | undefined;
        (session as any).accessToken = token.accessToken as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
} satisfies NextAuthConfig;
