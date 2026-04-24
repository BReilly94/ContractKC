import { API_BASE_URL } from './config.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiContract {
  readonly id: string;
  readonly name: string;
  readonly projectEmailAddress: string;
  readonly projectEmailAlias: string | null;
  readonly lifecycleState:
    | 'Draft'
    | 'Onboarding'
    | 'Active'
    | 'IssueInProgress'
    | 'Closeout'
    | 'Archived';
}

export interface ForwardEmailResult {
  readonly inboundEventId: string;
  readonly rawEmlSha256: string;
  readonly contractId: string;
  readonly projectEmailAddress: string;
  readonly alreadySeen: boolean;
}

async function request<T>(
  path: string,
  token: string | null,
  init: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const fetchInit: RequestInit = {
    method: init.method ?? 'GET',
    headers,
  };
  if (init.body !== undefined) {
    fetchInit.body = JSON.stringify(init.body);
  }
  const res = await fetch(`${API_BASE_URL}${path}`, fetchInit);
  if (!res.ok) {
    let payload: { error?: { code?: string; message?: string; details?: unknown } } = {};
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      /* ignore non-JSON error body */
    }
    throw new ApiError(
      res.status,
      payload.error?.code ?? 'HTTP_ERROR',
      payload.error?.message ?? `Request failed: ${res.status}`,
      payload.error?.details,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * List contracts the caller has access to. Maps to the web app's
 * `api.listContracts` (per-contract default-deny is enforced server-side —
 * there is no client-side filter).
 */
export async function listAccessibleContracts(token: string): Promise<ApiContract[]> {
  return request<ApiContract[]>('/api/contracts', token);
}

export async function forwardEmailToContract(
  token: string,
  contractId: string,
  emlBase64: string,
  envelopeFrom: string | undefined,
): Promise<ForwardEmailResult> {
  const body: Record<string, unknown> = { emlBase64, source: 'outlook-addin' };
  if (envelopeFrom) body['envelopeFrom'] = envelopeFrom;
  return request<ForwardEmailResult>(
    `/api/contracts/${contractId}/emails/forward`,
    token,
    { method: 'POST', body },
  );
}
