import { NotSupportedInLocalError } from '@ckb/shared';
import { LocalOcrClient } from './local-impl.js';
import type { OcrClient } from './interface.js';

export interface OcrFactoryConfig {
  readonly mode: 'local' | 'azure';
}

export function createOcrClient(config: OcrFactoryConfig): OcrClient {
  if (config.mode === 'local') return new LocalOcrClient();
  throw new NotSupportedInLocalError(
    'Azure Document Intelligence OCR client not yet implemented',
  );
}
