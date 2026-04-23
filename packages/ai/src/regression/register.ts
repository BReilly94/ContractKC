import type { CapabilityRunner } from './runner.js';

/**
 * Each capability registers a runner here as it lands. Phase 0 ships empty —
 * adding a runner is a one-import change at capability landing time.
 *
 * `opts.mock=true` builds runners that use `MockLLMClient`; set to false
 * (or pass a real `apiKey`) to hit the real provider.
 */
export interface RegisterOpts {
  readonly mock: boolean;
}

export function runnersFor(_opts: RegisterOpts): Readonly<Record<string, CapabilityRunner>> {
  return {};
}
