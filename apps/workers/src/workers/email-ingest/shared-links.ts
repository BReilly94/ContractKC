/**
 * Detect shared-link content in email bodies (`email-ingestion.md` §7.9).
 * Phase 1 captures the URL and routes to manual-capture for non-tenant
 * providers. Auto-pull is Q-EI-4 (scope pending IT Security), so for now we
 * capture only.
 */

export type SharedLinkProvider =
  | 'OneDrive'
  | 'SharePoint'
  | 'WeTransfer'
  | 'Dropbox'
  | 'GoogleDrive'
  | 'Other';

export interface SharedLinkDetection {
  readonly provider: SharedLinkProvider;
  readonly url: string;
}

const PATTERNS: Array<{ provider: SharedLinkProvider; test: RegExp }> = [
  { provider: 'OneDrive', test: /https?:\/\/[^\s"'<>]+-my\.sharepoint\.com\/[^\s"'<>]+/gi },
  { provider: 'OneDrive', test: /https?:\/\/1drv\.ms\/[^\s"'<>]+/gi },
  { provider: 'SharePoint', test: /https?:\/\/[^\s"'<>]+\.sharepoint\.com\/[^\s"'<>]+/gi },
  { provider: 'WeTransfer', test: /https?:\/\/we\.tl\/[^\s"'<>]+/gi },
  { provider: 'WeTransfer', test: /https?:\/\/wetransfer\.com\/downloads\/[^\s"'<>]+/gi },
  { provider: 'Dropbox', test: /https?:\/\/(?:www\.)?dropbox\.com\/(?:s|scl)\/[^\s"'<>]+/gi },
  { provider: 'GoogleDrive', test: /https?:\/\/drive\.google\.com\/[^\s"'<>]+/gi },
];

export function detectSharedLinks(body: string): readonly SharedLinkDetection[] {
  const found: SharedLinkDetection[] = [];
  const seen = new Set<string>();
  for (const { provider, test } of PATTERNS) {
    for (const m of body.matchAll(test)) {
      const url = m[0];
      if (!seen.has(url)) {
        seen.add(url);
        found.push({ provider, url });
      }
    }
  }
  return found;
}
