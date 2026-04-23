import Fastify, { type FastifyInstance } from 'fastify';
import { acceptInboundEmail, type IngestionPipelineDeps } from './pipeline.js';
import { verifyHmacSha256 } from './sendgrid-signature.js';

/**
 * SendGrid Inbound Parse delivers a multipart/form-data POST with the raw
 * `.eml` in the `email` field. For Phase 1 we take a simplified JSON-body
 * alternative at `/webhooks/inbound-email/local` that accepts base64-encoded
 * raw bytes — used by the local folder-watcher as a round-trip smoke test.
 *
 * The SendGrid path at `/webhooks/inbound-email/sendgrid` is wired with HMAC
 * verification and will accept multipart in Slice D. For Slice B, SendGrid
 * parsing is documented and stubbed.
 *
 * ASSUMPTION: signature-secret HMAC mode until Q-005 resolves the SendGrid
 * vs Azure-native decision. If we adopt Azure-native, this module is replaced
 * wholesale; the pipeline module is reused.
 */

export interface WebhookServerOptions {
  readonly hmacSecret: string | undefined;
  readonly deps: IngestionPipelineDeps;
}

export function buildWebhookServer(opts: WebhookServerOptions): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 40 * 1024 * 1024 });

  // Preserve the raw buffer for HMAC verification on the SendGrid route. Binds
  // `request.rawBody` alongside the parsed body.
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => {
    const buf = body as Buffer;
    (req as unknown as { rawBody: Buffer }).rawBody = buf;
    if (req.headers['content-type']?.includes('application/json')) {
      try {
        done(null, JSON.parse(buf.toString('utf8')) as unknown);
      } catch (err) {
        done(err as Error, undefined);
      }
    } else {
      done(null, buf);
    }
  });

  app.get('/health', async () => ({
    ok: true,
    ingester: 'ready',
    time: new Date().toISOString(),
  }));

  app.post<{
    Body: {
      envelopeTo: string[];
      envelopeFrom: string;
      rawBase64: string;
      source?: string;
    };
  }>('/webhooks/inbound-email/local', async (req, reply) => {
    // Local dev route — the folder-watcher uses this for a round-trip test of
    // webhook semantics. Never exposed publicly; bound to localhost by main.ts.
    const body = req.body;
    if (!body || typeof body.rawBase64 !== 'string' || !Array.isArray(body.envelopeTo)) {
      return reply.code(400).send({ error: 'invalid_request' });
    }
    const rawBytes = Buffer.from(body.rawBase64, 'base64');
    const result = await acceptInboundEmail(
      {
        rawBytes,
        envelopeTo: body.envelopeTo,
        envelopeFrom: body.envelopeFrom,
        provider: 'LocalFolderWatcher',
        source: body.source ?? 'dev-folder',
      },
      opts.deps,
    );
    return { ok: true, ...result };
  });

  app.post('/webhooks/inbound-email/sendgrid', async (req, reply) => {
    const signature = req.headers['x-ckb-signature'];
    if (!opts.hmacSecret) {
      return reply.code(503).send({
        error: 'ingestion_webhook_secret_not_configured',
        // ASSUMPTION: fail closed if no secret is set; Q-005 will select the
        // real signing mechanism (SendGrid Event Webhook vs. Azure gateway).
      });
    }
    if (typeof signature !== 'string') {
      return reply.code(401).send({ error: 'missing_signature' });
    }
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    if (!verifyHmacSha256(raw, opts.hmacSecret, signature)) {
      return reply.code(401).send({ error: 'invalid_signature' });
    }
    // ASSUMPTION: full multipart parsing lands in Slice D; Slice B only verifies
    // the path is wired and signature-gated. Returning 501 keeps the shape honest.
    return reply.code(501).send({ error: 'not_implemented_yet' });
  });

  return app;
}
