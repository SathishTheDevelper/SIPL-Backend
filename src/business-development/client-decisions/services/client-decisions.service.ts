import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../../audit/enums/audit-action.enum';
import { AuditService } from '../../../audit/services/audit.service';
import { BusinessModule } from '../../../common/constants/modules';
import { ErrorCodes } from '../../../common/constants/error-codes';
import { TenantContext } from '../../../common/context/tenant.context';
import { AppException } from '../../../common/exceptions/app.exception';
import { NotificationEventType } from '../../../notifications/enums/notification.enums';
import { NotificationsService } from '../../../notifications/services/notifications.service';
import { OpportunityStatus } from '../../opportunities/enums/opportunity.enums';
import { Opportunity } from '../../opportunities/schemas/opportunity.schema';
import { OpportunitiesService } from '../../opportunities/services/opportunities.service';
import { QuotationStatus } from '../../quotations/enums/quotation-status.enum';
import { Quotation } from '../../quotations/schemas/quotation.schema';
import { QuotationsService } from '../../quotations/services/quotations.service';
import { Requirement } from '../../requirements/schemas/requirement.schema';
import { TenderStatus } from '../../tenders/enums/tender-status.enum';
import { Tender } from '../../tenders/schemas/tender.schema';
import { TendersService } from '../../tenders/services/tenders.service';
import { ProjectsService } from '../../../projects/services/projects.service';
import { RecordClientDecisionDto } from '../dto/client-decision.dto';
import { ClientDecisionType } from '../enums/client-decision.enum';
import { ClientDecision } from '../schemas/client-decision.schema';

