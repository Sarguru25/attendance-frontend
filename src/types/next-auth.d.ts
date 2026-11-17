import NextAuth, { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      companyId?: string;
      companyIds?: string[];
      accessToken?: string;
    } & DefaultSession['user'];
    accessToken?: string;
  }

  interface User {
    role?: string;
    companyId?: string;
    companyIds?: string[];
    accessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string;
    id?: string;
    companyId?: string;
    companyIds?: string[];
    accessToken?: string;
  }
}
