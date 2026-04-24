import type { MockHandler } from '../../client/mock.js';
import type { DrawingDiffOutputT } from './schema.js';

/**
 * Deterministic mock for the drawing-diff capability.
 *
 * If the two OCR texts are identical the mock returns scopeImpact="None";
 * if "ventilation" appears in only one revision it returns "Major";
 * if lengths differ beyond a small tolerance it returns "Suspected";
 * otherwise "Minor".
 */
export const drawingDiffMock: MockHandler = (req) => {
  const user = req.messages[0]?.content ?? '';
  const priorMatch = user.match(/--- PRIOR REVISION \(OCR\) ---\n([\s\S]*?)\n\n--- NEW REVISION \(OCR\) ---/);
  const newMatch = user.match(/--- NEW REVISION \(OCR\) ---\n([\s\S]*?)\n\nCompare the two revisions/);
  const docMatch = user.match(/Drawing:\s*(.+)/);
  const documentName = docMatch?.[1]?.trim() ?? 'drawing';
  const prior = (priorMatch?.[1] ?? '').trim();
  const next = (newMatch?.[1] ?? '').trim();

  if (prior === next) {
    return JSON.stringify({
      scopeImpact: 'None',
      diffSummary: 'Text layers identical (mock).',
      changeRegions: [],
    } satisfies DrawingDiffOutputT);
  }

  const priorHasVent = /ventilation/i.test(prior);
  const newHasVent = /ventilation/i.test(next);
  if (priorHasVent !== newHasVent) {
    return JSON.stringify({
      scopeImpact: 'Major',
      diffSummary: 'Ventilation layout appears to have changed between revisions (mock heuristic).',
      changeRegions: [
        {
          description: 'Ventilation reference added or removed',
          priorExcerpt: prior.slice(0, 200),
          newExcerpt: next.slice(0, 200),
          citation: priorHasVent ? `prior:${documentName}` : `new:${documentName}`,
        },
      ],
    } satisfies DrawingDiffOutputT);
  }

  const lenDelta = Math.abs(prior.length - next.length);
  if (lenDelta > 80) {
    return JSON.stringify({
      scopeImpact: 'Suspected',
      diffSummary: 'Material textual difference detected between revisions; human review recommended (mock).',
      changeRegions: [
        {
          description: 'Textual change of non-trivial length',
          priorExcerpt: prior.slice(0, 160),
          newExcerpt: next.slice(0, 160),
          citation: `new:${documentName}`,
        },
      ],
    } satisfies DrawingDiffOutputT);
  }

  return JSON.stringify({
    scopeImpact: 'Minor',
    diffSummary: 'Small textual delta; likely cosmetic (mock).',
    changeRegions: [
      {
        description: 'Minor OCR-level difference',
        priorExcerpt: prior.slice(0, 100),
        newExcerpt: next.slice(0, 100),
        citation: `new:${documentName}`,
      },
    ],
  } satisfies DrawingDiffOutputT);
};
