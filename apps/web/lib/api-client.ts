// Always use relative paths — Next.js proxy route at app/api/[...path] forwards to NestJS.
const API_BASE = '';

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
  const rawUrl = path.startsWith('http') ? path : API_BASE + path;
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const url = new URL(rawUrl.startsWith('/') || rawUrl.startsWith('http') ? rawUrl : '/' + rawUrl, base);
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
    if (res.status === 401 && typeof window !== 'undefined') {
      // Token expired or invalid — clear storage and send to login.
      window.localStorage.removeItem('ckb.devToken');
      window.localStorage.removeItem('ckb.devUser');
      window.location.href = '/login';
      return undefined as T;
    }
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

export interface ApiDocument {
  id: string;
  contractId: string;
  category: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  sha256: string;
  source: string;
  sourceEmailId: string | null;
  uploadedByUserId: string | null;
  uploadedAt: string;
  malwareScanStatus: string;
  ocrStatus: string;
  encryptionState: string;
  redactionState: string;
  isSuperseded: boolean;
  language: string;
}

export interface ApiBidHandoff {
  id: string;
  contractId: string;
  bidId: string;
  sourceSystem: string;
  status: 'Received' | 'Processed' | 'Failed';
  receivedAt: string;
  receivedByUserId: string | null;
  receivedVia: 'UserSession' | 'ApiKey';
  rawPayloadSha256: string;
  risksCreated: number;
  contactsCreated: number;
  documentsCreated: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEmailList {
  id: string;
  contractId: string;
  threadId: string | null;
  rfcMessageId: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  receivedAt: string;
  sentAt: string | null;
  senderTrustState: string;
  direction: string;
  privilegedFlag: boolean;
  duplicateOfEmailId: string | null;
  containsSharedLink: boolean;
}

export interface ApiEmailDetail extends ApiEmailList {
  inReplyTo: string | null;
  referencesRaw: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  bodyText: string | null;
  rawEmlSha256: string;
  rawEmlBlobPath: string;
  attachments: Array<{
    documentId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    malwareScanStatus: string;
  }>;
}

export interface ApiDeadline {
  id: string;
  contractId: string;
  label: string;
  responsibleParty: string;
  triggerCondition: string | null;
  durationDays: number | null;
  absoluteDate: string | null;
  alertLeadDays: number;
  consequence: string | null;
  verificationState: 'Unverified' | 'Verified';
  lifecycleState:
    | 'Extracted'
    | 'Verified'
    | 'Active'
    | 'Triggered'
    | 'Complete'
    | 'Missed'
    | 'Cancelled';
  sourceType: string;
  sourceCitation: string | null;
  dueAt: string | null;
  triggeredAt: string | null;
}

export interface ApiContact {
  id: string;
  contractId: string;
  partyId: string | null;
  name: string;
  roleTitle: string | null;
  email: string | null;
  phone: string | null;
  authorityLevel:
    | 'CanDirectExtraWork'
    | 'CanIssueSiteInstructions'
    | 'CanApproveVariations'
    | 'Administrative';
  notes: string | null;
}

export interface ApiReviewQueueItem {
  id: string;
  emailId: string;
  contractId: string;
  reason: string;
  reasonDetail: string | null;
  state: 'Pending' | 'Approved' | 'Rejected' | 'Actioned';
  createdAt: string;
  emailSubject: string;
  emailFromAddress: string;
  emailReceivedAt: string;
}

export interface ApiSearchResult {
  query: string;
  tookMs: number;
  hits: Array<
    | {
        kind: 'Email';
        id: string;
        contractId: string;
        subject: string;
        fromAddress: string;
        receivedAt: string;
        snippet: string;
      }
    | {
        kind: 'Document';
        id: string;
        contractId: string;
        category: string;
        originalFilename: string;
        uploadedAt: string;
        snippet: string;
      }
    | {
        kind: 'Chunk';
        chunkId: string;
        contractId: string;
        sourceType: string;
        sourceId: string;
        text: string;
        score: number;
      }
  >;
}

export interface ApiQaResponse {
  queryId: string;
  answer: string;
  blocked: boolean;
  blockedReason: string | null;
  confidence: 'high' | 'medium' | 'low' | 'insufficient_context';
  retrievalHits: number;
  citations: Array<{
    chunkId: string;
    sourceType: string;
    sourceId: string;
    snippet: string;
  }>;
}

export interface ApiSummary {
  id: string;
  contractId: string;
  verificationState: 'Unverified' | 'Verified' | 'Superseded';
  contentJson: Record<string, unknown> | null;
  verifiedByUserId: string | null;
  verifiedAt: string | null;
  generatedByCapabilityVersion: string | null;
  generatedAt: string | null;
}

export interface ApiClause {
  id: string;
  contractId: string;
  sourceDocumentId: string;
  clauseNumber: string | null;
  heading: string | null;
  text: string;
  clauseType: string;
  extractionConfidence: string;
  verificationState: 'Unverified' | 'Verified';
  isSuperseded: boolean;
}

export interface ApiTimelineItem {
  id: string;
  contractId: string;
  occurredAt: string;
  kind: string;
  entityType: string;
  entityId: string;
  title: string;
  subtitle: string | null;
  severity: 'info' | 'warning' | 'critical' | null;
}

export interface ApiTimelineResult {
  items: ApiTimelineItem[];
  nextCursor: string | null;
}

export interface ApiVariation {
  id: string;
  contractId: string;
  variationNumber: number | null;
  title: string;
  description: string | null;
  lifecycleState: string;
  pricedAmountCents: number | null;
  approvedAmountCents: number | null;
  originatingInstruction: string | null;
  submittedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiRisk {
  id: string;
  contractId: string;
  title: string;
  description: string | null;
  category: string;
  probability: string;
  impact: string;
  mitigation: string | null;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiClaim {
  id: string;
  contractId: string;
  claimNumber: number | null;
  title: string;
  lifecycleState: string;
  narrative: string | null;
  amountClaimedCents: number | null;
  amountAwardedCents: number | null;
  timeImpactDays: number | null;
  triggerEventSummary: string | null;
  primaryClauseId: string | null;
  submittedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
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

  // Documents
  listDocuments: (
    opts: ApiClientOptions,
    contractId: string,
    filters?: { category?: string; source?: string; includeSuperseded?: boolean },
  ) =>
    request<ApiDocument[]>(`/api/contracts/${contractId}/documents`, { ...opts, query: filters }),
  getDocument: (opts: ApiClientOptions, id: string) =>
    request<ApiDocument>(`/api/documents/${id}`, opts),
  uploadDocument: (
    opts: ApiClientOptions,
    contractId: string,
    body: {
      category: string;
      originalFilename: string;
      mimeType: string;
      contentBase64: string;
      language?: string;
      tagIds?: string[];
    },
  ) =>
    request<ApiDocument>(`/api/contracts/${contractId}/documents`, {
      ...opts,
      method: 'POST',
      body,
    }),

  // Bid handoffs
  listBidHandoffs: (opts: ApiClientOptions, contractId: string) =>
    request<ApiBidHandoff[]>('/api/bid-handoffs', { ...opts, query: { contractId } }),

  // Emails
  listEmails: (opts: ApiClientOptions, contractId: string) =>
    request<ApiEmailList[]>(`/api/contracts/${contractId}/emails`, opts),
  getEmail: (opts: ApiClientOptions, id: string) =>
    request<ApiEmailDetail>(`/api/emails/${id}`, opts),
  listThread: (opts: ApiClientOptions, threadId: string) =>
    request<ApiEmailList[]>(`/api/email-threads/${threadId}`, opts),

  // Deadlines
  listDeadlines: (opts: ApiClientOptions, contractId: string) =>
    request<ApiDeadline[]>(`/api/contracts/${contractId}/deadlines`, opts),
  createDeadline: (
    opts: ApiClientOptions,
    contractId: string,
    body: Record<string, unknown>,
  ) =>
    request<ApiDeadline>(`/api/contracts/${contractId}/deadlines`, {
      ...opts,
      method: 'POST',
      body,
    }),
  verifyDeadline: (opts: ApiClientOptions, id: string) =>
    request<ApiDeadline>(`/api/deadlines/${id}/verify`, { ...opts, method: 'POST' }),
  transitionDeadline: (opts: ApiClientOptions, id: string, to: string) =>
    request<ApiDeadline>(`/api/deadlines/${id}/transition`, {
      ...opts,
      method: 'PATCH',
      body: { to },
    }),

  // Contacts
  listContacts: (opts: ApiClientOptions, contractId: string) =>
    request<ApiContact[]>(`/api/contracts/${contractId}/contacts`, opts),
  createContact: (
    opts: ApiClientOptions,
    contractId: string,
    body: Record<string, unknown>,
  ) =>
    request<ApiContact>(`/api/contracts/${contractId}/contacts`, {
      ...opts,
      method: 'POST',
      body,
    }),
  updateContact: (opts: ApiClientOptions, id: string, body: Record<string, unknown>) =>
    request<ApiContact>(`/api/contacts/${id}`, { ...opts, method: 'PATCH', body }),
  deleteContact: (opts: ApiClientOptions, id: string) =>
    request<{ ok: true }>(`/api/contacts/${id}`, { ...opts, method: 'DELETE' }),

  // Review queue
  listReviewQueue: (opts: ApiClientOptions, contractId: string, state?: string) =>
    request<ApiReviewQueueItem[]>(`/api/contracts/${contractId}/review-queue`, {
      ...opts,
      query: { state },
    }),
  approveReview: (opts: ApiClientOptions, id: string, notes?: string) =>
    request<ApiReviewQueueItem>(`/api/review-queue/${id}/approve`, {
      ...opts,
      method: 'POST',
      body: { notes },
    }),
  rejectReview: (opts: ApiClientOptions, id: string, notes?: string) =>
    request<ApiReviewQueueItem>(`/api/review-queue/${id}/reject`, {
      ...opts,
      method: 'POST',
      body: { notes },
    }),

  // Search
  search: (opts: ApiClientOptions, contractId: string, q: string, kinds?: string) =>
    request<ApiSearchResult>(`/api/contracts/${contractId}/search`, {
      ...opts,
      query: { q, kinds },
    }),

  // Q&A
  askQa: (opts: ApiClientOptions, contractId: string, question: string) =>
    request<ApiQaResponse>(`/api/contracts/${contractId}/qa`, {
      ...opts,
      method: 'POST',
      body: { question },
    }),
  qaFeedback: (opts: ApiClientOptions, queryId: string, thumb: 'up' | 'down', comment?: string) =>
    request<{ ok: true }>(`/api/qa/${queryId}/feedback`, {
      ...opts,
      method: 'POST',
      body: { thumb, comment },
    }),

  // Summary
  getSummary: (opts: ApiClientOptions, contractId: string) =>
    request<ApiSummary>(`/api/contracts/${contractId}/summary`, opts),
  generateSummary: (opts: ApiClientOptions, contractId: string) =>
    request<{ queued: true }>(`/api/contracts/${contractId}/summary/generate`, {
      ...opts,
      method: 'POST',
    }),
  verifySummary: (opts: ApiClientOptions, contractId: string) =>
    request<ApiSummary>(`/api/contracts/${contractId}/summary/verify`, {
      ...opts,
      method: 'POST',
    }),

  // Clauses
  listClauses: (opts: ApiClientOptions, contractId: string, type?: string) =>
    request<ApiClause[]>(`/api/contracts/${contractId}/clauses`, {
      ...opts,
      query: { type },
    }),

  // Timeline (§6.2 / §8.7)
  listTimeline: (
    opts: ApiClientOptions,
    contractId: string,
    params?: { limit?: number; cursor?: string; kinds?: string },
  ) =>
    request<ApiTimelineResult>(`/api/contracts/${contractId}/timeline`, {
      ...opts,
      query: params,
    }),

  // Variations (§6.3 / §8.9)
  listVariations: (opts: ApiClientOptions, contractId: string) =>
    request<{ items: ApiVariation[] }>(`/api/contracts/${contractId}/variations`, opts),
  createVariation: (opts: ApiClientOptions, contractId: string, body: Record<string, unknown>) =>
    request<ApiVariation>(`/api/contracts/${contractId}/variations`, {
      ...opts,
      method: 'POST',
      body,
    }),
  transitionVariation: (
    opts: ApiClientOptions,
    contractId: string,
    variationId: string,
    target: string,
    extra?: Record<string, unknown>,
  ) =>
    request<ApiVariation>(
      `/api/contracts/${contractId}/variations/${variationId}/transitions`,
      { ...opts, method: 'POST', body: { target, ...extra } },
    ),

  // Risks (§6.4 / §8.9)
  listRisks: (opts: ApiClientOptions, contractId: string, status?: string) =>
    request<{ items: ApiRisk[] }>(`/api/contracts/${contractId}/risks`, {
      ...opts,
      query: { status },
    }),
  createRisk: (opts: ApiClientOptions, contractId: string, body: Record<string, unknown>) =>
    request<ApiRisk>(`/api/contracts/${contractId}/risks`, {
      ...opts,
      method: 'POST',
      body,
    }),

  // Claims (§6.12 / §8.9)
  listClaims: (opts: ApiClientOptions, contractId: string) =>
    request<{ items: ApiClaim[] }>(`/api/contracts/${contractId}/claims`, opts),
  createClaim: (opts: ApiClientOptions, contractId: string, body: Record<string, unknown>) =>
    request<ApiClaim>(`/api/contracts/${contractId}/claims`, {
      ...opts,
      method: 'POST',
      body,
    }),
  transitionClaim: (
    opts: ApiClientOptions,
    contractId: string,
    claimId: string,
    target: string,
    extra?: Record<string, unknown>,
  ) =>
    request<ApiClaim>(
      `/api/contracts/${contractId}/claims/${claimId}/transitions`,
      { ...opts, method: 'POST', body: { target, ...extra } },
    ),
};
