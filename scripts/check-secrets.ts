#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Pattern {
  readonly name: string;
  readonly regex: RegExp;
  readonly description: string;
}

const PATTERNS: readonly Pattern[] = [
  {
    name: 'anthropic-key',
    regex: /sk-ant-[A-Za-z0-9_-]{20,}/,
    description: 'Anthropic API key',
  },
  {
    name: 'aws-access-key',
    regex: /AKIA[0-9A-Z]{16}/,
    description: 'AWS access key ID',
  },
  {
    name: 'pem-private-key',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
    description: 'PEM-encoded private key',
  },
  {
    name: 'jwt-looking-literal',
    regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    description: 'Hardcoded JWT-shaped token',
  },
  {
    name: 'azure-storage-key',
    regex: /[A-Za-z0-9+/]{86}==/,
    description: 'Azure storage key-shaped base64 blob',
  },
  {
    name: 'sql-connection-password',
    regex: /password\s*=\s*["'][^"'{}$]{8,}["']/i,
    description: 'Hardcoded password in a connection-string-like expression',
  },
];

const ALLOW_PATHS: readonly RegExp[] = [
  /^\.env\.example$/,
  /^docs\//,
  /^docs\\/,
  /^CLAUDE\.md$/,
  /^scripts\\check-secrets\.ts$/,
  /^scripts\/check-secrets\.ts$/,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
];

const AZURITE_WELL_KNOWN = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';

function listFiles(): string[] {
  const output = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
  return output.split('\n').filter((f) => f.length > 0);
}

function shouldSkip(path: string): boolean {
  return ALLOW_PATHS.some((re) => re.test(path));
}

interface Hit {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const rel of listFiles()) {
    if (shouldSkip(rel)) continue;
    const abs = join(ROOT, rel);
    let content: string;
    try {
      content = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const p of PATTERNS) {
        const m = line.match(p.regex);
        if (!m) continue;
        if (m[0] === AZURITE_WELL_KNOWN) continue;
        hits.push({
          file: rel,
          line: i + 1,
          pattern: p.name,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }
  return hits;
}

const hits = scan();
if (hits.length === 0) {
  console.warn('[check-secrets] Clean.');
  process.exit(0);
}
console.error(`[check-secrets] Found ${hits.length} potential secret(s):`);
for (const h of hits) {
  console.error(`  ${h.file}:${h.line} [${h.pattern}] ${h.snippet}`);
}
console.error('\nIf any hit is a false positive, add an entry to ALLOW_PATHS in scripts/check-secrets.ts.');
process.exit(1);

// Avoid unused import warning
void relative;
