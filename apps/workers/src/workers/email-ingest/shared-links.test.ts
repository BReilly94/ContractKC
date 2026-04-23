import { describe, expect, it } from 'vitest';
import { detectSharedLinks } from './shared-links.js';

describe('detectSharedLinks', () => {
  it('detects OneDrive my-sharepoint links', () => {
    const body = 'Please find docs at https://technica-my.sharepoint.com/personal/a/Docs/Shared';
    const hits = detectSharedLinks(body);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.provider).toBe('OneDrive');
  });

  it('detects WeTransfer', () => {
    const body = 'Here: https://we.tl/t-abc123 and also https://wetransfer.com/downloads/xyz/abc';
    const hits = detectSharedLinks(body);
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.provider === 'WeTransfer')).toBe(true);
  });

  it('detects Google Drive and Dropbox', () => {
    const body =
      'Docs: https://drive.google.com/drive/folders/abc\n' +
      'Zip: https://www.dropbox.com/scl/fo/xyz?dl=0';
    const hits = detectSharedLinks(body);
    expect(hits.map((h) => h.provider).sort()).toEqual(['Dropbox', 'GoogleDrive']);
  });

  it('deduplicates repeated URLs', () => {
    const url = 'https://technica-my.sharepoint.com/Shared';
    const body = `See ${url} or again ${url}`;
    expect(detectSharedLinks(body)).toHaveLength(1);
  });

  it('returns empty on plain text', () => {
    expect(detectSharedLinks('no links here')).toHaveLength(0);
  });
});
