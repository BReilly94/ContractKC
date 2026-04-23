import { describe, expect, it } from 'vitest';
import { parseEml } from './parse.js';

function buildEml(headers: Record<string, string>, body: string): Buffer {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
  lines.push('');
  lines.push(body);
  return Buffer.from(lines.join('\r\n'), 'utf8');
}

describe('parseEml', () => {
  it('parses a plain email', async () => {
    const raw = buildEml(
      {
        From: '"Client" <client@acme.com>',
        To: 'contract-abc@contracts.technicamining.com',
        Subject: 'RFI-017',
        Date: 'Wed, 22 Apr 2026 10:00:00 +0000',
        'Message-ID': '<abc123@acme.com>',
      },
      'Per your clause 14.2, we require notice.',
    );
    const parsed = await parseEml(raw);
    expect(parsed.from).toBe('client@acme.com');
    expect(parsed.to).toContain('contract-abc@contracts.technicamining.com');
    expect(parsed.subject).toBe('RFI-017');
    expect(parsed.messageId).toBe('<abc123@acme.com>');
    expect(parsed.textBody).toContain('clause 14.2');
  });

  it('flags auto-submitted mail', async () => {
    const raw = buildEml(
      {
        From: 'noreply@acme.com',
        To: 'contract-abc@contracts.technicamining.com',
        Subject: 'Out of office',
        'Message-ID': '<ooo@acme.com>',
        'Auto-Submitted': 'auto-replied',
      },
      'I am out of office.',
    );
    const parsed = await parseEml(raw);
    expect(parsed.isAutoSubmitted).toBe(true);
  });

  it('extracts References header as an array', async () => {
    const raw = buildEml(
      {
        From: 'client@acme.com',
        To: 'contract-abc@contracts.technicamining.com',
        Subject: 'Re: RFI-017',
        'Message-ID': '<reply1@acme.com>',
        'In-Reply-To': '<abc123@acme.com>',
        References: '<root@acme.com> <abc123@acme.com>',
      },
      'Follow-up.',
    );
    const parsed = await parseEml(raw);
    expect(parsed.inReplyTo).toBe('<abc123@acme.com>');
    expect(parsed.references).toContain('<abc123@acme.com>');
    expect(parsed.references).toContain('<root@acme.com>');
  });
});
