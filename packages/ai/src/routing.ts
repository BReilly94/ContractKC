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
  | 'drawing-diff' // Phase 2 — §6.17
  | 'minutes-extract' // Phase 2 — §6.19
  | 'proactive-flag-first-pass' // Phase 2 — §6.15 / §7.10
  | 'proactive-flag-deep-review' // Phase 2 — §6.15 / §7.10
  | 'flag-generate' // Phase 2 (legacy alias, retained for callers)
  | 'draft' // Phase 2
  | 'devils-advocate'; // Phase 3

export const CAPABILITY_ROUTING: Record<CapabilityName, ModelTier> = {
  // Sonnet — routine retrieval, extraction, classification.
  'email-prescreen': 'sonnet',
  'deadline-extract': 'sonnet',
  'clause-extract': 'sonnet',
  'qa-synth': 'sonnet',
  'flag-generate': 'sonnet',
  'drawing-diff': 'sonnet',
  'minutes-extract': 'sonnet',
  'proactive-flag-first-pass': 'sonnet',
  // Opus — drafting, complex synthesis, devil's advocate review.
  'contract-summary': 'opus',
  'proactive-flag-deep-review': 'opus',
  draft: 'opus',
  'devils-advocate': 'opus',
};

export function modelFor(capability: CapabilityName): ModelTier {
  return CAPABILITY_ROUTING[capability];
}
