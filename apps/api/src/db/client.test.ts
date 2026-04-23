import { describe, expect, it } from 'vitest';
import { parseConnectionString } from './client.js';

describe('parseConnectionString', () => {
  it('parses the .env.example shape', () => {
    const cfg = parseConnectionString(
      'sqlserver://sa:LocalDev!Passw0rd@localhost:1433;database=ckb;encrypt=false;trustServerCertificate=true',
    );
    expect(cfg.server).toBe('localhost');
    expect(cfg.port).toBe(1433);
    expect(cfg.user).toBe('sa');
    expect(cfg.password).toBe('LocalDev!Passw0rd');
    expect(cfg.database).toBe('ckb');
    expect(cfg.options?.encrypt).toBe(false);
    expect(cfg.options?.trustServerCertificate).toBe(true);
  });

  it('defaults port to 1433 when omitted', () => {
    const cfg = parseConnectionString('sqlserver://sa:pw@db.example.com;database=ckb');
    expect(cfg.port).toBe(1433);
    expect(cfg.server).toBe('db.example.com');
  });

  it('defaults encrypt to true (secure default) when not specified', () => {
    const cfg = parseConnectionString('sqlserver://sa:pw@localhost:1433;database=ckb');
    expect(cfg.options?.encrypt).toBe(true);
  });

  it('rejects unsupported schemes', () => {
    expect(() => parseConnectionString('postgres://x:y@z')).toThrow(/Unsupported/);
  });

  it('rejects missing credentials', () => {
    expect(() => parseConnectionString('sqlserver://localhost:1433;database=ckb')).toThrow();
  });
});
