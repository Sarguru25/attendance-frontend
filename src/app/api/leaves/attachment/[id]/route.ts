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

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await context.params;
    const fileId = params?.id;

    if (!fileId) {
      return NextResponse.json({ error: 'Missing attachment ID' }, { status: 400 });
    }

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

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized: Please log in to view attachments' },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const queryString = url.search || '';
    const targetUrl = `${BACKEND_URL}/api/leaves/attachment/${fileId}${queryString}`;

    const forwardHeaders = new Headers();
    forwardHeaders.set('Authorization', `Bearer ${accessToken}`);

    const companyId =
      req.headers.get('x-company-id') ||
      req.cookies.get('activeCompanyId')?.value ||
      sessionWithToken?.user?.companyId;

    if (companyId) {
      forwardHeaders.set('x-company-id', companyId);
    }

    const upstreamRes = await fetch(targetUrl, {
      method: 'GET',
      headers: forwardHeaders,
      cache: 'no-store',
    });

    if (!upstreamRes.ok) {
      const errData = await upstreamRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.error || 'Failed to download attachment from backend' },
        { status: upstreamRes.status }
      );
    }

    const responseHeaders = new Headers();
    const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
    responseHeaders.set('content-type', contentType);

    const disposition = upstreamRes.headers.get('content-disposition');
    if (disposition) {
      responseHeaders.set('content-disposition', disposition);
    }

    const cacheControl = upstreamRes.headers.get('cache-control');
    if (cacheControl) {
      responseHeaders.set('cache-control', cacheControl);
    }

    const data = await upstreamRes.arrayBuffer();

    return new NextResponse(data, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Attachment Proxy Error]:', message);
    return NextResponse.json({ error: 'Failed to retrieve attachment', message }, { status: 502 });
  }
}

