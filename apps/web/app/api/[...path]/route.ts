/**
 * Proxy all /api/* requests to the NestJS API server.
 *
 * Why: In Codespaces (and similar tunnel environments) the browser cannot
 * reach the API's internal port directly. Routing through the Next.js server
 * works because the server and API share the same container network.
 */
import { type NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

async function proxy(req: NextRequest, params: Promise<{ path: string[] }>): Promise<NextResponse> {
  const { path } = await params;
  const target = `${API_ORIGIN}/api/${path.join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    // Strip headers Next.js / the host adds that would confuse the upstream.
    if (!['host', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.arrayBuffer();
  }

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body,
    // @ts-expect-error -- Node 18+ fetch supports this; suppresses duplex warning
    duplex: 'half',
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET     = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, ctx.params);
export const POST    = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, ctx.params);
export const PATCH   = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, ctx.params);
export const PUT     = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, ctx.params);
export const DELETE  = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => proxy(req, ctx.params);
