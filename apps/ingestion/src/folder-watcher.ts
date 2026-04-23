import { readFile, rename, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import chokidar from 'chokidar';
import type { Logger } from '@ckb/shared';
import { acceptInboundEmail, type IngestionPipelineDeps } from './pipeline.js';

/**
 * Local folder watcher — the SendGrid Inbound Parse substitute for development.
 *
 * Convention: `dev/inbox/<contract-slug>/*.eml`. The slug is matched against
 * an `email_alias` lookup later in the pipeline. For Phase 1 (Slice B/C) the
 * slug is passed through as the single envelopeTo recipient
 * `<slug>@<EMAIL_DOMAIN>`; alias resolution happens in the ingestion worker.
 *
 * On successful enqueue the file is moved to `dev/processed/<slug>/`. On
 * failure it stays in place and a sidecar `<filename>.error.json` records the
 * reason so the operator can diagnose.
 */

export interface FolderWatcherOptions {
  readonly inboxDir: string;
  readonly processedDir: string;
  readonly emailDomain: string;
  readonly deps: IngestionPipelineDeps;
  readonly logger: Logger;
}

export interface FolderWatcherHandle {
  stop(): Promise<void>;
}

export function startFolderWatcher(options: FolderWatcherOptions): FolderWatcherHandle {
  const inbox = resolve(options.inboxDir);
  const processed = resolve(options.processedDir);

  const watcher = chokidar.watch(join(inbox, '**/*.eml'), {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('add', async (path) => {
    const slug = basename(dirname(path));
    const fileName = basename(path);
    try {
      const bytes = await readFile(path);
      const envelopeTo = [`${slug}@${options.emailDomain}`];
      const result = await acceptInboundEmail(
        {
          rawBytes: bytes,
          envelopeTo,
          envelopeFrom: 'folder-watcher@local',
          provider: 'LocalFolderWatcher',
          source: `folder:${slug}/${fileName}`,
        },
        options.deps,
      );

      const targetDir = join(processed, slug);
      await mkdir(targetDir, { recursive: true });
      await rename(path, join(targetDir, fileName));

      options.logger.info('folder-watcher accepted eml', {
        slug,
        fileName,
        inboundEventId: result.inboundEventId,
        alreadySeen: result.alreadySeen,
      });
    } catch (err) {
      const message = (err as Error).message;
      options.logger.error('folder-watcher failed to accept eml', {
        slug,
        fileName,
        reason: message,
      });
      try {
        await writeFile(
          `${path}.error.json`,
          JSON.stringify({ reason: message, at: new Date().toISOString() }, null, 2),
        );
      } catch {
        // Swallow — we already logged the primary failure.
      }
    }
  });

  return {
    async stop(): Promise<void> {
      await watcher.close();
    },
  };
}
