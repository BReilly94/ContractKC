import type { LLMClient } from '../../client/interface.js';
import { modelFor } from '../../routing.js';
import {
  contractSummaryPrompt,
  CONTRACT_SUMMARY_OWNER,
  CONTRACT_SUMMARY_PROMPT_VERSION,
} from './prompt.js';
import {
  ContractSummaryInputSchema,
  ContractSummaryOutputSchema,
  type ContractSummaryInputT,
  type ContractSummaryOutputT,
} from './schema.js';

export interface ContractSummaryResult {
  readonly output: ContractSummaryOutputT;
  /** Chunk ids referenced across all citations in the summary, for UI wiring. */
  readonly citedChunkIds: readonly string[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly promptVersion: string;
  readonly owner: string;
}

export async function runContractSummary(
  llm: LLMClient,
  input: ContractSummaryInputT,
): Promise<ContractSummaryResult> {
  const validated = ContractSummaryInputSchema.parse(input);
  const { system, user } = contractSummaryPrompt(validated);

  const resp = await llm.complete({
    capability: 'contract-summary',
    promptVersion: CONTRACT_SUMMARY_PROMPT_VERSION,
    model: modelFor('contract-summary'),
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0,
    maxOutputTokens: 4096,
    responseFormat: 'json',
  });

  const trimmed = resp.text.trim().replace(/^```(?:json)?\s*|```$/g, '');
  const parsed = JSON.parse(trimmed) as unknown;
  const output = ContractSummaryOutputSchema.parse(parsed);

  const citedChunkIds = collectCitations(output);

  return {
    output,
    citedChunkIds,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    latencyMs: resp.latencyMs,
    promptVersion: CONTRACT_SUMMARY_PROMPT_VERSION,
    owner: CONTRACT_SUMMARY_OWNER,
  };
}

function collectCitations(summary: ContractSummaryOutputT): readonly string[] {
  const all = new Set<string>();
  const addAll = (ids: readonly string[] | undefined): void => {
    if (!ids) return;
    for (const id of ids) if (id) all.add(id);
  };
  addAll(summary.contractValue.citations);
  addAll(summary.term.citations);
  for (const d of summary.keyDates) all.add(d.citation);
  addAll(summary.paymentTerms.citations);
  for (const n of summary.noticePeriods) all.add(n.citation);
  addAll(summary.liquidatedDamages.citations);
  for (const t of summary.terminationTriggers) all.add(t.citation);
  if (summary.governingLaw.citation) all.add(summary.governingLaw.citation);
  if (summary.disputeResolution.citation) all.add(summary.disputeResolution.citation);
  addAll(summary.insuranceAndBonding.citations);
  for (const f of summary.flaggedClauses) all.add(f.citation);
  return [...all];
}

export { ContractSummaryInputSchema, ContractSummaryOutputSchema };
export type { ContractSummaryInputT, ContractSummaryOutputT };
