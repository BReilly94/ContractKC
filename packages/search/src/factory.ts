import { NotSupportedInLocalError } from '@ckb/shared';
import { OpenSearchClientImpl } from './opensearch-impl.js';
import type { SearchClient } from './interface.js';

export interface SearchFactoryConfig {
  readonly mode: 'local' | 'azure';
  readonly node: string;
  readonly embeddingDim: number;
  readonly indexPrefix?: string;
}

export function createSearchClient(config: SearchFactoryConfig): SearchClient {
  if (config.mode === 'local') {
    return new OpenSearchClientImpl({
      node: config.node,
      embeddingDim: config.embeddingDim,
      ...(config.indexPrefix !== undefined ? { indexPrefix: config.indexPrefix } : {}),
    });
  }
  throw new NotSupportedInLocalError(
    'Azure AI Search client not yet implemented; keep PROVIDER_MODE=local until cutover',
  );
}
