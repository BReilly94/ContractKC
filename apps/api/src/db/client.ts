import mssql from 'mssql';

export interface DbConfig {
  readonly connectionString: string;
}

export function parseConnectionString(url: string): mssql.config {
  if (url.startsWith('sqlserver://')) {
    const withoutScheme = url.slice('sqlserver://'.length);
    const atIdx = withoutScheme.indexOf('@');
    if (atIdx < 0) throw new Error('DATABASE_URL missing credentials');
    const creds = withoutScheme.slice(0, atIdx);
    const rest = withoutScheme.slice(atIdx + 1);
    const [userPart, passwordPart] = creds.split(':');
    if (!userPart || passwordPart === undefined) throw new Error('DATABASE_URL missing user/password');
    const semiIdx = rest.indexOf(';');
    const hostPort = semiIdx >= 0 ? rest.slice(0, semiIdx) : rest;
    const params = semiIdx >= 0 ? rest.slice(semiIdx + 1) : '';
    const [host, portStr] = hostPort.split(':');
    if (!host) throw new Error('DATABASE_URL missing host');
    const port = portStr ? Number(portStr) : 1433;
    const kv: Record<string, string> = {};
    for (const pair of params.split(';').filter(Boolean)) {
      const [k, v] = pair.split('=');
      if (k && v !== undefined) kv[k.toLowerCase()] = v;
    }
    return {
      server: host,
      port,
      user: userPart,
      password: passwordPart,
      database: kv.database ?? 'ckb',
      options: {
        encrypt: kv.encrypt !== 'false',
        trustServerCertificate: kv.trustservercertificate === 'true',
      },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
    };
  }
  throw new Error(`Unsupported DATABASE_URL scheme: ${url.slice(0, 32)}...`);
}

let pool: mssql.ConnectionPool | null = null;

export async function getPool(connectionString: string): Promise<mssql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  const cfg = parseConnectionString(connectionString);
  pool = new mssql.ConnectionPool(cfg);
  await pool.connect();
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}
