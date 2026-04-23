import type {
  LLMClient,
  LLMCompletionRequest,
  LLMCompletionResponse,
} from './interface.js';

/**
 * Deterministic mock LLM client for tests, local dev without an API key,
 * and the regression harness's "dry-run" mode.
 *
 * Per-capability fixtures live under `packages/ai/src/mock-fixtures/`. When a
 * capability runs through this client, we pick a fixture keyed by capability
 * + prompt version. If no fixture matches, we fall back to the handler
 * registered by the caller via `register()`.
 */
export type MockHandler = (req: LLMCompletionRequest) => string | Promise<string>;

export class MockLLMClient implements LLMClient {
  readonly mode: 'real' | 'mock' = 'mock';
  private readonly handlers = new Map<string, MockHandler>();

  register(capability: string, handler: MockHandler): void {
    this.handlers.set(capability, handler);
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const handler = this.handlers.get(request.capability);
    if (!handler) {
      throw new Error(
        `MockLLMClient has no handler for capability "${request.capability}". ` +
          `Register one before calling, or use the real AnthropicLLMClient.`,
      );
    }
    const start = Date.now();
    const text = await handler(request);
    return {
      text,
      inputTokens: countApproxTokens(request.messages.map((m) => m.content).join(' ')),
      outputTokens: countApproxTokens(text),
      latencyMs: Date.now() - start,
      modelActual: `mock-${request.model}`,
      stopReason: 'end_turn',
      capability: request.capability,
      promptVersion: request.promptVersion,
    };
  }

  async health(): Promise<boolean> {
    return true;
  }
}

function countApproxTokens(text: string): number {
  // Rough approximation: 1 token per ~4 chars. Good enough for cost tests.
  return Math.ceil(text.length / 4);
}
