import { MockLLMClient, createLLMClient, type LLMClient } from '../client/index.js';
import {
  clauseExtractMock,
  contractSummaryMock,
  deadlineExtractMock,
  emailPrescreenMock,
  qaSynthMock,
  runClauseExtract,
  runContractSummary,
  runDeadlineExtract,
  runEmailPrescreen,
  runQaSynth,
} from '../capabilities/index.js';
import type { CapabilityRunner } from './runner.js';

/**
 * Registry of regression runners. `opts.mock=true` builds runners that use
 * `MockLLMClient` with each capability's deterministic mock handler —
 * sufficient to exercise the end-to-end plumbing. For real-provider runs
 * pass an api key through env.
 */
export interface RegisterOpts {
  readonly mock: boolean;
  readonly apiKey?: string;
}

export function runnersFor(opts: RegisterOpts): Readonly<Record<string, CapabilityRunner>> {
  let llm: LLMClient;
  if (opts.mock || !opts.apiKey) {
    const mock = new MockLLMClient();
    mock.register('email-prescreen', emailPrescreenMock);
    mock.register('contract-summary', contractSummaryMock);
    mock.register('deadline-extract', deadlineExtractMock);
    mock.register('clause-extract', clauseExtractMock);
    mock.register('qa-synth', qaSynthMock);
    llm = mock;
  } else {
    llm = createLLMClient({
      apiKey: opts.apiKey,
      zeroRetention: true,
    });
  }

  return {
    'email-prescreen': {
      capability: 'email-prescreen',
      async run(input: unknown) {
        const result = await runEmailPrescreen(llm, input as Parameters<typeof runEmailPrescreen>[1]);
        return {
          // expose `verdict` alias for the expectBoolean check in the harness
          output: { ...result.output, verdict: result.output.privileged },
          text: JSON.stringify(result.output),
          citedChunkIds: [],
        };
      },
    },
    'contract-summary': {
      capability: 'contract-summary',
      async run(input: unknown) {
        const result = await runContractSummary(llm, input as Parameters<typeof runContractSummary>[1]);
        return {
          output: result.output,
          text: JSON.stringify(result.output),
          citedChunkIds: [...result.citedChunkIds],
        };
      },
    },
    'deadline-extract': {
      capability: 'deadline-extract',
      async run(input: unknown) {
        const result = await runDeadlineExtract(llm, input as Parameters<typeof runDeadlineExtract>[1]);
        return {
          output: result.output,
          text: JSON.stringify(result.output),
          citedChunkIds: [...result.citedChunkIds],
        };
      },
    },
    'clause-extract': {
      capability: 'clause-extract',
      async run(input: unknown) {
        const result = await runClauseExtract(llm, input as Parameters<typeof runClauseExtract>[1]);
        return {
          output: result.output,
          text: JSON.stringify(result.output),
          citedChunkIds: [],
        };
      },
    },
    'qa-synth': {
      capability: 'qa-synth',
      async run(input: unknown) {
        const result = await runQaSynth(llm, input as Parameters<typeof runQaSynth>[1]);
        return {
          output: { verdict: !result.blocked, answer: result.answer },
          text: result.answer,
          citedChunkIds: [...result.citedChunkIds],
        };
      },
    },
  };
}
