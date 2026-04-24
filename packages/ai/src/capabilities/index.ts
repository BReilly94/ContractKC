export {
  runEmailPrescreen,
  type EmailPrescreenInputT,
  type EmailPrescreenOutputT,
} from './email-prescreen/index.js';
export { emailPrescreenMock } from './email-prescreen/mock.js';

export {
  runContractSummary,
  type ContractSummaryInputT,
  type ContractSummaryOutputT,
} from './contract-summary/index.js';
export { contractSummaryMock } from './contract-summary/mock.js';

export {
  runDeadlineExtract,
  type DeadlineExtractInputT,
  type DeadlineExtractOutputT,
  type ObligationT,
} from './deadline-extract/index.js';
export { deadlineExtractMock } from './deadline-extract/mock.js';

export {
  runClauseExtract,
  type ClauseExtractInputT,
  type ClauseExtractOutputT,
  type ExtractedClauseT,
} from './clause-extract/index.js';
export { clauseExtractMock } from './clause-extract/mock.js';

export {
  runQaSynth,
  type QaSynthInputT,
} from './qa-synth/index.js';
export { qaSynthMock } from './qa-synth/mock.js';

// Slice AA — Drawing Comparison (§6.17)
export {
  runDrawingDiff,
  type DrawingDiffInputT,
  type DrawingDiffOutputT,
  type DrawingChangeRegionT,
} from './drawing-diff/index.js';
export { drawingDiffMock } from './drawing-diff/mock.js';

// Slice BB — Meeting Minutes Ingestion (§6.19)
export {
  runMinutesExtract,
  type MinutesExtractInputT,
  type MinutesExtractOutputT,
  type ActionItemT,
} from './minutes-extract/index.js';
export { minutesExtractMock } from './minutes-extract/mock.js';

// Slice GG — Proactive AI Flagging (§6.15, §7.10)
export {
  runProactiveFlagFirstPass,
  runProactiveFlagDeepReview,
  type ProactiveFlagFirstPassInputT,
  type ProactiveFlagFirstPassOutputT,
  type ProactiveFlagDeepReviewInputT,
  type ProactiveFlagDeepReviewOutputT,
} from './proactive-flag/index.js';
export {
  proactiveFlagFirstPassMock,
  proactiveFlagDeepReviewMock,
} from './proactive-flag/mock.js';
