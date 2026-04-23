/**
 * The single LLM boundary for the whole platform (`.claude/rules/ai-layer.md` §3).
 *
 * Every provider call goes through `LLMClient.complete`. Zero-retention is
 * verified at construction; no business code elsewhere imports the Anthropic SDK.
 */

export type ModelTier = 'sonnet' | 'opus' | 'haiku';

export interface LLMMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface LLMCompletionRequest {
  readonly model: ModelTier;
  readonly system?: string;
  readonly messages: readonly LLMMessage[];
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  /** Capability identifier for logging / routing traceability. */
  readonly capability: string;
  /** Prompt template version for regression traceability. */
  readonly promptVersion: string;
  /** Optional stop sequences. */
  readonly stopSequences?: readonly string[];
  /** Force the model to respond with JSON conforming to a schema hint (provider-native if available). */
  readonly responseFormat?: 'json' | 'text';
}

export interface LLMCompletionResponse {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly modelActual: string;
  readonly stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'other';
  readonly capability: string;
  readonly promptVersion: string;
}

export interface LLMClient {
  readonly mode: 'real' | 'mock';
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
  /** Ping: does the client have a usable upstream? */
  health(): Promise<boolean>;
}

export class LLMZeroRetentionRequired extends Error {
  constructor() {
    super(
      'LLMClient requires ANTHROPIC_ZERO_RETENTION=true to construct (`.claude/rules/ai-layer.md` §8)',
    );
    this.name = 'LLMZeroRetentionRequired';
  }
}
