'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { setCachedToken, setCachedCompanyId } from '@/services/api';

/**
 * SessionSync continuously synchronizes NextAuth JWT tokens and tenant companyId
 * to memory, document.cookie, and localStorage so client-side API calls
 * have valid Authorization headers.
 */
export default function SessionSync() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'authenticated' && session) {
      const token = (session as any).accessToken || (session.user as any)?.accessToken;
      if (token) {
        setCachedToken(token);
        try {
          localStorage.setItem('token', token);
          document.cookie = `token=${encodeURIComponent(token)}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
        } catch (e) {
          // Ignore storage restrictions
        }
      }

      const companyId = session.user?.companyId || (session as any).companyId;
      if (companyId) {
        setCachedCompanyId(companyId);
        try {
          localStorage.setItem('activeCompanyId', companyId);
          document.cookie = `activeCompanyId=${encodeURIComponent(companyId)}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
        } catch (e) {
          // Ignore storage restrictions
        }
      }
    } else if (status === 'unauthenticated') {
      setCachedToken(null);
      setCachedCompanyId(null);
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('activeCompanyId');
        document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
        document.cookie = 'activeCompanyId=; path=/; max-age=0; SameSite=Lax';
      } catch (e) {
        // Ignore storage restrictions
      }
    }
  }, [session, status]);

  return null;
}

