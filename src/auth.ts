import NextAuth, { CredentialsSignin } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { cookies } from 'next/headers';
import { authConfig } from './auth.config';

class InactiveAccountError extends CredentialsSignin {
  code = 'inactive_account';
}

const getBackendUrl = () => {
  let url = (process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').trim().replace(/\/$/, '');
  if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1') && url.startsWith('http://')) {
    url = url.replace('http://', 'https://');
  }
  return url;
};

const BACKEND_URL = getBackendUrl();

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          const data = await res.json().catch(() => ({}));

          if (!res.ok || !data.success) {
            if (res.status === 403 || data.code === 'inactive_account') {
              console.log('Login failed: user account is deactivated');
              throw new InactiveAccountError();
            }
            console.log(`Login failed (status ${res.status}): ${data.error || data.message || 'invalid credentials or backend rejected'}`);
            return null;
          }

          // Set cookie for browser client calls
          try {
            const cookieStore = await cookies();
            cookieStore.set('token', data.token, {
              path: '/',
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              httpOnly: false, // Allow client-side api client to read for Authorization header
              maxAge: 30 * 24 * 60 * 60,
            });

            if (data.user.companyId) {
              cookieStore.set('activeCompanyId', data.user.companyId, {
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                httpOnly: false, // Allow client-side api client to read for x-company-id header
                maxAge: 30 * 24 * 60 * 60,
              });
            }
          } catch (cookieErr) {
            // Non-critical if headers already sent
          }

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            companyId: data.user.companyId,
            companyIds: data.user.companyIds || [],
            accessToken: data.token,
          };
        } catch (error: any) {
          if (error instanceof InactiveAccountError) throw error;
          console.error('[Auth] Error during authorize fetch:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.companyId = user.companyId;
        token.companyIds = user.companyIds;
        token.accessToken = user.accessToken;
      }

      // Live verification: Invalidate deactivated user sessions
      if (token?.id) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/auth/status?userId=${token.id}`, {
            headers: token.accessToken ? { Authorization: `Bearer ${token.accessToken}` } : {},
            cache: 'no-store',
          });

          if (res.ok) {
            const statusData = await res.json();
            if (statusData.isActive === false || statusData.active === false) {
              console.log(`[Auth] Deactivated user session detected for ${token.id}. Invalidating token.`);
              return null;
            }
          }
        } catch (err) {
          // Fallback gracefully on temporary network issues
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (!token) {
        return null as any;
      }
      if (token) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        session.user.companyId = token.companyId as string | undefined;
        session.user.companyIds = (token.companyIds as string[]) || [];
        session.user.accessToken = token.accessToken as string | undefined;
        session.accessToken = token.accessToken as string | undefined;
      }
      return session;
    },
  },
});
