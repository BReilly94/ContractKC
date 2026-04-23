import { NotSupportedInLocalError } from '@ckb/shared';
import { ClamAvScanner } from './clamav-impl.js';
import type { MalwareScanner } from './interface.js';

export interface ScannerFactoryConfig {
  readonly mode: 'local' | 'azure';
  readonly clamavHost?: string;
  readonly clamavPort?: number;
}

export function createMalwareScanner(config: ScannerFactoryConfig): MalwareScanner {
  if (config.mode === 'local') {
    return new ClamAvScanner(config.clamavHost ?? 'localhost', config.clamavPort ?? 3310);
  }
  // ASSUMPTION: Azure-side scanner selection is Q-EI-2; Defender for Storage is the
  // most likely target but IT Security input is pending. Stubbed fail-closed.
  throw new NotSupportedInLocalError(
    'Azure malware scanner not yet implemented (Q-EI-2 pending IT Security input)',
  );
}
