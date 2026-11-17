/**
 * Centralized API Client for Next.js Frontend & Capacitor Mobile App
 * Directs REST API calls either via Next.js BFF proxy (web browser) or directly (Capacitor/SSR).
 */

export function isNativeMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

export function getApiBaseUrl(): string {
  // In web browsers, use relative URLs ('') so requests hit the Next.js reverse proxy (/api/...)
  // on http://localhost:3000. This completely avoids cross-site cookie rejection and third-party
  // cookie isolation across all modern browsers (Firefox, Chrome, Safari).
  if (typeof window !== 'undefined' && !isNativeMobile()) {
    return '';
  }

  // Server-side SSR or native mobile app (Capacitor): use absolute backend URL
  const rawUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000';
  return rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
}

export function getApiUrl(endpoint: string): string {
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${cleanEndpoint}`;
}

function getClientCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

export async function api(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const fullUrl = getApiUrl(endpoint);

  const headers = new Headers(options.headers || {});

  // Retrieve token from cookies or localStorage
  let token: string | null = null;
  let companyId: string | null = null;

  if (typeof window !== 'undefined') {
    token =
      getClientCookie('token') ||
      getClientCookie('auth_token') ||
      localStorage.getItem('token') ||
      sessionStorage.getItem('token');

    companyId =
      getClientCookie('activeCompanyId') ||
      localStorage.getItem('activeCompanyId') ||
      sessionStorage.getItem('activeCompanyId');
  }

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
    const error: any = new Error(errorInfo.error || errorInfo.message || `API error ${res.status}`);
    error.info = errorInfo;
    error.status = res.status;
    throw error;
  }
  return res.json();
};

export const fetcher = apiFetcher;

export default api;
