/**
 * Regression harness runner (`.claude/rules/ai-layer.md` §7).
 *
 * Each capability owns a `queries.jsonl` file of representative queries with
 * known-good answers and required citation targets. The runner executes each
 * query through the capability, scores it, and compares against the baseline.
 *
 * PRs that drop accuracy below the baseline are blocked.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface RegressionQuery {
  readonly id: string;
  readonly capability: string;
  readonly input: unknown;
  /** Expected substrings that must appear in the structured output (case-insensitive). */
  readonly expectSubstrings?: readonly string[];
  /** Expected citation targets — chunk IDs that must appear in the cited set. */
  readonly expectCitations?: readonly string[];
  /** For boolean outputs, the expected verdict. */
  readonly expectBoolean?: boolean;
}

export interface CapabilityRunner {
  readonly capability: string;
  run(input: unknown): Promise<{ output: unknown; text: string; citedChunkIds: readonly string[] }>;
}

export interface QueryResult {
  readonly queryId: string;
  readonly capability: string;
  readonly passed: boolean;
  readonly failures: readonly string[];
  readonly durationMs: number;
}

export interface RegressionReport {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly results: readonly QueryResult[];
  readonly passRate: number;
}

export async function loadQueries(path: string): Promise<RegressionQuery[]> {
  const raw = await readFile(resolve(path), 'utf8');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RegressionQuery);
}

export async function runRegression(
  queries: readonly RegressionQuery[],
  runners: Readonly<Record<string, CapabilityRunner>>,
): Promise<RegressionReport> {
  const results: QueryResult[] = [];
  for (const q of queries) {
    const runner = runners[q.capability];
    const start = Date.now();
    if (!runner) {
      results.push({
        queryId: q.id,
        capability: q.capability,
        passed: false,
        failures: [`No runner registered for capability "${q.capability}"`],
        durationMs: Date.now() - start,
      });
      continue;
    }
    const failures: string[] = [];
    try {
      const { output, text, citedChunkIds } = await runner.run(q.input);
      if (q.expectSubstrings) {
        const combined = (typeof output === 'string' ? output : JSON.stringify(output)) + ' ' + text;
        for (const s of q.expectSubstrings) {
          if (!combined.toLowerCase().includes(s.toLowerCase())) {
            failures.push(`Expected substring not found: "${s}"`);
          }
        }
      }
      if (q.expectCitations) {
        const set = new Set(citedChunkIds);
        for (const c of q.expectCitations) {
          if (!set.has(c)) failures.push(`Expected citation to chunk "${c}" missing`);
        }
      }
      if (q.expectBoolean !== undefined) {
        if (typeof output !== 'object' || output === null || !('verdict' in output)) {
          failures.push('Expected boolean output not present');
        } else if ((output as { verdict: unknown }).verdict !== q.expectBoolean) {
          failures.push(
            `Verdict mismatch: expected ${q.expectBoolean}, got ${String((output as { verdict: unknown }).verdict)}`,
          );
        }
      }
    } catch (err) {
      failures.push(`Runner threw: ${(err as Error).message}`);
    }
    results.push({
      queryId: q.id,
      capability: q.capability,
      passed: failures.length === 0,
      failures,
      durationMs: Date.now() - start,
    });
  }
  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
    passRate: results.length === 0 ? 1 : passed / results.length,
  };
}
