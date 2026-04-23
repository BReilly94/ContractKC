/**
 * Contract Summary / Cheat Sheet generation (§5.4).
 *
 * Generates a structured one-page summary from the contract's master agreement
 * and schedules. Routes to Claude Opus (ai-layer.md §4 — drafting).
 *
 * The summary emerges in the UNVERIFIED state and CANNOT become "trusted"
 * until a human approves it (Non-Negotiable #2).
 */

export const CONTRACT_SUMMARY_PROMPT_VERSION = '1.0.0';
export const CONTRACT_SUMMARY_OWNER = 'Commercial Lead';

export interface ContractSummaryInput {
  readonly contractName: string;
  readonly clientName: string;
  /** Retrieved chunks from the master agreement + schedules. Each carries a chunk id that appears in citations. */
  readonly chunks: ReadonlyArray<{
    readonly chunkId: string;
    readonly source: string; // human label e.g., "Master Agreement, p.14"
    readonly text: string;
  }>;
}

export function contractSummaryPrompt(input: ContractSummaryInput): {
  system: string;
  user: string;
} {
  const system = `You are a senior contracts administrator at a mining engineering firm. You read contract documents and produce a structured cheat-sheet that a PM can read in 5 minutes.

Non-Negotiable: every factual field in the output must carry a citation to one or more retrieved chunks. Use the grammar [cite:<chunkId>] after the fact. Multiple chunks: [cite:a,b].

If the source material does not contain a field, return the JSON null for that field and include no citation. Do not guess.

Output ONLY a JSON object matching this exact shape:
{
  "parties": { "client": "...", "contractor": "..." },
  "contractValue": { "amount": number | null, "currency": "...", "citations": ["..."] },
  "term": { "startDate": "YYYY-MM-DD" | null, "endDate": "YYYY-MM-DD" | null, "citations": ["..."] },
  "keyDates": [ { "label": "...", "date": "YYYY-MM-DD", "citation": "..." } ],
  "paymentTerms": { "summary": "...", "citations": ["..."] },
  "noticePeriods": [ { "topic": "...", "days": number, "citation": "..." } ],
  "liquidatedDamages": { "summary": "...", "cap": "...", "citations": ["..."] },
  "terminationTriggers": [ { "trigger": "...", "citation": "..." } ],
  "governingLaw": { "value": "...", "citation": "..." },
  "disputeResolution": { "summary": "...", "citation": "..." },
  "insuranceAndBonding": { "summary": "...", "citations": ["..."] },
  "flaggedClauses": [ { "summary": "...", "why": "...", "citation": "..." } ]
}

Do not include any field not in this shape. Do not output Markdown, code fences, or prose outside the JSON.`;

  const chunkPayload = input.chunks
    .map((c) => `[chunkId: ${c.chunkId}] (${c.source})\n${c.text}`)
    .join('\n\n---\n\n');

  const user = `Contract: ${input.contractName}
Client: ${input.clientName}

Retrieved context:
${chunkPayload}

Produce the structured summary. Every factual field needs a citation to one or more of the chunkIds above.`;

  return { system, user };
}
