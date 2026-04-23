/**
 * Blob storage abstraction.
 *
 * Non-Negotiable #3 lands on this interface: originals are immutable. `put`
 * with `ifNoneMatch: '*'` refuses to overwrite an existing path and is the
 * required write mode for anything content-addressed (raw .eml, raw uploads,
 * OCR text, parsed HTML body). Derived artefacts that legitimately get rewritten
 * (e.g., thumbnails during generation) can use plain `put`.
 */

export type ContentType = string;

export interface PutOptions {
  readonly contentType?: ContentType;
  /** If set to '*', fail if the path already exists. */
  readonly ifNoneMatch?: '*';
  readonly metadata?: Record<string, string>;
}

export interface ObjectStat {
  readonly path: string;
  readonly sizeBytes: number;
  readonly contentType?: ContentType;
  readonly createdAt: Date;
  readonly etag: string;
  readonly metadata: Record<string, string>;
}

export interface PutResult {
  readonly path: string;
  readonly sizeBytes: number;
  readonly etag: string;
  /** True if the object was newly written; false if the path existed and ifNoneMatch='*' made the call a no-op. */
  readonly created: boolean;
}

export interface StorageClient {
  readonly mode: 'local' | 'azure';
  put(path: string, bytes: Buffer, options?: PutOptions): Promise<PutResult>;
  get(path: string): Promise<Buffer>;
  stat(path: string): Promise<ObjectStat | null>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
}

export class StorageImmutabilityViolation extends Error {
  constructor(readonly path: string) {
    super(`Refusing to overwrite immutable object at ${path} (Non-Negotiable #3)`);
    this.name = 'StorageImmutabilityViolation';
  }
}

export class StorageObjectNotFound extends Error {
  constructor(readonly path: string) {
    super(`Storage object not found: ${path}`);
    this.name = 'StorageObjectNotFound';
  }
}
