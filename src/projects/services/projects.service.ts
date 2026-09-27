import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { ClientDecisionType } from '../../business-development/client-decisions/enums/client-decision.enum';
import { ClientDecision } from '../../business-development/client-decisions/schemas/client-decision.schema';
import { OpportunityStatus } from '../../business-development/opportunities/enums/opportunity.enums';
import { Opportunity } from '../../business-development/opportunities/schemas/opportunity.schema';
import { QuotationStatus } from '../../business-development/quotations/enums/quotation-status.enum';
import { Quotation } from '../../business-development/quotations/schemas/quotation.schema';
import { ProjectType } from '../../business-development/requirements/enums/requirement.enums';
import { Requirement } from '../../business-development/requirements/schemas/requirement.schema';
import { TenderStatus } from '../../business-development/tenders/enums/tender-status.enum';
import { Tender } from '../../business-development/tenders/schemas/tender.schema';
import { BusinessModule, DocumentType } from '../../common/constants/modules';
import { ErrorCodes } from '../../common/constants/error-codes';
import { TenantContext } from '../../common/context/tenant.context';
import { FilteredQueryDto } from '../../common/dto/filtered-query.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { paginated } from '../../common/utils/pagination.util';
import { assertTransition } from '../../common/utils/status-transition';
import { CustomFieldValidationService } from '../../custom-fields/services/custom-field-validation.service';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NumberingService } from '../../numbering/services/numbering.service';
import { buildListQuery } from '../../business-development/common/list-query.util';
import {
  CreateProjectDto,
  CreateProjectMemberDto,
  UpdateProjectDto,
  UpdateProjectMemberDto,
} from '../dto/project.dto';
import {
  PROJECT_TRANSITIONS,
  ProjectMemberStatus,
  ProjectStatus,
} from '../enums/project.enums';
import { ProjectMember } from '../schemas/project-member.schema';
import { Project } from '../schemas/project.schema';

