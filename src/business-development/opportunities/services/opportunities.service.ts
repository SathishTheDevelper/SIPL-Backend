import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../../audit/enums/audit-action.enum';
import { AuditService } from '../../../audit/services/audit.service';
import {
  BusinessModule,
  DocumentType,
} from '../../../common/constants/modules';
import { ErrorCodes } from '../../../common/constants/error-codes';
import { TenantContext } from '../../../common/context/tenant.context';
import { FilteredQueryDto } from '../../../common/dto/filtered-query.dto';
import { AppException } from '../../../common/exceptions/app.exception';
import { paginated } from '../../../common/utils/pagination.util';
import {
  assertEquals,
  assertTransition,
} from '../../../common/utils/status-transition';
import { CustomFieldValidationService } from '../../../custom-fields/services/custom-field-validation.service';
import { NotificationEventType } from '../../../notifications/enums/notification.enums';
import { NotificationsService } from '../../../notifications/services/notifications.service';
import { NumberingService } from '../../../numbering/services/numbering.service';
import { CreateActivityDto } from '../../leads/dto/lead.dto';
import { Lead } from '../../leads/schemas/lead.schema';
import { buildListQuery } from '../../common/list-query.util';
import {
  CreateOpportunityDto,
  LoseOpportunityDto,
  MoveStageDto,
  UpdateOpportunityDto,
} from '../dto/opportunity.dto';
import {
  OPPORTUNITY_STAGE_TRANSITIONS,
  OpportunityStage,
  OpportunityStatus,
} from '../enums/opportunity.enums';
import { OpportunityActivity } from '../schemas/opportunity-activity.schema';
import { Opportunity } from '../schemas/opportunity.schema';

