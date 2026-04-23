/**
 * Tiered model routing (`.claude/rules/ai-layer.md` §4).
 *
 * Changing a route requires the regression harness to pass on both tiers and
 * a human reviewer (review-gates.md §2.4).
 */
import type { ModelTier } from './client/interface.js';

export type CapabilityName =
  | 'email-prescreen'
  | 'deadline-extract'
  | 'clause-extract'
  | 'qa-synth'
  | 'contract-summary'
  | 'flag-generate' // Phase 2
  | 'draft' // Phase 2
  | 'devils-advocate'; // Phase 3

export const CAPABILITY_ROUTING: Record<CapabilityName, ModelTier> = {
  // Sonnet — routine retrieval, extraction, classification.
  'email-prescreen': 'sonnet',
  'deadline-extract': 'sonnet',
  'clause-extract': 'sonnet',
  'qa-synth': 'sonnet',
  'flag-generate': 'sonnet',
  // Opus — drafting, complex synthesis.
  'contract-summary': 'opus',
  draft: 'opus',
  'devils-advocate': 'opus',
};

export function modelFor(capability: CapabilityName): ModelTier {
  return CAPABILITY_ROUTING[capability];
}
