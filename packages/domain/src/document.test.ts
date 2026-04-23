import { describe, expect, it } from 'vitest';
import { isRetrievable, isRevisable, DOCUMENT_CATEGORIES } from './document.js';

describe('document domain', () => {
  it('isRevisable is true for drawings, specs, amendments', () => {
    expect(isRevisable('Drawing')).toBe(true);
    expect(isRevisable('Specification')).toBe(true);
    expect(isRevisable('Amendment')).toBe(true);
    expect(isRevisable('MasterAgreement')).toBe(false);
    expect(isRevisable('Correspondence')).toBe(false);
  });

  it('isRetrievable is false until malware scan passes (security.md §6)', () => {
    expect(isRetrievable({ malwareScanStatus: 'Pending' })).toBe(false);
    expect(isRetrievable({ malwareScanStatus: 'Quarantined' })).toBe(false);
    expect(isRetrievable({ malwareScanStatus: 'Clean' })).toBe(true);
  });

  it('category list covers every SOW §5.1 category', () => {
    expect(DOCUMENT_CATEGORIES).toContain('MasterAgreement');
    expect(DOCUMENT_CATEGORIES).toContain('Bond');
    expect(DOCUMENT_CATEGORIES).toContain('Other');
    expect(DOCUMENT_CATEGORIES).toHaveLength(12);
  });
});
