/**
 * Centralized API Client for Next.js Frontend & Capacitor Mobile App
 * Directs REST API calls either via Next.js BFF proxy (web browser) or directly (Capacitor/SSR).
 */

let cachedToken: string | null = null;
let cachedCompanyId: string | null = null;
let sessionFetchPromise: Promise<string | null> | null = null;

export function setCachedToken(token: string | null) {
  cachedToken = token;
}

export function setCachedCompanyId(companyId: string | null) {
  cachedCompanyId = companyId;
}

export function isNativeMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

export function getApiBaseUrl(): string {
  // In web browsers, route to Next.js BFF proxy (/api/backend)
  // This completely eliminates cross-site cookie rejection and third-party
  // cookie isolation across all modern browsers (Firefox, Chrome, Safari).
  if (typeof window !== 'undefined' && !isNativeMobile()) {
    return '/api/backend';
  }

  // Server-side SSR or native mobile app (Capacitor): use absolute backend URL
  let rawUrl = (
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:5000'
  ).trim().replace(/\/$/, '');

  if (!rawUrl.startsWith('http://localhost') && !rawUrl.startsWith('http://127.0.0.1') && rawUrl.startsWith('http://')) {
    rawUrl = rawUrl.replace('http://', 'https://');
  }
  return rawUrl;
}

export function getApiUrl(endpoint: string): string {
  const isWeb = typeof window !== 'undefined' && !isNativeMobile();

  if (isWeb) {
    let cleanPath = endpoint.trim();
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);

    // If caller already passed '/api/backend/...', return normalized path
    if (cleanPath.startsWith('api/backend/')) {
      return `/${cleanPath}`;
    }
    if (cleanPath === 'api/backend') {
      return '/api/backend';
    }

    // Strip leading 'api/' so '/api/companies' becomes 'companies'
    if (cleanPath.startsWith('api/')) {
      cleanPath = cleanPath.slice(4);
    } else if (cleanPath === 'api') {
      cleanPath = '';
    }

    return cleanPath ? `/api/backend/${cleanPath}` : '/api/backend';
  }

  // Capacitor native mobile or SSR: direct backend URL
  const baseUrl = getApiBaseUrl();
  let cleanEndpoint = endpoint.trim();
  if (!cleanEndpoint.startsWith('/')) {
    cleanEndpoint = `/${cleanEndpoint}`;
  }
  if (!cleanEndpoint.startsWith('/api/') && cleanEndpoint !== '/api') {
    cleanEndpoint = `/api${cleanEndpoint}`;
  }
  return `${baseUrl}${cleanEndpoint}`;
}

function getClientCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

async function getOrFetchToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  if (cachedToken) return cachedToken;

  const stored =
    getClientCookie('token') ||
    getClientCookie('auth_token') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token');

  if (stored) {
    cachedToken = stored;
    return stored;
  }

  // Deduplicate concurrent getSession() calls across SWR hooks on initial mount
  if (!sessionFetchPromise) {
    sessionFetchPromise = (async () => {
      try {
        const { getSession } = await import('next-auth/react');
        const session = await getSession();
        const tok = (session as { accessToken?: string; user?: { accessToken?: string } })?.accessToken || session?.user?.accessToken || null;
        if (tok) {
          cachedToken = tok;
          try {
            localStorage.setItem('token', tok);
            document.cookie = `token=${encodeURIComponent(tok)}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
          } catch {
            // Ignore cookie write errors
          }
        }
        const compId = (session as { companyId?: string; user?: { companyId?: string } })?.companyId || session?.user?.companyId || null;
        if (compId) {
          cachedCompanyId = compId;
          try {
            localStorage.setItem('activeCompanyId', compId);
            document.cookie = `activeCompanyId=${encodeURIComponent(compId)}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
          } catch {
            // Ignore cookie write errors
          }
        }
        return tok;
      } catch {
        return null;
      } finally {
        sessionFetchPromise = null;
      }
    })();
  }

  return sessionFetchPromise;
}

function getStoredCompanyId(): string | null {
  if (typeof window === 'undefined') return null;
  if (cachedCompanyId) return cachedCompanyId;
  const stored =
    getClientCookie('activeCompanyId') ||
    localStorage.getItem('activeCompanyId') ||
    sessionStorage.getItem('activeCompanyId');
  if (stored) {
    cachedCompanyId = stored;
    return stored;
  }
  return null;
}

export async function api(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const fullUrl = getApiUrl(endpoint);

  const headers = new Headers(options.headers || {});

  // Retrieve token from cache/cookies/localStorage or active NextAuth session
  const token = await getOrFetchToken();
  const companyId = getStoredCompanyId() || cachedCompanyId;

  // Attach Authorization header if token exists and not already present
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Attach company isolation header if present
  if (companyId && !headers.has('x-company-id')) {
    headers.set('x-company-id', companyId);
  }

  const mergedOptions: RequestInit = {
    ...options,
    headers,
    credentials: options.credentials || 'include',
  };

  return fetch(fullUrl, mergedOptions);
}

export const apiFetcher = async (url: string) => {
  const res = await api(url);
  if (!res.ok) {
    const errorInfo = await res.json().catch(() => ({}));
    const error = new Error(errorInfo.error || errorInfo.message || `API error ${res.status}`) as Error & {
      info?: unknown;
      status?: number;
    };
    error.info = errorInfo;
    error.status = res.status;
    throw error;
  }
  return res.json();
};

export const fetcher = apiFetcher;

export default api;
