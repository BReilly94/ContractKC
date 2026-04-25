/**
 * Proxy all /api/* requests to the NestJS API server.
 *
 * Why: In Codespaces the browser cannot reach the API's internal port
 * directly. Routing through the Next.js server works because both
 * processes share the same container network.
 */
import { type NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

async function proxy(
  req: NextRequest,
  { params }: { params: { path: string[] } },
): Promise<NextResponse> {
  const upstream = `${API_ORIGIN}/api/${params.path.join('/')}${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const auth = req.headers.get('authorization');
  if (auth) headers['authorization'] = auth;
  const ct = req.headers.get('content-type');
  if (ct) headers['content-type'] = ct;
  const corr = req.headers.get('x-correlation-id');
  if (corr) headers['x-correlation-id'] = corr;

  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.text();
  }

  let res: Response;
  try {
    res = await fetch(upstream, { method: req.method, headers, body });
  } catch (err) {
    console.error('[api-proxy] upstream fetch failed:', err);
    return NextResponse.json(
      { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'API server unreachable' } },
      { status: 502 },
    );
  }

  const responseText = await res.text();
  const responseHeaders: Record<string, string> = {};
  const responseCt = res.headers.get('content-type');
  if (responseCt) responseHeaders['content-type'] = responseCt;
  const responseCorr = res.headers.get('x-correlation-id');
  if (responseCorr) responseHeaders['x-correlation-id'] = responseCorr;

  return new NextResponse(responseText || null, {
    status: res.status,
    headers: responseHeaders,
  });
}

export const GET    = proxy;
export const POST   = proxy;
export const PATCH  = proxy;
export const PUT    = proxy;
export const DELETE = proxy;
