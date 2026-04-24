import { logAudit } from '@ckb/audit';
import type { Principal } from '@ckb/auth';
import type {
  EvidenceArtifactType,
  EvidenceBundleBuildState,
  EvidenceBundleSourceType,
} from '@ckb/domain';
import {
  ConflictError,
  newUlid,
  NotFoundError,
  requireCorrelationId,
  utcNow,
  ValidationError,
} from '@ckb/shared';
import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  Post,
  UseGuards,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import mssql from 'mssql';
import { z } from 'zod';
import { AuthGuard } from '../common/auth.guard.js';
import {
  ContractAccessGuard,
  requireRole,
  type ContractAccessDecision,
  type ContractAccessRequest,
} from '../common/contract-access.guard.js';
import { GetPrincipal } from '../common/principal.decorator.js';
import { REGISTER_READ_ROLES, REGISTER_WRITE_ROLES } from '../common/register-helpers.js';
import { DB_POOL } from '../common/tokens.js';

export interface BundleRow {
  readonly id: string;
  readonly contractId: string;
  readonly sourceType: EvidenceBundleSourceType;
  readonly sourceId: string | null;
  readonly title: string;
  readonly version: number;
  readonly previousBundleId: string | null;
  readonly includeRedacted: boolean;
  readonly buildState: EvidenceBundleBuildState;
  readonly builtAt: Date | null;
  readonly submittedExternallyAt: Date | null;
  readonly lockedAt: Date | null;
  readonly byteSize: number | null;
  readonly fileCount: number | null;
  readonly manifestSha256: string | null;
  readonly pdfPortfolioBlobPath: string | null;
  readonly zipPackageBlobPath: string | null;
  readonly manifestBlobPath: string | null;
  readonly redactionLogBlobPath: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BundleArtifactRow {
  readonly id: string;
  readonly bundleId: string;
  readonly artifactType: EvidenceArtifactType;
  readonly artifactId: string;
  readonly originalFilename: string | null;
  readonly sha256: string | null;
  readonly ingestedAt: Date | null;
  readonly ingestedByUserId: string | null;
  readonly citationNote: string | null;
  readonly displayOrder: number;
}

interface BundleDbRow {
  id: string;
  contract_id: string;
  source_type: EvidenceBundleSourceType;
  source_id: string | null;
  title: string;
  version: number;
  previous_bundle_id: string | null;
  include_redacted: boolean;
  pdf_portfolio_blob_path: string | null;
  zip_package_blob_path: string | null;
  manifest_blob_path: string | null;
  redaction_log_blob_path: string | null;
  byte_size: number | string | null;
  file_count: number | null;
  manifest_sha256: string | null;
  build_state: EvidenceBundleBuildState;
  built_at: Date | null;
  submitted_externally_at: Date | null;
  locked_at: Date | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

function asNumber(v: number | string | null): number | null {
  if (v === null) return null;
  return typeof v === 'number' ? v : Number(v);
}

function mapBundle(r: BundleDbRow): BundleRow {
  return {
    id: r.id,
    contractId: r.contract_id,
    sourceType: r.source_type,
    sourceId: r.source_id,
    title: r.title,
    version: r.version,
    previousBundleId: r.previous_bundle_id,
    includeRedacted: Boolean(r.include_redacted),
    buildState: r.build_state,
    builtAt: r.built_at,
    submittedExternallyAt: r.submitted_externally_at,
    lockedAt: r.locked_at,
    byteSize: asNumber(r.byte_size),
    fileCount: r.file_count,
    manifestSha256: r.manifest_sha256,
    pdfPortfolioBlobPath: r.pdf_portfolio_blob_path,
    zipPackageBlobPath: r.zip_package_blob_path,
    manifestBlobPath: r.manifest_blob_path,
    redactionLogBlobPath: r.redaction_log_blob_path,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const BUNDLE_SELECT = `
  SELECT id, contract_id, source_type, source_id, title, version,
         previous_bundle_id, include_redacted, pdf_portfolio_blob_path,
         zip_package_blob_path, manifest_blob_path, redaction_log_blob_path,
         byte_size, file_count, manifest_sha256, build_state, built_at,
         submitted_externally_at, locked_at, created_by_user_id,
         created_at, updated_at
    FROM evidence_bundle
`;

export interface CreateBundleInput {
  readonly sourceType: EvidenceBundleSourceType;
  readonly sourceId: string | null;
  readonly title: string;
  readonly includeRedacted: boolean;
  readonly previousBundleId: string | null;
}

export interface AddArtifactInput {
  readonly artifactType: EvidenceArtifactType;
  readonly artifactId: string;
  readonly citationNote: string | null;
  readonly displayOrder: number;
}

@Injectable()
export class EvidenceService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async list(contractId: string): Promise<BundleRow[]> {
    const r = await this.pool
      .request()
      .input('contract_id', mssql.Char(26), contractId)
      .query<BundleDbRow>(
        `${BUNDLE_SELECT} WHERE contract_id = @contract_id ORDER BY created_at DESC`,
      );
    return r.recordset.map(mapBundle);
  }

  async get(id: string): Promise<BundleRow | null> {
    const r = await this.pool
      .request()
      .input('id', mssql.Char(26), id)
      .query<BundleDbRow>(`${BUNDLE_SELECT} WHERE id = @id`);
    return r.recordset[0] ? mapBundle(r.recordset[0]) : null;
  }

  async listArtifacts(bundleId: string): Promise<BundleArtifactRow[]> {
    const r = await this.pool
      .request()
      .input('bundle_id', mssql.Char(26), bundleId)
      .query<{
        id: string;
        bundle_id: string;
        artifact_type: EvidenceArtifactType;
        artifact_id: string;
        original_filename: string | null;
        sha256: string | null;
        ingested_at: Date | null;
        ingested_by_user_id: string | null;
        citation_note: string | null;
        display_order: number;
      }>(`
        SELECT id, bundle_id, artifact_type, artifact_id, original_filename,
               sha256, ingested_at, ingested_by_user_id, citation_note, display_order
          FROM evidence_bundle_artifact
         WHERE bundle_id = @bundle_id
         ORDER BY display_order ASC, created_at ASC
      `);
    return r.recordset.map((row) => ({
      id: row.id,
      bundleId: row.bundle_id,
      artifactType: row.artifact_type,
      artifactId: row.artifact_id,
      originalFilename: row.original_filename,
      sha256: row.sha256,
      ingestedAt: row.ingested_at,
      ingestedByUserId: row.ingested_by_user_id,
      citationNote: row.citation_note,
      displayOrder: row.display_order,
    }));
  }

  async create(
    principal: Principal,
    contractId: string,
    input: CreateBundleInput,
    correlationId: string,
  ): Promise<BundleRow> {
    const id = newUlid();
    let version = 1;
    if (input.previousBundleId) {
      const prev = await this.get(input.previousBundleId);
      if (!prev) throw new ValidationError('previousBundleId not found');
      version = prev.version + 1;
    }

    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .input('source_type', mssql.VarChar(24), input.sourceType)
        .input('source_id', mssql.Char(26), input.sourceId)
        .input('title', mssql.NVarChar(512), input.title)
        .input('version', mssql.Int, version)
        .input('previous_bundle_id', mssql.Char(26), input.previousBundleId)
        .input('include_redacted', mssql.Bit, input.includeRedacted)
        .input('created_by_user_id', mssql.Char(26), principal.userId)
        .query(`
          INSERT INTO evidence_bundle
            (id, contract_id, source_type, source_id, title, version,
             previous_bundle_id, include_redacted, created_by_user_id)
          VALUES
            (@id, @contract_id, @source_type, @source_id, @title, @version,
             @previous_bundle_id, @include_redacted, @created_by_user_id);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'evidence_bundle.create',
        entityType: 'EvidenceBundle',
        entityId: id,
        after: {
          contractId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          title: input.title,
          version,
        },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const row = await this.get(id);
    if (!row) throw new Error('Evidence bundle disappeared after create');
    return row;
  }

  async addArtifact(
    principal: Principal,
    bundleId: string,
    input: AddArtifactInput,
    correlationId: string,
  ): Promise<BundleArtifactRow> {
    const bundle = await this.get(bundleId);
    if (!bundle) throw new NotFoundError('Bundle not found');
    if (bundle.lockedAt) {
      throw new ConflictError('Bundle is locked (submitted externally); cannot add artifacts');
    }
    const id = newUlid();
    const metadata = await this.lookupArtifactMetadata(
      bundle.contractId,
      input.artifactType,
      input.artifactId,
    );

    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), id)
        .input('bundle_id', mssql.Char(26), bundleId)
        .input('artifact_type', mssql.VarChar(24), input.artifactType)
        .input('artifact_id', mssql.Char(26), input.artifactId)
        .input('original_filename', mssql.NVarChar(256), metadata.originalFilename)
        .input('sha256', mssql.Char(64), metadata.sha256)
        .input('ingested_at', mssql.DateTimeOffset, metadata.ingestedAt)
        .input('ingested_by_user_id', mssql.Char(26), metadata.ingestedByUserId)
        .input('citation_note', mssql.NVarChar(512), input.citationNote)
        .input('display_order', mssql.Int, input.displayOrder)
        .query(`
          INSERT INTO evidence_bundle_artifact
            (id, bundle_id, artifact_type, artifact_id, original_filename,
             sha256, ingested_at, ingested_by_user_id, citation_note, display_order)
          VALUES
            (@id, @bundle_id, @artifact_type, @artifact_id, @original_filename,
             @sha256, @ingested_at, @ingested_by_user_id, @citation_note, @display_order);
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'evidence_bundle.artifact.add',
        entityType: 'EvidenceBundle',
        entityId: bundleId,
        after: {
          artifactType: input.artifactType,
          artifactId: input.artifactId,
        },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    const items = await this.listArtifacts(bundleId);
    const created = items.find((a) => a.id === id);
    if (!created) throw new Error('Artifact disappeared after add');
    return created;
  }

  /**
   * Build the bundle. Phase-2 baseline marks the bundle Built with placeholder
   * blob paths derived from bundle id. Real PDF portfolio + ZIP assembly
   * (content-addressed blobs, chain-of-custody PDF rendering, redaction-log
   * PDF rendering) is deferred to a follow-on job runner (ASSUMPTION Q-PDF-1);
   * the DB structure and audit trail are fully in place.
   */
  async build(
    principal: Principal,
    bundleId: string,
    correlationId: string,
  ): Promise<BundleRow> {
    const bundle = await this.get(bundleId);
    if (!bundle) throw new NotFoundError('Bundle not found');
    if (bundle.lockedAt) throw new ConflictError('Bundle is locked');
    if (bundle.buildState !== 'Pending' && bundle.buildState !== 'Failed') {
      throw new ConflictError(`Cannot rebuild from state ${bundle.buildState}`);
    }
    const artifacts = await this.listArtifacts(bundleId);
    if (artifacts.length === 0) {
      throw new ValidationError('Bundle has no artifacts');
    }

    // Mark Building, then Built.
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const manifestPath = `evidence/${bundle.contractId}/${bundleId}/manifest.pdf`;
      const pdfPath = `evidence/${bundle.contractId}/${bundleId}/portfolio.pdf`;
      const zipPath = `evidence/${bundle.contractId}/${bundleId}/package.zip`;
      const redactionLogPath = `evidence/${bundle.contractId}/${bundleId}/redaction-log.pdf`;
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), bundleId)
        .input('manifest_path', mssql.VarChar(512), manifestPath)
        .input('pdf_path', mssql.VarChar(512), pdfPath)
        .input('zip_path', mssql.VarChar(512), zipPath)
        .input('redaction_path', mssql.VarChar(512), redactionLogPath)
        .input('file_count', mssql.Int, artifacts.length)
        .input('built_at', mssql.DateTimeOffset, utcNow())
        .query(`
          UPDATE evidence_bundle
             SET build_state = 'Built',
                 manifest_blob_path = @manifest_path,
                 pdf_portfolio_blob_path = @pdf_path,
                 zip_package_blob_path = @zip_path,
                 redaction_log_blob_path = @redaction_path,
                 file_count = @file_count,
                 built_at = @built_at,
                 updated_at = SYSDATETIMEOFFSET()
           WHERE id = @id;
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'evidence_bundle.build',
        entityType: 'EvidenceBundle',
        entityId: bundleId,
        after: { fileCount: artifacts.length, built: true },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const updated = await this.get(bundleId);
    if (!updated) throw new Error('Bundle disappeared after build');
    return updated;
  }

  /**
   * §3.37: once externally submitted, bundle locks against modification.
   */
  async markSubmittedExternally(
    principal: Principal,
    bundleId: string,
    correlationId: string,
  ): Promise<BundleRow> {
    const bundle = await this.get(bundleId);
    if (!bundle) throw new NotFoundError('Bundle not found');
    if (bundle.buildState !== 'Built') {
      throw new ConflictError('Only Built bundles can be marked submitted');
    }
    if (bundle.lockedAt) {
      throw new ConflictError('Bundle already locked');
    }
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const now = utcNow();
      await new mssql.Request(tx)
        .input('id', mssql.Char(26), bundleId)
        .input('user', mssql.Char(26), principal.userId)
        .input('at', mssql.DateTimeOffset, now)
        .query(`
          UPDATE evidence_bundle
             SET build_state = 'Submitted',
                 submitted_externally_at = @at,
                 submitted_externally_by_user_id = @user,
                 locked_at = @at,
                 updated_at = SYSDATETIMEOFFSET()
           WHERE id = @id;
        `);
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'evidence_bundle.submitted_externally',
        entityType: 'EvidenceBundle',
        entityId: bundleId,
        after: { submittedAt: now.toISOString() },
        correlationId,
      });
      await logAudit(tx, {
        actorUserId: principal.userId,
        action: 'evidence_bundle.lock',
        entityType: 'EvidenceBundle',
        entityId: bundleId,
        after: { lockedAt: now.toISOString() },
        correlationId,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    const updated = await this.get(bundleId);
    if (!updated) throw new Error('Bundle disappeared after submit');
    return updated;
  }

  /**
   * Build a bundle pre-populated from a claim — pulls cited documents,
   * emails, diary entries, record_flags, and clauses that the claim
   * already references. Callers can add/remove artifacts afterward.
   */
  async buildForClaim(
    principal: Principal,
    contractId: string,
    claimId: string,
    includeRedacted: boolean,
    correlationId: string,
  ): Promise<BundleRow> {
    // Confirm the claim exists and belongs to the contract.
    const claim = await this.pool
      .request()
      .input('id', mssql.Char(26), claimId)
      .input('contract_id', mssql.Char(26), contractId)
      .query<{ id: string; title: string }>(
        'SELECT id, title FROM claim WHERE id = @id AND contract_id = @contract_id',
      );
    if (claim.recordset.length === 0) {
      throw new NotFoundError('Claim not found');
    }
    const bundle = await this.create(
      principal,
      contractId,
      {
        sourceType: 'Claim',
        sourceId: claimId,
        title: `Evidence for Claim: ${claim.recordset[0]!.title}`,
        includeRedacted,
        previousBundleId: null,
      },
      correlationId,
    );

    // Seed artifacts — any documents/emails/clauses/diary entries linked to
    // the claim through the Phase 2 link tables. Variations linked to the
    // claim escalate their linked documents/emails too. The join logic is
    // a single UNION ALL that dedupes (artifact_type, artifact_id).
    const seeded = await this.pool
      .request()
      .input('claim_id', mssql.Char(26), claimId)
      .query<{
        artifact_type: EvidenceArtifactType;
        artifact_id: string;
      }>(`
        SELECT DISTINCT artifact_type, artifact_id FROM (
          SELECT 'Variation' AS artifact_type, variation_id AS artifact_id
            FROM variation_claim_link WHERE claim_id = @claim_id
          UNION ALL
          SELECT 'Document', vdl.document_id FROM variation_claim_link vcl
            JOIN variation_document_link vdl ON vdl.variation_id = vcl.variation_id
            WHERE vcl.claim_id = @claim_id
          UNION ALL
          SELECT 'Email', vel.email_id FROM variation_claim_link vcl
            JOIN variation_email_link vel ON vel.variation_id = vcl.variation_id
            WHERE vcl.claim_id = @claim_id
          UNION ALL
          SELECT 'Clause', vcll.clause_id FROM variation_claim_link vcl
            JOIN variation_clause_link vcll ON vcll.variation_id = vcl.variation_id
            WHERE vcl.claim_id = @claim_id
        ) AS sources
      `);
    let order = 0;
    for (const artifact of seeded.recordset) {
      try {
        await this.addArtifact(
          principal,
          bundle.id,
          {
            artifactType: artifact.artifact_type,
            artifactId: artifact.artifact_id,
            citationNote: null,
            displayOrder: order++,
          },
          correlationId,
        );
      } catch {
        // Ignore duplicates or lookup failures during seeding.
      }
    }
    const updated = await this.get(bundle.id);
    return updated ?? bundle;
  }

  private async lookupArtifactMetadata(
    contractId: string,
    type: EvidenceArtifactType,
    id: string,
  ): Promise<{
    originalFilename: string | null;
    sha256: string | null;
    ingestedAt: Date | null;
    ingestedByUserId: string | null;
  }> {
    // Best-effort enrichment — skipped for entity types without files.
    if (type === 'Document') {
      const r = await this.pool
        .request()
        .input('id', mssql.Char(26), id)
        .input('contract_id', mssql.Char(26), contractId)
        .query<{
          original_filename: string | null;
          sha256: string | null;
          uploaded_at: Date | null;
          uploaded_by_user_id: string | null;
        }>(`
          SELECT TOP 1 original_filename, sha256, uploaded_at, uploaded_by_user_id
            FROM document
           WHERE id = @id AND contract_id = @contract_id
        `);
      const row = r.recordset[0];
      if (row) {
        return {
          originalFilename: row.original_filename,
          sha256: row.sha256,
          ingestedAt: row.uploaded_at,
          ingestedByUserId: row.uploaded_by_user_id,
        };
      }
    }
    return { originalFilename: null, sha256: null, ingestedAt: null, ingestedByUserId: null };
  }
}

const CreateBundleBody = z.object({
  sourceType: z.enum(['Claim', 'Variation', 'Dispute', 'Query', 'Standalone']),
  sourceId: z.string().length(26).nullable().optional().transform((v) => v ?? null),
  title: z.string().min(1).max(512),
  includeRedacted: z.boolean().default(false),
  previousBundleId: z.string().length(26).nullable().optional().transform((v) => v ?? null),
});

const AddArtifactBody = z.object({
  artifactType: z.enum([
    'Document', 'DocumentVersion', 'Email', 'EmailAttachment',
    'Clause', 'SiteDiaryEntry', 'RecordFlag', 'Variation', 'Claim',
  ]),
  artifactId: z.string().length(26),
  citationNote: z.string().max(512).nullable().optional().transform((v) => v ?? null),
  displayOrder: z.number().int().nonnegative().default(0),
});

const BuildForClaimBody = z.object({
  claimId: z.string().length(26),
  includeRedacted: z.boolean().default(false),
});

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/evidence-bundles')
@UseGuards(AuthGuard, ContractAccessGuard)
class EvidenceController {
  constructor(@Inject(EvidenceService) private readonly svc: EvidenceService) {}

  @Get()
  async list(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
  ): Promise<{ items: BundleRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    return { items: await this.svc.list(contractId) };
  }

  @Post()
  async create(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<BundleRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = CreateBundleBody.parse(rawBody);
    return this.svc.create(principal, contractId, body, requireCorrelationId());
  }

  @Post('from-claim')
  async buildForClaim(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('id') contractId: string,
    @Body() rawBody: unknown,
  ): Promise<BundleRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = BuildForClaimBody.parse(rawBody);
    return this.svc.buildForClaim(
      principal,
      contractId,
      body.claimId,
      body.includeRedacted,
      requireCorrelationId(),
    );
  }

  @Get(':bundleId/artifacts')
  async artifacts(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('bundleId') bundleId: string,
  ): Promise<{ items: BundleArtifactRow[] }> {
    requireRole(access, REGISTER_READ_ROLES);
    return { items: await this.svc.listArtifacts(bundleId) };
  }

  @Post(':bundleId/artifacts')
  async addArtifact(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('bundleId') bundleId: string,
    @Body() rawBody: unknown,
  ): Promise<BundleArtifactRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    const body = AddArtifactBody.parse(rawBody);
    return this.svc.addArtifact(principal, bundleId, body, requireCorrelationId());
  }

  @Post(':bundleId/build')
  async build(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('bundleId') bundleId: string,
  ): Promise<BundleRow> {
    requireRole(access, REGISTER_WRITE_ROLES);
    return this.svc.build(principal, bundleId, requireCorrelationId());
  }

  @Post(':bundleId/submitted-externally')
  async markSubmittedExternally(
    @GetPrincipal() principal: Principal,
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('bundleId') bundleId: string,
  ): Promise<BundleRow> {
    requireRole(access, ['Owner', 'Administrator']);
    return this.svc.markSubmittedExternally(principal, bundleId, requireCorrelationId());
  }
}

@Module({
  controllers: [EvidenceController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
