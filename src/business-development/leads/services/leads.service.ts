import { HttpStatus, Inject, Injectable, forwardRef } from '@nestjs/common';
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
import { OpportunitiesService } from '../../opportunities/services/opportunities.service';
import {
  CreateActivityDto,
  CreateLeadDto,
  UpdateLeadDto,
} from '../dto/lead.dto';
import { LEAD_TRANSITIONS, LeadStatus } from '../enums/lead-status.enum';
import { LeadActivity } from '../schemas/lead-activity.schema';
import { Lead } from '../schemas/lead.schema';
import { buildListQuery } from '../../common/list-query.util';

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Lead.name) private readonly model: Model<Lead>,
    @InjectModel(LeadActivity.name)
    private readonly activityModel: Model<LeadActivity>,
    private readonly numberingService: NumberingService,
    private readonly customFields: CustomFieldValidationService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => OpportunitiesService))
    private readonly opportunitiesService: OpportunitiesService,
  ) {}

  async create(dto: CreateLeadDto, user: AuthenticatedUser): Promise<Lead> {
    const customFields = await this.customFields.validate(
      BusinessModule.LEAD,
      dto.customFields,
    );
    const { number } = await this.numberingService.next(DocumentType.LEAD);
    const created = await this.model.create({
      tenantId: this.tenantId(),
      leadNumber: number,
      companyName: dto.companyName,
      contactPerson: dto.contactPerson,
      email: dto.email,
      phone: dto.phone,
      source: dto.source,
      description: dto.description,
      status: LeadStatus.NEW,
      assignedTo: dto.assignedTo
        ? new Types.ObjectId(dto.assignedTo)
        : undefined,
      owner: dto.owner
        ? new Types.ObjectId(dto.owner)
        : new Types.ObjectId(user.userId),
      estimatedValue: dto.estimatedValue,
      expectedCloseDate: dto.expectedCloseDate
        ? new Date(dto.expectedCloseDate)
        : undefined,
      customFields,
      createdBy: new Types.ObjectId(user.userId),
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.LEAD,
      entityType: 'Lead',
      entityId: created._id.toString(),
      after: { leadNumber: number, companyName: dto.companyName },
    });
    if (dto.assignedTo) {
      await this.notifyAssigned(dto.assignedTo, created._id.toString(), number);
    }
    return created.toObject();
  }

  async findAll(query: FilteredQueryDto) {
    const { filter, skip, limit, sort } = buildListQuery<Lead>(
      query,
      ['leadNumber', 'companyName', 'contactPerson', 'email'],
      ['createdAt', 'estimatedValue', 'status', 'leadNumber'],
    );
    const scoped = { ...filter, tenantId: this.tenantId() };
    const [items, total] = await Promise.all([
      this.model
        .find(scoped)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean<Lead[]>()
        .exec(),
      this.model.countDocuments(scoped).exec(),
    ]);
    return paginated(items, total, query.page, query.limit);
  }

  async findById(id: string): Promise<Lead> {
    const lead = await this.model
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<Lead>()
      .exec();
    if (!lead) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return lead;
  }

  async update(
    id: string,
    dto: UpdateLeadDto,
    user: AuthenticatedUser,
  ): Promise<Lead> {
    const current = await this.findById(id);
    const customFields = dto.customFields
      ? await this.customFields.validate(BusinessModule.LEAD, dto.customFields)
      : current.customFields;
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            ...dto,
            assignedTo: dto.assignedTo
              ? new Types.ObjectId(dto.assignedTo)
              : current.assignedTo,
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
      .lean<Lead>()
      .exec();
    if (!updated) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    await this.auditService.record({
      action: AuditAction.UPDATE,
      module: BusinessModule.LEAD,
      entityType: 'Lead',
      entityId: id,
      before: current,
      after: updated,
    });
    if (dto.assignedTo && dto.assignedTo !== current.assignedTo?.toString()) {
      await this.notifyAssigned(dto.assignedTo, id, updated.leadNumber);
    }
    return updated;
  }

  async remove(id: string, user: AuthenticatedUser): Promise<Lead> {
    const current = await this.findById(id);
    assertTransition(current.status, LeadStatus.CLOSED, {
      ...LEAD_TRANSITIONS,
      [LeadStatus.DISQUALIFIED]: [LeadStatus.CLOSED],
    });
    return this.changeStatus(id, LeadStatus.CLOSED, user, AuditAction.DELETE);
  }

  async qualify(id: string, user: AuthenticatedUser): Promise<Lead> {
    const current = await this.findById(id);
    assertTransition(current.status, LeadStatus.QUALIFIED, LEAD_TRANSITIONS);
    return this.changeStatus(
      id,
      LeadStatus.QUALIFIED,
      user,
      AuditAction.QUALIFY,
    );
  }

  async disqualify(
    id: string,
    user: AuthenticatedUser,
    reason?: string,
  ): Promise<Lead> {
    const current = await this.findById(id);
    assertTransition(current.status, LeadStatus.DISQUALIFIED, LEAD_TRANSITIONS);
    const updated = await this.changeStatus(
      id,
      LeadStatus.DISQUALIFIED,
      user,
      AuditAction.DISQUALIFY,
    );
    if (reason) {
      await this.addActivity(id, { type: 'DISQUALIFY', note: reason }, user);
    }
    return updated;
  }

  async convert(id: string, user: AuthenticatedUser) {
    const lead = await this.findById(id);
    assertEquals(
      lead.status,
      LeadStatus.QUALIFIED,
      'Only a qualified lead can be converted',
    );
    const opportunity = await this.opportunitiesService.createFromLead(
      lead,
      user,
    );
    await this.changeStatus(
      id,
      LeadStatus.CONVERTED,
      user,
      AuditAction.CONVERT,
    );
    await this.auditService.record({
      action: AuditAction.CONVERT,
      module: BusinessModule.LEAD,
      entityType: 'Lead',
      entityId: id,
      after: {
        opportunityId: opportunity._id,
        opportunityNumber: opportunity.opportunityNumber,
      },
    });
    return { leadId: lead._id, opportunity };
  }

  async listActivities(leadId: string) {
    await this.findById(leadId);
    return this.activityModel
      .find({ tenantId: this.tenantId(), leadId: new Types.ObjectId(leadId) })
      .sort({ createdAt: -1 })
      .lean<LeadActivity[]>()
      .exec();
  }

  async addActivity(
    leadId: string,
    dto: CreateActivityDto,
    user: AuthenticatedUser,
  ) {
    await this.findById(leadId);
    const created = await this.activityModel.create({
      tenantId: this.tenantId(),
      leadId: new Types.ObjectId(leadId),
      type: dto.type,
      note: dto.note,
      createdBy: new Types.ObjectId(user.userId),
    });
    return created.toObject();
  }

  private async changeStatus(
    id: string,
    status: LeadStatus,
    user: AuthenticatedUser,
    action: AuditAction,
  ): Promise<Lead> {
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        { $set: { status, updatedBy: new Types.ObjectId(user.userId) } },
        { new: true },
      )
      .lean<Lead>()
      .exec();
    if (!updated) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    await this.auditService.record({
      action,
      module: BusinessModule.LEAD,
      entityType: 'Lead',
      entityId: id,
      after: { status },
    });
    return updated;
  }

  private async notifyAssigned(
    userId: string,
    leadId: string,
    leadNumber: string,
  ) {
    await this.notificationsService.notify({
      userIds: [userId],
      eventType: NotificationEventType.LEAD_ASSIGNED,
      title: `Lead assigned: ${leadNumber}`,
      body: `You were assigned lead ${leadNumber}`,
      entityType: 'Lead',
      entityId: leadId,
    });
  }

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }
}
