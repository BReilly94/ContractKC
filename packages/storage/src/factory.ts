import { AzureBlobStorageClient } from './azure-blob-impl.js';
import type { StorageClient } from './interface.js';

export interface StorageFactoryConfig {
  readonly mode: 'local' | 'azure';
  readonly connectionString: string;
  readonly containerName: string;
}

export function createStorageClient(config: StorageFactoryConfig): StorageClient {
  // Azurite and Azure use the same SDK; the mode is telemetry-only. If we ever
  // need a non-Azure backend (GCS, S3), add an impl and branch here.
  return new AzureBlobStorageClient(config.connectionString, config.containerName, config.mode);
}
