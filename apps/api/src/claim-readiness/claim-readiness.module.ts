import {
  buildReadinessScore,
  type ClaimReadinessScore,
  type ReadinessInputs,
} from '@ckb/domain';
import { NotFoundError } from '@ckb/shared';
import {
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  UseGuards,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import mssql from 'mssql';
import { AuthGuard } from '../common/auth.guard.js';
import {
  ContractAccessGuard,
  requireRole,
  type ContractAccessDecision,
  type ContractAccessRequest,
} from '../common/contract-access.guard.js';
import { REGISTER_READ_ROLES } from '../common/register-helpers.js';
import { DB_POOL } from '../common/tokens.js';

/**
 * Claim Readiness Score (SOW §3.35, Slice FF).
 *
 * Reads cross-entity data for a claim and scores notice/evidence/timeline/
 * clause/quantum components. The pure scoring logic lives in
 * `@ckb/domain/claim-readiness.ts`; this service only gathers inputs.
 */
@Injectable()
export class ClaimReadinessService {
  constructor(@Inject(DB_POOL) private readonly pool: mssql.ConnectionPool) {}

  async compute(claimId: string): Promise<ClaimReadinessScore> {
    const claimR = await this.pool
      .request()
      .input('id', mssql.Char(26), claimId)
      .query<{
        id: string;
        contract_id: string;
        narrative: string | null;
        primary_clause_id: string | null;
        amount_claimed_cents: number | string | null;
        time_impact_days: number | null;
      }>(
        `SELECT id, contract_id, narrative, primary_clause_id,
                amount_claimed_cents, time_impact_days
           FROM claim WHERE id = @id`,
      );
    const claim = claimR.recordset[0];
    if (!claim) throw new NotFoundError('Claim not found');

    const [assertCountR, lowConfR, clauseLinkR, emailLinkR, docLinkR, diaryR, deadlinesR] =
      await Promise.all([
        this.pool
          .request()
          .input('claim_id', mssql.Char(26), claimId)
          .query<{ n: number }>(
            `SELECT COUNT(*) AS n FROM claim_assertion WHERE claim_id = @claim_id`,
          ),
        this.pool
          .request()
          .input('claim_id', mssql.Char(26), claimId)
          .query<{ n: number }>(
            `SELECT COUNT(*) AS n FROM claim_assertion WHERE claim_id = @claim_id AND confidence = 'low'`,
          ),
        this.pool
          .request()
          .input('claim_id', mssql.Char(26), claimId)
          .query<{ n: number }>(
            `SELECT COUNT(*) AS n FROM claim_clause_link WHERE claim_id = @claim_id`,
          ),
        this.pool
          .request()
          .input('claim_id', mssql.Char(26), claimId)
          .query<{ n: number }>(
            `SELECT COUNT(*) AS n FROM claim_email_link WHERE claim_id = @claim_id`,
          ),
        this.pool
          .request()
          .input('claim_id', mssql.Char(26), claimId)
          .query<{ n: number }>(
            `SELECT COUNT(*) AS n FROM claim_document_link WHERE claim_id = @claim_id`,
          ),
        // Diary links — via claim_assertion where cited_artifact_type='SiteDiaryEntry'
        this.pool
          .request()
          .input('claim_id', mssql.Char(26), claimId)
          .query<{ n: number }>(
            `SELECT COUNT(DISTINCT cited_artifact_id) AS n
               FROM claim_assertion
              WHERE claim_id = @claim_id AND cited_artifact_type = 'SiteDiaryEntry'`,
          ),
        // Notice obligations — deadlines whose clause source overlaps the claim's clauses.
        this.pool
          .request()
          .input('contract_id', mssql.Char(26), claim.contract_id)
          .input('claim_id', mssql.Char(26), claimId)
          .query<{
            total: number;
            missed: number;
            verified: number;
          }>(`
            SELECT
              SUM(CASE WHEN 1 = 1 THEN 1 ELSE 0 END) AS total,
              SUM(CASE WHEN d.lifecycle_state = 'Missed' THEN 1 ELSE 0 END) AS missed,
              SUM(CASE WHEN d.verification_state = 'Verified' THEN 1 ELSE 0 END) AS verified
              FROM deadline d
              JOIN claim_clause_link ccl ON ccl.clause_id = d.source_id AND d.source_type = 'Clause'
             WHERE d.contract_id = @contract_id AND ccl.claim_id = @claim_id;
          `),
      ]);

    const amountClaimed =
      claim.amount_claimed_cents === null
        ? null
        : typeof claim.amount_claimed_cents === 'number'
          ? claim.amount_claimed_cents
          : Number(claim.amount_claimed_cents);

    // Quantum evidence: documents + emails already counted as cited; treat
    // those as proxy for quote/invoice evidence. Precise categorisation is
    // a future enhancement (ASSUMPTION: Q-FF-1).
    const quantumEvidence = (docLinkR.recordset[0]?.n ?? 0) + (emailLinkR.recordset[0]?.n ?? 0);

    const inputs: ReadinessInputs = {
      claimId,
      hasNarrative: !!claim.narrative,
      hasPrimaryClause: !!claim.primary_clause_id,
      citedClauseCount: clauseLinkR.recordset[0]?.n ?? 0,
      citedEmailCount: emailLinkR.recordset[0]?.n ?? 0,
      citedDocumentCount: docLinkR.recordset[0]?.n ?? 0,
      citedDiaryCount: diaryR.recordset[0]?.n ?? 0,
      assertionCount: assertCountR.recordset[0]?.n ?? 0,
      assertionsWithLowConfidenceCount: lowConfR.recordset[0]?.n ?? 0,
      noticeDeadlinesTotal: deadlinesR.recordset[0]?.total ?? 0,
      noticeDeadlinesMissed: deadlinesR.recordset[0]?.missed ?? 0,
      noticeDeadlinesVerified: deadlinesR.recordset[0]?.verified ?? 0,
      amountClaimedCents: amountClaimed,
      timeImpactDays: claim.time_impact_days,
      quantumEvidenceCount: quantumEvidence,
    };

    return buildReadinessScore(inputs);
  }
}

const GetAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContractAccessDecision | undefined =>
    ctx.switchToHttp().getRequest<ContractAccessRequest>().access,
);

@Controller('api/contracts/:id/claims/:claimId/readiness')
@UseGuards(AuthGuard, ContractAccessGuard)
class ClaimReadinessController {
  constructor(@Inject(ClaimReadinessService) private readonly svc: ClaimReadinessService) {}

  @Get()
  async get(
    @GetAccess() access: ContractAccessDecision | undefined,
    @Param('claimId') claimId: string,
  ): Promise<ClaimReadinessScore> {
    requireRole(access, REGISTER_READ_ROLES);
    return this.svc.compute(claimId);
  }
}

@Module({
  controllers: [ClaimReadinessController],
  providers: [ClaimReadinessService],
  exports: [ClaimReadinessService],
})
export class ClaimReadinessModule {}
