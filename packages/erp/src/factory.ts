import type { ErpClient, ErpSourceSystem } from './interface.js';
import { ManualFallbackClient } from './manual-fallback.js';

export interface ErpFactoryConfig {
  readonly sourceSystem?: ErpSourceSystem | undefined;
  /** Optional host/port/creds for real implementations once wired. */
  readonly endpointUrl?: string | undefined;
  readonly apiKey?: string | undefined;
}

/**
 * Factory for the ERP client. The current default is `ManualFallbackClient`
 * because no production ERP is wired in yet (see SOW §6.14 item 4 —
 * "build the manual path first, integrate second"). Real clients register
 * here as they land (SAP, Dynamics, Viewpoint, JDE).
 */
export function createErpClient(config: ErpFactoryConfig = {}): ErpClient {
  const requested = config.sourceSystem ?? 'Manual';
  if (requested === 'Manual') return new ManualFallbackClient();
  // Real clients not yet wired. Fail back to manual so the stack keeps
  // working rather than crashing at start-up; the operator sees it via
  // snapshot source_system == 'Manual'. Discovery item: Q-ERP-1.
  return new ManualFallbackClient();
}
