import type { LLMClient } from '../../client/interface.js';
import { modelFor } from '../../routing.js';
import {
  emailPrescreenPrompt,
  EMAIL_PRESCREEN_OWNER,
  EMAIL_PRESCREEN_PROMPT_VERSION,
} from './prompt.js';
import {
  EmailPrescreenInputSchema,
  EmailPrescreenOutputSchema,
  type EmailPrescreenInputT,
  type EmailPrescreenOutputT,
} from './schema.js';

export interface EmailPrescreenResult {
  readonly output: EmailPrescreenOutputT;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly promptVersion: string;
  readonly owner: string;
}

export async function runEmailPrescreen(
  llm: LLMClient,
  input: EmailPrescreenInputT,
): Promise<EmailPrescreenResult> {
  const validatedInput = EmailPrescreenInputSchema.parse(input);
  const { system, user } = emailPrescreenPrompt(validatedInput);

  const resp = await llm.complete({
    capability: 'email-prescreen',
    promptVersion: EMAIL_PRESCREEN_PROMPT_VERSION,
    model: modelFor('email-prescreen'),
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0,
    maxOutputTokens: 400,
    responseFormat: 'json',
  });

  const parsed = safeParseJson(resp.text);
  const output = EmailPrescreenOutputSchema.parse(parsed);

  return {
    output,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    latencyMs: resp.latencyMs,
    promptVersion: EMAIL_PRESCREEN_PROMPT_VERSION,
    owner: EMAIL_PRESCREEN_OWNER,
  };
}

function safeParseJson(text: string): unknown {
  // Models sometimes wrap JSON in ```json fences despite instructions; strip.
  const trimmed = text.trim().replace(/^```(?:json)?\s*|```$/g, '');
  return JSON.parse(trimmed) as unknown;
}

export { EmailPrescreenInputSchema, EmailPrescreenOutputSchema };
export type { EmailPrescreenInputT, EmailPrescreenOutputT };
