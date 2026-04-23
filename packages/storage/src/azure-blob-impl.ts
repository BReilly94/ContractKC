import {
  BlobServiceClient,
  type ContainerClient,
  RestError,
  type BlockBlobUploadOptions,
} from '@azure/storage-blob';
import {
  StorageImmutabilityViolation,
  StorageObjectNotFound,
  type ObjectStat,
  type PutOptions,
  type PutResult,
  type StorageClient,
} from './interface.js';

/**
 * Azure Blob Storage implementation. Used against both Azurite (local) and
 * Azure Blob (prod) — same SDK, different connection string. `mode` is labeled
 * for observability; behaviour is identical.
 */
export class AzureBlobStorageClient implements StorageClient {
  private readonly service: BlobServiceClient;
  private container!: ContainerClient;
  private initialized = false;

  constructor(
    connectionString: string,
    private readonly containerName: string,
    readonly mode: 'local' | 'azure' = 'local',
  ) {
    this.service = BlobServiceClient.fromConnectionString(connectionString);
  }

  private async ensureContainer(): Promise<ContainerClient> {
    if (this.initialized) return this.container;
    this.container = this.service.getContainerClient(this.containerName);
    await this.container.createIfNotExists();
    this.initialized = true;
    return this.container;
  }

  async put(path: string, bytes: Buffer, options: PutOptions = {}): Promise<PutResult> {
    const container = await this.ensureContainer();
    const blob = container.getBlockBlobClient(path);

    const uploadOptions: BlockBlobUploadOptions = {};
    if (options.contentType !== undefined) {
      uploadOptions.blobHTTPHeaders = { blobContentType: options.contentType };
    }
    if (options.metadata !== undefined) {
      uploadOptions.metadata = options.metadata;
    }

    if (options.ifNoneMatch === '*') {
      uploadOptions.conditions = { ifNoneMatch: '*' };
      try {
        const resp = await blob.upload(bytes, bytes.byteLength, uploadOptions);
        return {
          path,
          sizeBytes: bytes.byteLength,
          etag: resp.etag ?? '',
          created: true,
        };
      } catch (err) {
        if (err instanceof RestError && (err.statusCode === 409 || err.statusCode === 412)) {
          // Already exists — for content-addressed paths that is success,
          // since hash collisions mean same bytes.
          const existing = await blob.getProperties();
          return {
            path,
            sizeBytes: Number(existing.contentLength ?? bytes.byteLength),
            etag: existing.etag ?? '',
            created: false,
          };
        }
        throw err;
      }
    }

    // Non-immutable write (derived artefacts).
    const resp = await blob.upload(bytes, bytes.byteLength, uploadOptions);
    return {
      path,
      sizeBytes: bytes.byteLength,
      etag: resp.etag ?? '',
      created: true,
    };
  }

  async get(path: string): Promise<Buffer> {
    const container = await this.ensureContainer();
    const blob = container.getBlockBlobClient(path);
    try {
      const buf = await blob.downloadToBuffer();
      return buf;
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) {
        throw new StorageObjectNotFound(path);
      }
      throw err;
    }
  }

  async stat(path: string): Promise<ObjectStat | null> {
    const container = await this.ensureContainer();
    const blob = container.getBlockBlobClient(path);
    try {
      const props = await blob.getProperties();
      const stat: ObjectStat = {
        path,
        sizeBytes: Number(props.contentLength ?? 0),
        createdAt: props.createdOn ?? new Date(),
        etag: props.etag ?? '',
        metadata: props.metadata ?? {},
        ...(props.contentType !== undefined ? { contentType: props.contentType } : {}),
      };
      return stat;
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) return null;
      throw err;
    }
  }

  async exists(path: string): Promise<boolean> {
    return (await this.stat(path)) !== null;
  }

  async delete(path: string): Promise<void> {
    const container = await this.ensureContainer();
    const blob = container.getBlockBlobClient(path);
    await blob.deleteIfExists();
  }
}

// Re-export for caller convenience.
export { StorageImmutabilityViolation };
