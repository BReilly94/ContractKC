const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

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

export interface ApiClientOptions {
  readonly token: string | null;
}

async function request<T>(
  path: string,
  options: ApiClientOptions & {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  },
): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : API_BASE + path);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!res.ok) {
    let payload: { error?: { code?: string; message?: string; details?: unknown } } = {};
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      /* non-JSON error */
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

export interface ApiContract {
  id: string;
  name: string;
  clientPartyId: string;
  responsiblePmUserId: string;
  contractValueCents: number | null;
  currency: string;
  startDate: string;
  endDate: string | null;
  governingLaw: string;
  confidentialityClass: string;
  language: string;
  lifecycleState:
    | 'Draft'
    | 'Onboarding'
    | 'Active'
    | 'IssueInProgress'
    | 'Closeout'
    | 'Archived';
  vectorNamespace: string;
  projectEmailAddress: string;
  projectEmailAlias: string | null;
  summaryId: string | null;
  summaryVerificationState: 'Unverified' | 'Verified' | 'Superseded' | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiParty {
  id: string;
  name: string;
}

export interface ApiUser {
  id: string;
  email: string;
  displayName: string;
  globalRole: string;
  isPm: boolean;
  canCreateContracts: boolean;
}

export const api = {
  devListUsers: (opts: ApiClientOptions) =>
    request<Array<{ id: string; email: string; displayName: string }>>('/api/dev/users', {
      ...opts,
    }),
  devIssueToken: (userId: string) =>
    request<{ token: string }>('/api/dev/token', {
      token: null,
      method: 'POST',
      body: { userId },
    }),
  listContracts: (opts: ApiClientOptions) =>
    request<ApiContract[]>('/api/contracts', opts),
  getContract: (opts: ApiClientOptions, id: string) =>
    request<ApiContract>(`/api/contracts/${id}`, opts),
  createContract: (opts: ApiClientOptions, body: Record<string, unknown>) =>
    request<ApiContract>('/api/contracts', { ...opts, method: 'POST', body }),
  transitionLifecycle: (opts: ApiClientOptions, id: string, targetState: string) =>
    request<ApiContract>(`/api/contracts/${id}/lifecycle`, {
      ...opts,
      method: 'PATCH',
      body: { targetState },
    }),
  listParties: (opts: ApiClientOptions, q?: string) =>
    request<ApiParty[]>('/api/parties', { ...opts, query: { q } }),
  createParty: (opts: ApiClientOptions, name: string) =>
    request<ApiParty>('/api/parties', { ...opts, method: 'POST', body: { name } }),
  listPmUsers: (opts: ApiClientOptions) =>
    request<ApiUser[]>('/api/users', { ...opts, query: { is_pm: 'true' } }),
};
