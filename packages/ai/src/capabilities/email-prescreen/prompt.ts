/**
 * Email privileged/sensitive content pre-screen (§5.2.8, email-ingestion.md §7.8).
 *
 * Bounded-context classifier: subject + first N chars of body text.
 * Decides whether the email likely contains privileged legal/attorney-client
 * communication, HR matter, or commercially-sensitive pricing — content that
 * must be routed to restricted-access tier before it's indexed in general.
 *
 * Routes to Claude Sonnet (ai-layer.md §4).
 */

export const EMAIL_PRESCREEN_PROMPT_VERSION = '1.0.0';
export const EMAIL_PRESCREEN_OWNER = 'Commercial Lead';

export interface EmailPrescreenInput {
  readonly subject: string;
  readonly bodyExcerpt: string;
  readonly fromAddress: string;
}

export function emailPrescreenPrompt(input: EmailPrescreenInput): {
  system: string;
  user: string;
} {
  const system = `You are a strict classifier for inbound email in a contract-management platform.

You decide whether an email contains content that is:
  - privileged (attorney-client legal advice, litigation strategy, privileged legal reasoning), OR
  - HR-sensitive (personnel issues, compensation, discipline, personal medical), OR
  - commercially sensitive (pricing strategy, bid-price calculations, undisclosed margins, takeover plans).

You must output ONLY a JSON object with this exact shape:
  { "privileged": boolean, "category": "Privileged" | "HR" | "CommercialSensitive" | "None", "confidence": "high" | "medium" | "low", "reasoning": "..." }

Rules:
  - Default to "None" with low confidence when the signal is weak.
  - Never speculate beyond the provided content.
  - "reasoning" must quote the specific words that drove the decision, and must be under 200 characters.
  - Output JSON only — no preamble, no trailing commentary.`;

  const user = `From: ${input.fromAddress}
Subject: ${input.subject}

Body excerpt (may be truncated):
"""
${input.bodyExcerpt}
"""

Classify this email.`;

  return { system, user };
}