@Injectable()
export class ClientDecisionsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(ClientDecision.name)
    private readonly model: Model<ClientDecision>,
    @InjectModel(Requirement.name)
    private readonly requirementModel: Model<Requirement>,
    private readonly quotationsService: QuotationsService,
    private readonly tendersService: TendersService,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly projectsService: ProjectsService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async record(
    quotationId: string,
    dto: RecordClientDecisionDto,
    user: AuthenticatedUser,
  ) {
    if (dto.decision === ClientDecisionType.LOSE && !dto.reason?.trim()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'A lost reason is required',
        ErrorCodes.REASON_REQUIRED,
      );
    }

    const quotation = await this.quotationsService.findById(quotationId);
    this.quotationsService.assertEligibleForDecision(quotation);
    const tender = await this.tendersService.findById(
      quotation.tenderId.toString(),
    );
    const opportunity = quotation.opportunityId
      ? await this.opportunitiesService.findById(
          quotation.opportunityId.toString(),
        )
      : undefined;
    if (dto.decision === ClientDecisionType.WIN) {
      await this.tendersService.assertNotLost(tender);
      if (opportunity?.status === OpportunityStatus.LOST) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'A lost opportunity cannot create an active project',
          ErrorCodes.PROJECT_NOT_ALLOWED,
        );
      }
    }

    const existing = await this.model
      .findOne({ tenantId: this.tenantId(), quotationId: quotation._id })
      .lean<ClientDecision>()
      .exec();
    if (existing) {
      if (
        existing.decision === ClientDecisionType.WIN &&
        dto.decision === ClientDecisionType.WIN
      ) {
        const project = existing.projectId
          ? await this.projectsService.findById(existing.projectId.toString())
          : await this.projectsService.findByDecision(existing._id);
        return {
          decision: existing,
          project: project ?? null,
          duplicate: true,
        };
      }
      throw new AppException(
        HttpStatus.CONFLICT,
        'A client decision already exists for this quotation',
        ErrorCodes.DUPLICATE_WIN,
      );
    }

    if (dto.decision === ClientDecisionType.LOSE) {
      return this.recordLose(quotation, tender, opportunity, dto, user);
    }
    return this.recordWin(quotation, tender, opportunity, dto, user);
  }

  async findById(id: string): Promise<ClientDecision> {
    const doc = await this.model
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<ClientDecision>()
      .exec();
    if (!doc) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return doc;
  }

  private async recordLose(
    quotation: Quotation,
    tender: Tender,
    opportunity: Opportunity | undefined,
    dto: RecordClientDecisionDto,
    user: AuthenticatedUser,
  ) {
    const created = await this.model.create({
      tenantId: this.tenantId(),
      quotationId: quotation._id,
      tenderId: tender._id,
      opportunityId: opportunity?._id,
      decision: ClientDecisionType.LOSE,
      decisionDate: dto.decisionDate ? new Date(dto.decisionDate) : new Date(),
      remarks: dto.remarks,
      reason: dto.reason,
      recordedBy: new Types.ObjectId(user.userId),
    });
    await this.quotationsService.markStatus(
      quotation._id.toString(),
      QuotationStatus.REJECTED,
    );
    await this.tendersService.markStatus(
      tender._id.toString(),
      TenderStatus.LOST,
    );
    if (opportunity) {
      await this.opportunitiesService.markStatus(
        opportunity._id.toString(),
        OpportunityStatus.LOST,
      );
    }
    await this.auditAndNotify(created.toObject(), user, null);
    return { decision: created.toObject(), project: null };
  }

  private async recordWin(
    quotation: Quotation,
    tender: Tender,
    opportunity: Opportunity | undefined,
    dto: RecordClientDecisionDto,
    user: AuthenticatedUser,
  ) {
    const requirement = await this.requirementModel
      .findOne({ tenantId: this.tenantId(), tenderId: tender._id })
      .sort({ createdAt: -1 })
      .lean<Requirement>()
      .exec();

    const execute = async (session?: ClientSession) => {
      const [created] = await this.model.create(
        [
          {
            tenantId: this.tenantId(),
            quotationId: quotation._id,
            tenderId: tender._id,
            opportunityId: opportunity?._id,
            decision: ClientDecisionType.WIN,
            decisionDate: dto.decisionDate
              ? new Date(dto.decisionDate)
              : new Date(),
            remarks: dto.remarks,
            reason: dto.reason,
            recordedBy: new Types.ObjectId(user.userId),
          },
        ],
        session ? { session } : undefined,
      );
      const decision = created.toObject();
      const project = await this.projectsService.createFromWin({
        decision,
        quotation,
        tender,
        opportunity,
        requirement: requirement ?? undefined,
        user,
        session,
      });
      if (session) {
        await this.model
          .updateOne(
            { _id: created._id, tenantId: this.tenantId() },
            { $set: { projectId: project._id } },
            { session },
          )
          .exec();
      }
      return { decision: { ...decision, projectId: project._id }, project };
    };

    const result = await this.withTransaction(execute);
    await this.auditAndNotify(
      result.decision,
      user,
      result.project._id.toString(),
    );
    return result;
  }

  private async auditAndNotify(
    decision: ClientDecision,
    user: AuthenticatedUser,
    projectId: string | null,
  ) {
    await this.auditService.record({
      action:
        decision.decision === ClientDecisionType.WIN
          ? AuditAction.WIN
          : AuditAction.LOSE,
      module: BusinessModule.QUOTATION,
      entityType: 'ClientDecision',
      entityId: decision._id.toString(),
      after: {
        decision: decision.decision,
        quotationId: decision.quotationId.toString(),
        tenderId: decision.tenderId.toString(),
        projectId,
        reason: decision.reason,
      },
    });
    await this.notificationsService.notify({
      userIds: [user.userId],
      eventType: NotificationEventType.CLIENT_DECISION,
      title: `Client decision: ${decision.decision}`,
      body:
        decision.decision === ClientDecisionType.WIN
          ? 'WIN recorded and project created'
          : `LOSE recorded: ${decision.reason ?? ''}`,
      entityType: 'ClientDecision',
      entityId: decision._id.toString(),
    });
  }

  private async withTransaction<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      session.startTransaction();
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction().catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('Transaction numbers are only allowed') ||
        message.includes('replica set')
      ) {
        return fn(undefined);
      }
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      ) {
        const existing = await this.model
          .findOne({ tenantId: this.tenantId() })
          .sort({ createdAt: -1 })
          .lean<ClientDecision>()
          .exec();
        if (existing?.projectId) {
          const project = await this.projectsService.findById(
            existing.projectId.toString(),
          );
          return { decision: existing, project } as T;
        }
        throw new AppException(
          HttpStatus.CONFLICT,
          'A client decision already exists for this quotation',
          ErrorCodes.DUPLICATE_WIN,
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }
}