@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectModel(Opportunity.name) private readonly model: Model<Opportunity>,
    @InjectModel(OpportunityActivity.name)
    private readonly activityModel: Model<OpportunityActivity>,
    private readonly numberingService: NumberingService,
    private readonly customFields: CustomFieldValidationService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    dto: CreateOpportunityDto,
    user: AuthenticatedUser,
  ): Promise<Opportunity> {
    const customFields = await this.customFields.validate(
      BusinessModule.OPPORTUNITY,
      dto.customFields,
    );
    const { number } = await this.numberingService.next(
      DocumentType.OPPORTUNITY,
    );
    const created = await this.model.create({
      tenantId: this.tenantId(),
      opportunityNumber: number,
      leadId: dto.leadId ? new Types.ObjectId(dto.leadId) : undefined,
      name: dto.name,
      clientName: dto.clientName,
      clientContact: dto.clientContact,
      description: dto.description,
      estimatedValue: dto.estimatedValue,
      probability: dto.probability,
      expectedCloseDate: dto.expectedCloseDate
        ? new Date(dto.expectedCloseDate)
        : undefined,
      stage: OpportunityStage.IDENTIFIED,
      owner: dto.owner
        ? new Types.ObjectId(dto.owner)
        : new Types.ObjectId(user.userId),
      status: OpportunityStatus.OPEN,
      customFields,
      createdBy: new Types.ObjectId(user.userId),
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.OPPORTUNITY,
      entityType: 'Opportunity',
      entityId: created._id.toString(),
      after: { opportunityNumber: number },
    });
    if (dto.owner) {
      await this.notifyAssigned(dto.owner, created._id.toString(), number);
    }
    return created.toObject();
  }

  async createFromLead(
    lead: Lead,
    user: AuthenticatedUser,
  ): Promise<Opportunity> {
    return this.create(
      {
        leadId: lead._id.toString(),
        name: lead.companyName,
        clientName: lead.companyName,
        clientContact: lead.contactPerson,
        estimatedValue: lead.estimatedValue,
        expectedCloseDate: lead.expectedCloseDate?.toISOString(),
        owner: lead.owner?.toString() ?? user.userId,
      },
      user,
    );
  }

  async findAll(query: FilteredQueryDto) {
    const { filter, skip, limit, sort } = buildListQuery<Opportunity>(
      query,
      ['opportunityNumber', 'name', 'clientName'],
      ['createdAt', 'estimatedValue', 'status', 'stage'],
    );
    const scoped = { ...filter, tenantId: this.tenantId() };
    const [items, total] = await Promise.all([
      this.model
        .find(scoped)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean<Opportunity[]>()
        .exec(),
      this.model.countDocuments(scoped).exec(),
    ]);
    return paginated(items, total, query.page, query.limit);
  }

  async findById(id: string): Promise<Opportunity> {
    const doc = await this.model
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

  async update(id: string, dto: UpdateOpportunityDto, user: AuthenticatedUser) {
    const current = await this.findById(id);
    assertEquals(
      current.status,
      OpportunityStatus.OPEN,
      'Closed opportunities cannot be edited',
    );
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.OPPORTUNITY,
          dto.customFields,
        )
      : current.customFields;
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            ...dto,
            owner: dto.owner ? new Types.ObjectId(dto.owner) : current.owner,
            expectedCloseDate: dto.expectedCloseDate
              ? new Date(dto.expectedCloseDate)
              : current.expectedCloseDate,
            customFields,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Opportunity>()
      .exec();
    return updated!;
  }

  async moveStage(id: string, dto: MoveStageDto, user: AuthenticatedUser) {
    const current = await this.findById(id);
    assertEquals(
      current.status,
      OpportunityStatus.OPEN,
      'Only open opportunities can change stage',
    );
    assertTransition(
      current.stage,
      dto.stage,
      OPPORTUNITY_STAGE_TRANSITIONS,
      'Invalid stage',
    );
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            stage: dto.stage,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Opportunity>()
      .exec();
    await this.auditService.record({
      action: AuditAction.STATUS_CHANGE,
      module: BusinessModule.OPPORTUNITY,
      entityType: 'Opportunity',
      entityId: id,
      before: { stage: current.stage },
      after: { stage: dto.stage },
    });
    return updated!;
  }

  async win(id: string, user: AuthenticatedUser) {
    const current = await this.findById(id);
    assertEquals(
      current.status,
      OpportunityStatus.OPEN,
      'Opportunity is not open',
    );
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            status: OpportunityStatus.WON,
            stage: OpportunityStage.DECISION,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Opportunity>()
      .exec();
    await this.auditService.record({
      action: AuditAction.WIN,
      module: BusinessModule.OPPORTUNITY,
      entityType: 'Opportunity',
      entityId: id,
    });
    return updated!;
  }

  async lose(id: string, dto: LoseOpportunityDto, user: AuthenticatedUser) {
    const current = await this.findById(id);
    assertEquals(
      current.status,
      OpportunityStatus.OPEN,
      'Opportunity is not open',
    );
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            status: OpportunityStatus.LOST,
            lostReason: dto.lostReason,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Opportunity>()
      .exec();
    await this.auditService.record({
      action: AuditAction.LOSE,
      module: BusinessModule.OPPORTUNITY,
      entityType: 'Opportunity',
      entityId: id,
      after: { lostReason: dto.lostReason },
    });
    return updated!;
  }

  async markStatus(
    id: string,
    status: OpportunityStatus,
    session?: import('mongoose').ClientSession,
  ) {
    await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        { $set: { status } },
        { session },
      )
      .exec();
  }

  async listActivities(opportunityId: string) {
    await this.findById(opportunityId);
    return this.activityModel
      .find({
        tenantId: this.tenantId(),
        opportunityId: new Types.ObjectId(opportunityId),
      })
      .sort({ createdAt: -1 })
      .lean<OpportunityActivity[]>()
      .exec();
  }

  async addActivity(
    opportunityId: string,
    dto: CreateActivityDto,
    user: AuthenticatedUser,
  ) {
    await this.findById(opportunityId);
    const created = await this.activityModel.create({
      tenantId: this.tenantId(),
      opportunityId: new Types.ObjectId(opportunityId),
      type: dto.type,
      note: dto.note,
      createdBy: new Types.ObjectId(user.userId),
    });
    return created.toObject();
  }

  private async notifyAssigned(userId: string, id: string, number: string) {
    await this.notificationsService.notify({
      userIds: [userId],
      eventType: NotificationEventType.OPPORTUNITY_ASSIGNED,
      title: `Opportunity assigned: ${number}`,
      body: `You were assigned opportunity ${number}`,
      entityType: 'Opportunity',
      entityId: id,
    });
  }

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }
}