export interface WinProjectInput {
  decision: ClientDecision;
  quotation: Quotation;
  tender: Tender;
  opportunity?: Opportunity;
  requirement?: Requirement;
  name?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  projectHead?: string;
  projectManager?: string;
  remarks?: string;
  customFields?: Record<string, unknown>;
  user: AuthenticatedUser;
  session?: ClientSession;
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Project.name) private readonly model: Model<Project>,
    @InjectModel(ProjectMember.name)
    private readonly memberModel: Model<ProjectMember>,
    @InjectModel(ClientDecision.name)
    private readonly decisionModel: Model<ClientDecision>,
    @InjectModel(Quotation.name)
    private readonly quotationModel: Model<Quotation>,
    @InjectModel(Tender.name) private readonly tenderModel: Model<Tender>,
    @InjectModel(Opportunity.name)
    private readonly opportunityModel: Model<Opportunity>,
    @InjectModel(Requirement.name)
    private readonly requirementModel: Model<Requirement>,
    private readonly numberingService: NumberingService,
    private readonly customFields: CustomFieldValidationService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateProjectDto, user: AuthenticatedUser) {
    const decision = await this.decisionModel
      .findOne({ _id: dto.clientDecisionId, tenantId: this.tenantId() })
      .lean<ClientDecision>()
      .exec();
    if (!decision) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    if (decision.decision !== ClientDecisionType.WIN) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Only a WIN client decision can create a project',
        ErrorCodes.PROJECT_NOT_ALLOWED,
      );
    }
    const existing = await this.findByDecision(decision._id);
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'A project already exists for this WIN decision',
        ErrorCodes.DUPLICATE_WIN,
      );
    }
    const quotation = await this.requireQuotation(decision.quotationId);
    const tender = await this.requireTender(decision.tenderId);
    const opportunity = decision.opportunityId
      ? await this.requireOpportunity(decision.opportunityId)
      : undefined;
    const requirement = await this.requirementModel
      .findOne({ tenantId: this.tenantId(), tenderId: tender._id })
      .sort({ createdAt: -1 })
      .lean<Requirement>()
      .exec();
    return this.createFromWin({
      decision,
      quotation,
      tender,
      opportunity,
      requirement: requirement ?? undefined,
      name: dto.name,
      plannedStartDate: dto.plannedStartDate,
      plannedEndDate: dto.plannedEndDate,
      projectHead: dto.projectHead,
      projectManager: dto.projectManager,
      remarks: dto.remarks,
      customFields: dto.customFields,
      user,
    });
  }

  async createFromWin(input: WinProjectInput): Promise<Project> {
    const existing = await this.model
      .findOne({
        tenantId: this.tenantId(),
        $or: [
          { quotationId: input.quotation._id },
          { clientDecisionId: input.decision._id },
        ],
      })
      .lean<Project>()
      .exec();
    if (existing) {
      return existing;
    }

    const customFields = await this.customFields.validate(
      BusinessModule.PROJECT,
      input.customFields,
    );
    const run = async (session?: ClientSession) => {
      const { number } = await this.numberingService.next(
        DocumentType.PROJECT,
        session,
      );
      const [created] = await this.model.create(
        [
          {
            tenantId: this.tenantId(),
            projectNumber: number,
            name: input.name ?? input.tender.title,
            clientName: input.tender.clientName,
            tenderId: input.tender._id,
            opportunityId:
              input.opportunity?._id ?? input.quotation.opportunityId,
            quotationId: input.quotation._id,
            clientDecisionId: input.decision._id,
            projectType: input.requirement?.projectType ?? ProjectType.CIVIL,
            description:
              input.tender.description ?? input.requirement?.description,
            location: input.requirement?.location,
            plannedStartDate: input.plannedStartDate
              ? new Date(input.plannedStartDate)
              : input.requirement?.expectedStartDate,
            plannedEndDate: input.plannedEndDate
              ? new Date(input.plannedEndDate)
              : input.requirement?.expectedEndDate,
            projectHead: input.projectHead
              ? new Types.ObjectId(input.projectHead)
              : undefined,
            projectManager: input.projectManager
              ? new Types.ObjectId(input.projectManager)
              : undefined,
            status: ProjectStatus.PLANNING,
            budget: input.quotation.total,
            currency: input.quotation.currency,
            remarks: input.remarks,
            customFields,
            createdBy: new Types.ObjectId(input.user.userId),
          },
        ],
        session ? { session } : undefined,
      );
      await this.decisionModel
        .updateOne(
          { _id: input.decision._id, tenantId: this.tenantId() },
          { $set: { projectId: created._id } },
          { session },
        )
        .exec();
      await this.quotationModel
        .updateOne(
          { _id: input.quotation._id, tenantId: this.tenantId() },
          { $set: { status: QuotationStatus.ACCEPTED } },
          { session },
        )
        .exec();
      await this.tenderModel
        .updateOne(
          { _id: input.tender._id, tenantId: this.tenantId() },
          { $set: { status: TenderStatus.WON } },
          { session },
        )
        .exec();
      if (input.opportunity) {
        await this.opportunityModel
          .updateOne(
            { _id: input.opportunity._id, tenantId: this.tenantId() },
            { $set: { status: OpportunityStatus.WON } },
            { session },
          )
          .exec();
      }
      return created.toObject();
    };

    const project = input.session
      ? await run(input.session)
      : await this.withTransaction(run);

    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.PROJECT,
      entityType: 'Project',
      entityId: project._id.toString(),
      after: {
        projectNumber: project.projectNumber,
        tenderId: input.tender._id.toString(),
        quotationId: input.quotation._id.toString(),
        opportunityId: input.opportunity?._id?.toString(),
      },
    });
    const recipients = [
      input.user.userId,
      input.projectHead,
      input.tender.owner?.toString(),
    ].filter((value): value is string => Boolean(value));
    await this.notificationsService.notify({
      userIds: [...new Set(recipients)],
      eventType: NotificationEventType.PROJECT_CREATED,
      title: `Project created: ${project.projectNumber}`,
      body: `${project.name} was created from a WIN decision`,
      entityType: 'Project',
      entityId: project._id.toString(),
    });
    return project;
  }

  async findAll(query: FilteredQueryDto) {
    const { filter, skip, limit, sort } = buildListQuery<Project>(
      query,
      ['projectNumber', 'name', 'clientName'],
      ['createdAt', 'status', 'projectType', 'projectNumber'],
    );
    const scoped = { ...filter, tenantId: this.tenantId() };
    const [items, total] = await Promise.all([
      this.model
        .find(scoped)
        .select(
          'projectNumber name clientName projectType status location plannedStartDate plannedEndDate budget currency createdAt',
        )
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean<Project[]>()
        .exec(),
      this.model.countDocuments(scoped).exec(),
    ]);
    return paginated(items, total, query.page, query.limit);
  }

  async findById(id: string): Promise<Project> {
    const doc = await this.model
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<Project>()
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

  async findByDecision(decisionId: Types.ObjectId): Promise<Project | null> {
    return this.model
      .findOne({ tenantId: this.tenantId(), clientDecisionId: decisionId })
      .lean<Project>()
      .exec();
  }

  async update(id: string, dto: UpdateProjectDto, user: AuthenticatedUser) {
    const current = await this.findById(id);
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.PROJECT,
          dto.customFields,
        )
      : current.customFields;
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            name: dto.name ?? current.name,
            description: dto.description ?? current.description,
            location: dto.location ?? current.location,
            startDate: dto.startDate
              ? new Date(dto.startDate)
              : current.startDate,
            expectedEndDate: dto.expectedEndDate
              ? new Date(dto.expectedEndDate)
              : current.expectedEndDate,
            plannedStartDate: dto.plannedStartDate
              ? new Date(dto.plannedStartDate)
              : current.plannedStartDate,
            plannedEndDate: dto.plannedEndDate
              ? new Date(dto.plannedEndDate)
              : current.plannedEndDate,
            projectHead: dto.projectHead
              ? new Types.ObjectId(dto.projectHead)
              : current.projectHead,
            projectManager: dto.projectManager
              ? new Types.ObjectId(dto.projectManager)
              : current.projectManager,
            budget: dto.budget ?? current.budget,
            remarks: dto.remarks ?? current.remarks,
            projectType: dto.projectType ?? current.projectType,
            customFields,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Project>()
      .exec();
    return updated!;
  }

  async activate(id: string, user: AuthenticatedUser) {
    return this.changeStatus(id, ProjectStatus.ACTIVE, user);
  }

  async hold(id: string, user: AuthenticatedUser) {
    return this.changeStatus(id, ProjectStatus.ON_HOLD, user);
  }

  async complete(id: string, user: AuthenticatedUser) {
    const updated = await this.changeStatus(id, ProjectStatus.COMPLETED, user);
    await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        { $set: { actualEndDate: new Date() } },
      )
      .exec();
    return { ...updated, actualEndDate: new Date() };
  }

  async cancel(id: string, user: AuthenticatedUser) {
    return this.changeStatus(id, ProjectStatus.CANCELLED, user);
  }

  async summary() {
    const tenantId = this.tenantId();
    const rows = await this.model
      .aggregate<{ _id: ProjectStatus; count: number }>([
        { $match: { tenantId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .exec();
    const byStatus = Object.fromEntries(
      rows.map((row) => [row._id, row.count]),
    );
    return {
      totalProjects: rows.reduce((sum, row) => sum + row.count, 0),
      activeProjects: byStatus[ProjectStatus.ACTIVE] ?? 0,
      onHoldProjects: byStatus[ProjectStatus.ON_HOLD] ?? 0,
      completedProjects: byStatus[ProjectStatus.COMPLETED] ?? 0,
      closedProjects: byStatus[ProjectStatus.CLOSED] ?? 0,
    };
  }

  async listMembers(projectId: string) {
    await this.findById(projectId);
    return this.memberModel
      .find({
        tenantId: this.tenantId(),
        projectId: new Types.ObjectId(projectId),
      })
      .sort({ assignedAt: -1 })
      .lean<ProjectMember[]>()
      .exec();
  }

  async addMember(projectId: string, dto: CreateProjectMemberDto) {
    await this.findById(projectId);
    const created = await this.memberModel.create({
      tenantId: this.tenantId(),
      projectId: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(dto.userId),
      role: dto.role,
      isPrimary: dto.isPrimary ?? false,
      assignedAt: new Date(),
      status: ProjectMemberStatus.ACTIVE,
    });
    return created.toObject();
  }

  async updateMember(
    projectId: string,
    memberId: string,
    dto: UpdateProjectMemberDto,
  ) {
    await this.findById(projectId);
    const updated = await this.memberModel
      .findOneAndUpdate(
        {
          _id: memberId,
          projectId: new Types.ObjectId(projectId),
          tenantId: this.tenantId(),
        },
        { $set: dto },
        { new: true },
      )
      .lean<ProjectMember>()
      .exec();
    if (!updated) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return updated;
  }

  async removeMember(projectId: string, memberId: string) {
    await this.findById(projectId);
    const updated = await this.memberModel
      .findOneAndUpdate(
        {
          _id: memberId,
          projectId: new Types.ObjectId(projectId),
          tenantId: this.tenantId(),
        },
        {
          $set: { status: ProjectMemberStatus.REMOVED, removedAt: new Date() },
        },
        { new: true },
      )
      .lean<ProjectMember>()
      .exec();
    if (!updated) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return updated;
  }

  private async changeStatus(
    id: string,
    status: ProjectStatus,
    user: AuthenticatedUser,
  ) {
    const current = await this.findById(id);
    assertTransition(current.status, status, PROJECT_TRANSITIONS);
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        { $set: { status, updatedBy: new Types.ObjectId(user.userId) } },
        { new: true },
      )
      .lean<Project>()
      .exec();
    await this.auditService.record({
      action: AuditAction.STATUS_CHANGE,
      module: BusinessModule.PROJECT,
      entityType: 'Project',
      entityId: id,
      before: { status: current.status },
      after: { status },
    });
    const recipients = [
      updated?.projectHead?.toString(),
      updated?.projectManager?.toString(),
      user.userId,
    ].filter((value): value is string => Boolean(value));
    await this.notificationsService.notify({
      userIds: [...new Set(recipients)],
      eventType: NotificationEventType.PROJECT_STATUS_CHANGED,
      title: `Project ${updated!.projectNumber} is ${status}`,
      body: `${updated!.name} moved from ${current.status} to ${status}`,
      entityType: 'Project',
      entityId: id,
    });
    return updated!;
  }

  private async requireQuotation(id: Types.ObjectId) {
    const doc = await this.quotationModel
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<Quotation>()
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

  private async requireTender(id: Types.ObjectId) {
    const doc = await this.tenderModel
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<Tender>()
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

  private async requireOpportunity(id: Types.ObjectId) {
    const doc = await this.opportunityModel
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<Opportunity>()
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

  private async withTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      session.startTransaction();
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction().catch(() => undefined);
      if (this.isTransactionUnsupported(error)) {
        return fn(undefined as unknown as ClientSession);
      }
      if (this.isDuplicateKey(error)) {
        const recovered = await this.model
          .findOne({ tenantId: this.tenantId() })
          .sort({ createdAt: -1 })
          .lean<Project>()
          .exec();
        if (recovered) {
          return recovered as T;
        }
        throw new AppException(
          HttpStatus.CONFLICT,
          'A project already exists for this WIN decision',
          ErrorCodes.DUPLICATE_WIN,
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private isTransactionUnsupported(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('Transaction numbers are only allowed') ||
      message.includes('replica set')
    );
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }
}
