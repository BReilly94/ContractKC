import { z } from 'zod';

/**
 * Outlook add-in forward payload. Sent as JSON with base64 body so it rides
 * the existing 150mb JSON body limit and matches the document-upload pattern.
 *
 * - `emlBase64`  — the raw .eml bytes the add-in extracted via
 *                  `item.getAsFileAsync(EmailFileType.Eml, ...)`.
 * - `envelopeFrom` — optional; if absent, the worker will derive from the
 *                  parsed message's From header. Declared for parity with the
 *                  SendGrid/folder-watcher paths.
 * - `source`     — free-text tag captured for audit. Default `'outlook-addin'`.
 */
export const ForwardEmailBody = z.object({
  emlBase64: z.string().min(1),
  envelopeFrom: z.string().email().optional(),
  source: z.string().min(1).max(64).default('outlook-addin'),
});
export type ForwardEmailBody = z.infer<typeof ForwardEmailBody>;
