#!/usr/bin/env node
/**
 * CLI entry point for the regression harness. Invoked by CI and manually via
 * `pnpm --filter @ckb/ai regression`.
 *
 * Phase 0 scope: runs the harness against the (currently empty) queries.jsonl
 * and exits non-zero if the pass rate falls below `baseline.json.minPassRate`.
 * Capabilities register their runners in `packages/ai/src/regression/register.ts`
 * as they land.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadQueries, runRegression } from './runner.js';
import { runnersFor } from './register.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUERIES_PATH = join(HERE, 'queries.jsonl');
const BASELINE_PATH = join(HERE, 'baseline.json');

async function main(): Promise<void> {
  const queries = await loadQueries(QUERIES_PATH);
  const baseline = JSON.parse(await readFile(resolve(BASELINE_PATH), 'utf8')) as {
    minPassRate: number;
  };
  const report = await runRegression(queries, runnersFor({ mock: true }));

  // eslint-disable-next-line no-console
  console.warn(
    `[regression] ${report.passed}/${report.total} passed (rate=${report.passRate.toFixed(3)})`,
  );
  for (const r of report.results) {
    if (!r.passed) {
      // eslint-disable-next-line no-console
      console.error(`  FAIL ${r.queryId} (${r.capability}): ${r.failures.join('; ')}`);
    }
  }

  if (report.passRate < baseline.minPassRate) {
    // eslint-disable-next-line no-console
    console.error(
      `[regression] pass rate ${report.passRate.toFixed(3)} below baseline ${baseline.minPassRate}`,
    );
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(2);
});
