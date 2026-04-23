import { connect, type Socket } from 'node:net';
import type { MalwareScanner, ScanResult } from './interface.js';

/**
 * ClamAV INSTREAM client.
 *
 * Protocol: send zINSTREAM\0, then chunks as <uint32 length BE><bytes>, then
 * a zero-length terminator. ClamAV replies `stream: OK\0` or `stream: <sig> FOUND\0`.
 * See `man clamd`.
 */
export class ClamAvScanner implements MalwareScanner {
  readonly mode: 'local' | 'azure' = 'local';
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 30_000,
    private readonly chunkSize = 64 * 1024,
  ) {}

  private connect(): Promise<Socket> {
    return new Promise<Socket>((resolve, reject) => {
      const sock = connect({ host: this.host, port: this.port });
      sock.setTimeout(this.timeoutMs);
      sock.once('connect', () => resolve(sock));
      sock.once('error', reject);
      sock.once('timeout', () => {
        sock.destroy();
        reject(new Error(`ClamAV connection timeout after ${this.timeoutMs}ms`));
      });
    });
  }

  private writeInstream(sock: Socket, bytes: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        sock.write('zINSTREAM\0');
        let offset = 0;
        while (offset < bytes.length) {
          const end = Math.min(offset + this.chunkSize, bytes.length);
          const chunk = bytes.subarray(offset, end);
          const lenBuf = Buffer.alloc(4);
          lenBuf.writeUInt32BE(chunk.length, 0);
          sock.write(lenBuf);
          sock.write(chunk);
          offset = end;
        }
        const term = Buffer.alloc(4);
        term.writeUInt32BE(0, 0);
        sock.write(term);
        resolve();
      } catch (err) {
        reject(err as Error);
      }
    });
  }

  private readResponse(sock: Socket): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      sock.on('data', (c: Buffer) => chunks.push(c));
      sock.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      sock.on('error', reject);
      sock.on('timeout', () => {
        sock.destroy();
        reject(new Error(`ClamAV response timeout after ${this.timeoutMs}ms`));
      });
    });
  }

  async scan(bytes: Buffer): Promise<ScanResult> {
    const sock = await this.connect();
    try {
      await this.writeInstream(sock, bytes);
      const raw = await this.readResponse(sock);
      // clamd appends \0.
      const body = raw.replace(/\0$/, '').trim();
      if (body.endsWith('OK')) {
        return { verdict: 'Clean', signatures: [], scannedAt: new Date(), rawResponse: body };
      }
      const m = body.match(/stream:\s*(.+)\s+FOUND/);
      if (m) {
        return {
          verdict: 'Infected',
          signatures: [m[1]!],
          scannedAt: new Date(),
          rawResponse: body,
        };
      }
      return { verdict: 'Error', signatures: [], scannedAt: new Date(), rawResponse: body };
    } finally {
      sock.destroy();
    }
  }

  async ping(): Promise<boolean> {
    try {
      const sock = await this.connect();
      sock.write('zPING\0');
      const resp = await this.readResponse(sock);
      sock.destroy();
      return resp.includes('PONG');
    } catch {
      return false;
    }
  }
}
