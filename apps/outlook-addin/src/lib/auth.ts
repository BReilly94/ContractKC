import { API_BASE_URL, AUTH_MODE } from './config.js';

/**
 * Auth strategy (SOW §6.18):
 *
 *  - Post-M365-migration / production:  the add-in runs inside the user's
 *    signed-in Outlook session. We'll use Office SSO (`getAccessToken`) to
 *    mint an Azure AD bearer for our API audience. That is Phase 2 wiring.
 *
 *  - Pre-migration bridge:               user types/pastes an Azure AD token
 *    that the IT bridge minted for them. We cache it in Office roamingSettings
 *    (server-synced, not local browser storage — so it is NOT subject to
 *    Non-Negotiable #7).
 *
 *  - Local dev:                          the add-in talks to the same `/api/dev`
 *    shim the web app uses. User picks a dev principal from a dropdown and we
 *    call `POST /api/dev/token` to get a throwaway bearer.
 *
 * This module mirrors the web app's auth-store.ts shape but stores via Office
 * roamingSettings instead of localStorage.
 */

const TOKEN_SETTING = 'ckb.bearer';
const USER_SETTING = 'ckb.user';

export interface StoredUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

export interface DevUserRow {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

function getSettings(): {
  get(name: string): unknown;
  set(name: string, value: unknown): void;
  saveAsync(cb?: (res: { status: string }) => void): void;
} | null {
  if (typeof Office === 'undefined' || !Office.context) return null;
  return Office.context.roamingSettings;
}

export function readStoredToken(): string | null {
  const s = getSettings();
  if (!s) return null;
  const v = s.get(TOKEN_SETTING);
  return typeof v === 'string' ? v : null;
}

export function readStoredUser(): StoredUser | null {
  const s = getSettings();
  if (!s) return null;
  const v = s.get(USER_SETTING);
  if (!v || typeof v !== 'object') return null;
  const obj = v as { id?: unknown; email?: unknown; displayName?: unknown };
  if (
    typeof obj.id !== 'string' ||
    typeof obj.email !== 'string' ||
    typeof obj.displayName !== 'string'
  ) {
    return null;
  }
  return { id: obj.id, email: obj.email, displayName: obj.displayName };
}

export async function writeStoredSession(token: string, user: StoredUser): Promise<void> {
  const s = getSettings();
  if (!s) return;
  s.set(TOKEN_SETTING, token);
  s.set(USER_SETTING, user);
  await new Promise<void>((resolve) => {
    s.saveAsync(() => resolve());
  });
}

export async function clearStoredSession(): Promise<void> {
  const s = getSettings();
  if (!s) return;
  s.set(TOKEN_SETTING, null);
  s.set(USER_SETTING, null);
  await new Promise<void>((resolve) => {
    s.saveAsync(() => resolve());
  });
}

/**
 * Dev-only: list the dev users the API is willing to impersonate. Matches
 * `apps/web/lib/api-client.ts:devListUsers`.
 */
export async function fetchDevUsers(): Promise<DevUserRow[]> {
  const res = await fetch(`${API_BASE_URL}/api/dev/users`);
  if (!res.ok) throw new Error(`dev-users fetch failed: ${res.status}`);
  return (await res.json()) as DevUserRow[];
}

export async function issueDevToken(userId: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/dev/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(`dev-token mint failed: ${res.status}`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

export function isAzureAdMode(): boolean {
  return AUTH_MODE === 'azure-ad';
}
