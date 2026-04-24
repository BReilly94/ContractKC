import type { LLMClient } from '../../client/interface.js';
import { modelFor } from '../../routing.js';
import {
  drawingDiffPrompt,
  DRAWING_DIFF_OWNER,
  DRAWING_DIFF_PROMPT_VERSION,
} from './prompt.js';
import {
  DrawingDiffInputSchema,
  DrawingDiffOutputSchema,
  type DrawingDiffInputT,
  type DrawingDiffOutputT,
} from './schema.js';

export interface DrawingDiffResult {
  readonly output: DrawingDiffOutputT;
  readonly citedChunkIds: readonly string[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly promptVersion: string;
  readonly owner: string;
}

/**
 * Run the drawing-diff capability. The capability's citation space is a
 * closed set (prior:<doc> / new:<doc>); retrieval is not involved because
 * the comparison is between two specific OCR'd text layers. The worker
 * is responsible for resolving the citation back to the version id when
 * rendering change regions.
 */
export async function runDrawingDiff(
  llm: LLMClient,
  input: DrawingDiffInputT,
): Promise<DrawingDiffResult> {
  const validated = DrawingDiffInputSchema.parse(input);
  const { system, user } = drawingDiffPrompt(validated);

  const resp = await llm.complete({
    capability: 'drawing-diff',
    promptVersion: DRAWING_DIFF_PROMPT_VERSION,
    model: modelFor('drawing-diff'),
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0,
    maxOutputTokens: 3072,
    responseFormat: 'json',
  });

  const trimmed = resp.text.trim().replace(/^```(?:json)?\s*|```$/g, '');
  const parsed = JSON.parse(trimmed) as unknown;
  const output = DrawingDiffOutputSchema.parse(parsed);

  const citedChunkIds = [
    ...new Set(output.changeRegions.map((r) => r.citation).filter((c) => c.length > 0)),
  ];

  return {
    output,
    citedChunkIds,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    latencyMs: resp.latencyMs,
    promptVersion: DRAWING_DIFF_PROMPT_VERSION,
    owner: DRAWING_DIFF_OWNER,
  };
}

export { DrawingDiffInputSchema, DrawingDiffOutputSchema };
export type { DrawingDiffInputT, DrawingDiffOutputT, DrawingChangeRegionT } from './schema.js';
