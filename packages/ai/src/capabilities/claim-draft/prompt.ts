/**
 * Claim drafting capability (SOW §3.17, §6.3.5).
 *
 * Routes to Claude Opus (see `packages/ai/src/routing.ts`) per §7.3:
 * complex synthesis + citation-heavy drafting.
 */

export const version = '1.0.0';
export const owner = 'commercial-claims-lead'; // per §11 / Q-17

export interface ClaimDraftContext {
  readonly contractName: string;
  readonly contractValueCents: number | null;
  readonly contractCurrency: string;
  readonly triggerEventSummary: string;
  readonly retrievedChunks: readonly {
    readonly chunkId: string;
    readonly artifactType: string;
    readonly artifactId: string;
    readonly citationRef: string; // human-readable, e.g., "Clause 14.2", "Email 2026-03-12 from client"
    readonly text: string;
  }[];
}

/**
 * System-style preamble. Heavy emphasis on citation discipline and
 * refusal-on-insufficient-context per NN #1 and AI layer rules §5-§6.
 */
export function buildClaimDraftPrompt(ctx: ClaimDraftContext): string {
  const chunks = ctx.retrievedChunks
    .map(
      (c) =>
        `<CHUNK id="${c.chunkId}" ref="${c.citationRef}" type="${c.artifactType}:${c.artifactId}">\n${c.text}\n</CHUNK>`,
    )
    .join('\n\n');

  return `You are drafting a contractual claim on behalf of Technica Mining.
Contract: ${ctx.contractName} (value ${ctx.contractCurrency} ${
    ctx.contractValueCents === null ? 'unspecified' : (ctx.contractValueCents / 100).toFixed(2)
  }).
Trigger event: ${ctx.triggerEventSummary}

HARD RULES:
1. Every factual assertion in your draft must cite a chunk from the provided evidence. Use the chunk id in square brackets, e.g., "[chunk_abc123]".
2. If the evidence is insufficient to support a necessary element of the claim (notice, quantum, time impact, causation), STOP and return a structured refusal noting which element cannot be supported and what evidence would be needed. Do NOT fabricate or extrapolate.
3. Signal overall confidence as one of: high, medium, low, insufficient_context.
4. Never assert a legal conclusion (e.g., "this is a material breach"). You may describe the facts and cite the contractual clauses; the human Commercial/Claims Lead decides legal characterisation.
5. Use factual, evidentiary language — dates, amounts, clause numbers. Avoid rhetorical or adversarial tone.
6. Structure as: (a) Summary; (b) Contractual basis (cite clauses); (c) Chronology of events (cite emails/documents/diary entries); (d) Time impact (cite schedule/diary evidence); (e) Cost/quantum (cite quotes/invoices/variation pricing); (f) Relief sought.

EVIDENCE CORPUS:
${chunks || '(no evidence retrieved — if empty, produce an insufficient_context refusal)'}

Output a JSON object matching the schema. The narrative field is free prose with [chunk_id] citations inline. The assertions array lists each verifiable assertion with the cited chunk id.`;
}
