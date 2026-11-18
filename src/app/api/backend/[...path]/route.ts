import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const getBackendUrl = () => {
  let url = (
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://delighted-lightgreen-armadillo-15.hostingersite.com'
  ).trim().replace(/\/$/, '');

  if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1') && url.startsWith('http://')) {
    url = url.replace('http://', 'https://');
  }
  return url;
};

const BACKEND_URL = getBackendUrl();

async function handleProxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  try {
    const params = await context.params;
    const pathSegments = params?.path || [];
    const pathString = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments;

    const url = new URL(req.url);
    const queryString = url.search || '';
    const targetUrl = `${BACKEND_URL}/api/${pathString}${queryString}`;

    // 1. Authenticate server-side via NextAuth session or incoming Authorization header
    const session = await auth();
    const sessionWithToken = session as unknown as {
      accessToken?: string;
      user?: { accessToken?: string; companyId?: string };
    };
    let accessToken =
      sessionWithToken?.accessToken ||
      sessionWithToken?.user?.accessToken;

    const incomingAuth = req.headers.get('authorization');
    if (!accessToken && incomingAuth && incomingAuth.startsWith('Bearer ')) {
      accessToken = incomingAuth.slice(7).trim();
    }

    // Fastify endpoints that do not require authentication
    const isPublicPath =
      pathString === 'auth/login' ||
      pathString === 'health';

    if (!accessToken && !isPublicPath) {
      return NextResponse.json(
        { error: 'Unauthorized: No active session or token' },
        { status: 401 }
      );
    }

    // 2. Prepare headers for upstream Fastify request
    const forwardHeaders = new Headers();

    if (accessToken) {
      forwardHeaders.set('Authorization', `Bearer ${accessToken}`);
    }

    // Forward company isolation header
    const incomingCompanyId =
      req.headers.get('x-company-id') ||
      req.cookies.get('activeCompanyId')?.value ||
      sessionWithToken?.user?.companyId;

    if (incomingCompanyId) {
      forwardHeaders.set('x-company-id', incomingCompanyId);
    }

    // Forward Content-Type if present (preserves multipart boundary & JSON)
    const contentType = req.headers.get('content-type');
    if (contentType) {
      forwardHeaders.set('content-type', contentType);
    }

    // Forward Accept header
    const accept = req.headers.get('accept');
    if (accept) {
      forwardHeaders.set('accept', accept);
    }

    // 3. Prepare request body (for POST, PUT, PATCH, DELETE)
    let body: BodyInit | undefined = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const arrayBuffer = await req.arrayBuffer();
      if (arrayBuffer.byteLength > 0) {
        body = Buffer.from(arrayBuffer);
      }
    }

    // 4. Send server-to-server request to Fastify backend
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
      cache: 'no-store',
    });

    // 5. Build response back to browser
    const responseHeaders = new Headers();
    const resContentType = upstreamRes.headers.get('content-type');
    if (resContentType) {
      responseHeaders.set('content-type', resContentType);
    }
    const resDisposition = upstreamRes.headers.get('content-disposition');
    if (resDisposition) {
      responseHeaders.set('content-disposition', resDisposition);
    }

    // Forward cookies set by backend (e.g. activeCompanyId)
    const headersWithCookies = upstreamRes.headers as unknown as { getSetCookie?: () => string[] };
    const setCookies = typeof headersWithCookies.getSetCookie === 'function' ? headersWithCookies.getSetCookie() : [];
    if (setCookies.length > 0) {
      for (const cookieStr of setCookies) {
        responseHeaders.append('set-cookie', cookieStr);
      }
    } else {
      const sc = upstreamRes.headers.get('set-cookie');
      if (sc) {
        responseHeaders.set('set-cookie', sc);
      }
    }

    // Automatically enrich /api/employee/leaves with leaveBalance if missing from backend
    if (pathString === 'employee/leaves' && req.method === 'GET' && upstreamRes.ok) {
      try {
        const leavesJson = (await upstreamRes.json()) as { leaves?: unknown[]; balance?: unknown };
        if (!leavesJson.balance) {
          const profileRes = await fetch(`${BACKEND_URL}/api/profile`, {
            method: 'GET',
            headers: forwardHeaders,
            cache: 'no-store',
          });
          if (profileRes.ok) {
            const profileJson = (await profileRes.json()) as { user?: { leaveBalance?: unknown } };
            leavesJson.balance = profileJson.user?.leaveBalance || null;
          }
        }
        return NextResponse.json(leavesJson, {
          status: upstreamRes.status,
          statusText: upstreamRes.statusText,
          headers: responseHeaders,
        });
      } catch {
        // Fallback to raw response on parse error
      }
    }

    const resData = await upstreamRes.arrayBuffer();

    return new NextResponse(resData, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : 'Unknown proxy error';
    console.error('[BFF Proxy Error]:', errMessage);
    return NextResponse.json(
      { error: 'Failed to communicate with backend server', message: errMessage },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-company-id',
    },
  });
}
