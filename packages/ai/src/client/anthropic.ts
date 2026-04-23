import Anthropic from '@anthropic-ai/sdk';
import {
  LLMZeroRetentionRequired,
  type LLMClient,
  type LLMCompletionRequest,
  type LLMCompletionResponse,
  type ModelTier,
} from './interface.js';

// Pinned model IDs. These land in logs so we can correlate behaviour changes
// to provider updates. Update via code review, not ad-hoc.
const MODEL_IDS: Record<ModelTier, string> = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
  haiku: 'claude-haiku-4-5-20251001',
};

export interface AnthropicClientConfig {
  readonly apiKey: string;
  readonly zeroRetention: boolean;
  readonly baseUrl?: string;
}

export class AnthropicLLMClient implements LLMClient {
  readonly mode: 'real' | 'mock' = 'real';
  private readonly client: Anthropic;

  constructor(private readonly config: AnthropicClientConfig) {
    if (!config.zeroRetention) {
      throw new LLMZeroRetentionRequired();
    }
    this.client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl !== undefined ? { baseURL: config.baseUrl } : {}),
      // ASSUMPTION: zero-retention is set at the org level via Anthropic console for
      // this API key. No per-request header currently toggles it. The guard above
      // keeps the invariant visible and fail-closed if config is ever wrong.
    });
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const model = MODEL_IDS[request.model];
    const start = Date.now();
    const resp = await this.client.messages.create({
      model,
      max_tokens: request.maxOutputTokens ?? 2048,
      temperature: request.temperature ?? 0.0,
      ...(request.system !== undefined ? { system: request.system } : {}),
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(request.stopSequences && request.stopSequences.length > 0
        ? { stop_sequences: [...request.stopSequences] }
        : {}),
    });
    const latencyMs = Date.now() - start;

    const text = resp.content
      .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const stopReasonMap: Record<string, LLMCompletionResponse['stopReason']> = {
      end_turn: 'end_turn',
      max_tokens: 'max_tokens',
      stop_sequence: 'stop_sequence',
    };

    return {
      text,
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      latencyMs,
      modelActual: model,
      stopReason: stopReasonMap[resp.stop_reason ?? ''] ?? 'other',
      capability: request.capability,
      promptVersion: request.promptVersion,
    };
  }

  async health(): Promise<boolean> {
    try {
      // A 1-token ping is the cheapest health check.
      await this.client.messages.create({
        model: MODEL_IDS.haiku,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
