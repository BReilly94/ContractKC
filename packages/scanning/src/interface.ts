/**
 * Malware scanning (security.md §6). Files that fail scanning are quarantined
 * and never ingested. The scanner is behind a queue so it can't block the
 * ingestion webhook path.
 */

export type ScanVerdict = 'Clean' | 'Infected' | 'Error';

export interface ScanResult {
  readonly verdict: ScanVerdict;
  readonly signatures: readonly string[];
  readonly scannerVersion?: string;
  readonly scannedAt: Date;
  readonly rawResponse?: string;
}

export interface MalwareScanner {
  readonly mode: 'local' | 'azure';
  scan(bytes: Buffer): Promise<ScanResult>;
  ping(): Promise<boolean>;
}
