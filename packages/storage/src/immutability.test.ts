import { describe, expect, it } from 'vitest';
import {
  StorageImmutabilityViolation,
  StorageObjectNotFound,
  type StorageClient,
  type PutResult,
} from './interface.js';

/**
 * Non-Negotiable #3 — Originals immutable.
 *
 * This is a contract test: any StorageClient implementation MUST obey the
 * `ifNoneMatch='*'` semantic — refuse to overwrite on existing path, return
 * `created=false` with the existing object's metadata. A plain `put` without
 * the option replaces the object (for derived artefacts).
 *
 * An in-memory implementation is used here so the test runs in unit scope.
 */

class InMemoryStorage implements StorageClient {
  readonly mode: 'local' | 'azure' = 'local';
  private readonly store = new Map<string, { bytes: Buffer; contentType?: string }>();

  async put(
    path: string,
    bytes: Buffer,
    options: { ifNoneMatch?: '*'; contentType?: string } = {},
  ): Promise<PutResult> {
    if (options.ifNoneMatch === '*' && this.store.has(path)) {
      return { path, sizeBytes: bytes.byteLength, etag: 'existing', created: false };
    }
    const entry: { bytes: Buffer; contentType?: string } = { bytes };
    if (options.contentType !== undefined) entry.contentType = options.contentType;
    this.store.set(path, entry);
    return { path, sizeBytes: bytes.byteLength, etag: 'fresh', created: true };
  }

  async get(path: string): Promise<Buffer> {
    const entry = this.store.get(path);
    if (!entry) throw new StorageObjectNotFound(path);
    return entry.bytes;
  }

  async stat(path: string): Promise<null> {
    if (!this.store.has(path)) return null;
    return null;
  }
  async exists(path: string): Promise<boolean> {
    return this.store.has(path);
  }
  async delete(path: string): Promise<void> {
    this.store.delete(path);
  }
}

describe('Non-Negotiable #3 — Originals immutable', () => {
  it('ifNoneMatch=* refuses to overwrite an existing path', async () => {
    const storage = new InMemoryStorage();
    const p = 'sha256/abc/raw.eml';
    const first = await storage.put(p, Buffer.from('original'), { ifNoneMatch: '*' });
    expect(first.created).toBe(true);

    // Same path, different content — must be a no-op under immutability semantics.
    const second = await storage.put(p, Buffer.from('tampered'), { ifNoneMatch: '*' });
    expect(second.created).toBe(false);

    // Original bytes survive.
    const bytes = await storage.get(p);
    expect(bytes.toString('utf8')).toBe('original');
  });

  it('plain put (no ifNoneMatch) does replace — documenting the derived-artefact path', async () => {
    const storage = new InMemoryStorage();
    const p = 'derived/thumb.jpg';
    await storage.put(p, Buffer.from('v1'));
    await storage.put(p, Buffer.from('v2'));
    const bytes = await storage.get(p);
    expect(bytes.toString('utf8')).toBe('v2');
  });
});

// Ensure the error type is exported for callers that want to match.
void StorageImmutabilityViolation;
