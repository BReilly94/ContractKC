import { simpleParser, type AddressObject } from 'mailparser';
import { sha256 } from '@ckb/shared';

/**
 * MIME parsing (`email-ingestion.md` §7.3). Wraps `mailparser` with a narrow,
 * predictable return shape. Does NOT follow any URLs (XXE/SSRF surface) — the
 * parser is configured with `skipHtmlToText: false` (we want text), no image
 * fetching, no external DTD resolution.
 */

export interface ParsedAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: Buffer;
  readonly sha256: string;
  /** True if the attachment is detected as encrypted (password-protected). */
  readonly encrypted: boolean;
}

export interface ParsedEmail {
  readonly messageId: string;
  readonly inReplyTo: string | null;
  readonly references: readonly string[];
  readonly from: string;
  readonly fromName: string | null;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly bcc: readonly string[];
  readonly subject: string;
  readonly date: Date | null;
  readonly textBody: string | null;
  readonly htmlBody: string | null;
  readonly attachments: readonly ParsedAttachment[];
  readonly isAutoSubmitted: boolean;
}

function listAddresses(obj: AddressObject | AddressObject[] | undefined): string[] {
  if (!obj) return [];
  const arr = Array.isArray(obj) ? obj : [obj];
  const out: string[] = [];
  for (const a of arr) {
    for (const v of a.value) {
      if (v.address) out.push(v.address.toLowerCase());
    }
  }
  return out;
}

/**
 * Lightweight encryption detection. Not a cryptographic assertion — just a
 * heuristic that's good enough to route to review queue.
 */
function detectEncrypted(filename: string, bytes: Buffer): boolean {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) {
    // Search the first ~20 KB for /Encrypt.
    const window = bytes.subarray(0, Math.min(bytes.length, 20 * 1024)).toString('binary');
    return /\/Encrypt\b/.test(window);
  }
  if (lower.endsWith('.zip')) {
    // ZIP local file header bit 0 of general purpose flag.
    if (bytes.length >= 12) {
      const gpFlag = bytes.readUInt16LE(6);
      return (gpFlag & 0x1) === 0x1;
    }
  }
  if (lower.endsWith('.docx') || lower.endsWith('.xlsx') || lower.endsWith('.pptx')) {
    // OOXML with password protection is an OLE2 file (D0 CF 11 E0), not PK zip.
    return (
      bytes.length >= 4 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0
    );
  }
  return false;
}

export async function parseEml(rawBytes: Buffer): Promise<ParsedEmail> {
  const parsed = await simpleParser(rawBytes, {
    skipImageLinks: true,
    skipHtmlToText: false,
    keepCidLinks: true,
  });

  const messageId = parsed.messageId ?? '';
  const inReplyTo = parsed.inReplyTo ?? null;
  // mailparser normalises References into a string[] or string.
  const refsRaw = parsed.references;
  const references: string[] = Array.isArray(refsRaw)
    ? refsRaw
    : refsRaw
      ? [refsRaw]
      : [];

  // 'from' can be an AddressObject or undefined.
  const fromAddr = parsed.from?.value[0]?.address?.toLowerCase() ?? '';
  const fromName = parsed.from?.value[0]?.name ?? null;

  const headers = parsed.headers;
  const autoSubmitted = (headers.get('auto-submitted') as string | undefined) ?? '';
  const precedence = (headers.get('precedence') as string | undefined) ?? '';
  const isAutoSubmitted =
    /^auto-/i.test(autoSubmitted) || /^(bulk|auto_reply|list)$/i.test(precedence);

  const attachments: ParsedAttachment[] = (parsed.attachments ?? []).map((a) => ({
    filename: a.filename ?? 'attachment.bin',
    contentType: a.contentType ?? 'application/octet-stream',
    bytes: a.content,
    sha256: sha256(a.content),
    encrypted: detectEncrypted(a.filename ?? '', a.content),
  }));

  return {
    messageId,
    inReplyTo,
    references,
    from: fromAddr,
    fromName,
    to: listAddresses(parsed.to),
    cc: listAddresses(parsed.cc),
    bcc: listAddresses(parsed.bcc),
    subject: parsed.subject ?? '',
    date: parsed.date ?? null,
    textBody: parsed.text ?? null,
    htmlBody: parsed.html ? String(parsed.html) : null,
    attachments,
    isAutoSubmitted,
  };
}
