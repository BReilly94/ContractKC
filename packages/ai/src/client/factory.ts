import { AnthropicLLMClient } from './anthropic.js';
import { MockLLMClient } from './mock.js';
import type { LLMClient } from './interface.js';

export interface LLMFactoryConfig {
  readonly apiKey: string | undefined;
  readonly zeroRetention: boolean;
  readonly forceMock?: boolean;
}

/**
 * Decision tree:
 *   - `forceMock=true` → MockLLMClient.
 *   - `apiKey` empty → MockLLMClient (enables test runs without spend).
 *   - otherwise → AnthropicLLMClient with zero-retention guard.
 *
 * Callers that need real behaviour in tests register handlers on the mock.
 */
export function createLLMClient(config: LLMFactoryConfig): LLMClient {
  if (config.forceMock === true || !config.apiKey) {
    return new MockLLMClient();
  }
  return new AnthropicLLMClient({
    apiKey: config.apiKey,
    zeroRetention: config.zeroRetention,
  });
}
