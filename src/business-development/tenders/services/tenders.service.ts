import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../../audit/enums/audit-action.enum';
import { AuditService } from '../../../audit/services/audit.service';
import {
  BusinessModule,
  DocumentType,
  WorkflowModule,
} from '../../../common/constants/modules';
import { ErrorCodes } from '../../../common/constants/error-codes';
import { TenantContext } from '../../../common/context/tenant.context';
import { FilteredQueryDto } from '../../../common/dto/filtered-query.dto';
import { AppException } from '../../../common/exceptions/app.exception';
import { paginated } from '../../../common/utils/pagination.util';
import { assertTransition } from '../../../common/utils/status-transition';
import { CustomFieldValidationService } from '../../../custom-fields/services/custom-field-validation.service';
import { NotificationEventType } from '../../../notifications/enums/notification.enums';
import { NotificationsService } from '../../../notifications/services/notifications.service';
import { NumberingService } from '../../../numbering/services/numbering.service';
import { WorkflowService } from '../../../workflow/services/workflow.service';
import { buildListQuery } from '../../common/list-query.util';
import {
  CreateTenderDto,
  LoseTenderDto,
  UpdateTenderDto,
} from '../dto/tender.dto';
import { TENDER_TRANSITIONS, TenderStatus } from '../enums/tender-status.enum';
import { Tender } from '../schemas/tender.schema';

@Injectable()
export class TendersService {
  constructor(
    @InjectModel(Tender.name) private readonly model: Model<Tender>,
    private readonly numberingService: NumberingService,
    private readonly customFields: CustomFieldValidationService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly workflowService: WorkflowService,
  ) {}

  async create(dto: CreateTenderDto, user: AuthenticatedUser): Promise<Tender> {
    this.assertDates(dto.issueDate, dto.submissionDate);
    const customFields = await this.customFields.validate(
      BusinessModule.TENDER,
      dto.customFields,
    );
    const { number } = await this.numberingService.next(DocumentType.TENDER);
    const created = await this.model.create({
      tenantId: this.tenantId(),
      tenderNumber: number,
      opportunityId: dto.opportunityId
        ? new Types.ObjectId(dto.opportunityId)
        : undefined,
      title: dto.title,
      clientName: dto.clientName,
      referenceNumber: dto.referenceNumber,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
      submissionDate: dto.submissionDate
        ? new Date(dto.submissionDate)
        : undefined,
      estimatedValue: dto.estimatedValue,
      description: dto.description,
      status: TenderStatus.DRAFT,
      assignedTo: dto.assignedTo
        ? new Types.ObjectId(dto.assignedTo)
        : undefined,
      owner: dto.owner
        ? new Types.ObjectId(dto.owner)
        : new Types.ObjectId(user.userId),
      customFields,
      createdBy: new Types.ObjectId(user.userId),
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.TENDER,
      entityType: 'Tender',
      entityId: created._id.toString(),
      after: { tenderNumber: number },
    });
    if (dto.assignedTo) {
      await this.notifyAssigned(dto.assignedTo, created._id.toString(), number);
    }
    return created.toObject();
  }

  async findAll(query: FilteredQueryDto) {
    const { filter, skip, limit, sort } = buildListQuery<Tender>(
      query,
      ['tenderNumber', 'title', 'clientName', 'referenceNumber'],
      ['createdAt', 'submissionDate', 'status', 'estimatedValue'],
    );
    const scoped = { ...filter, tenantId: this.tenantId() };
    const [items, total] = await Promise.all([
      this.model
        .find(scoped)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean<Tender[]>()
        .exec(),
      this.model.countDocuments(scoped).exec(),
    ]);
    return paginated(items, total, query.page, query.limit);
  }

  async findById(id: string): Promise<Tender> {
    const doc = await this.model
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

  async update(id: string, dto: UpdateTenderDto, user: AuthenticatedUser) {
    const current = await this.findById(id);
    this.assertDates(
      dto.issueDate ?? current.issueDate?.toISOString(),
      dto.submissionDate ?? current.submissionDate?.toISOString(),
    );
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.TENDER,
          dto.customFields,
        )
      : current.customFields;
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            ...dto,
            issueDate: dto.issueDate
              ? new Date(dto.issueDate)
              : current.issueDate,
            submissionDate: dto.submissionDate
              ? new Date(dto.submissionDate)
              : current.submissionDate,
            assignedTo: dto.assignedTo
              ? new Types.ObjectId(dto.assignedTo)
              : current.assignedTo,
            owner: dto.owner ? new Types.ObjectId(dto.owner) : current.owner,
            customFields,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Tender>()
      .exec();
    return updated!;
  }

  async submit(id: string, user: AuthenticatedUser) {
    const current = await this.findById(id);
    if (current.status === TenderStatus.CANCELLED) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'A cancelled tender cannot be submitted',
        ErrorCodes.INVALID_TRANSITION,
      );
    }
    assertTransition(
      current.status,
      TenderStatus.SUBMITTED,
      TENDER_TRANSITIONS,
    );
    const updated = await this.setStatus(
      id,
      TenderStatus.SUBMITTED,
      user,
      AuditAction.SUBMIT,
    );
    await this.workflowService.startIfConfigured(
      {
        module: WorkflowModule.TENDER_APPROVAL,
        entityType: 'Tender',
        entityId: id,
      },
      user,
    );
    const recipients = [
      current.owner?.toString(),
      current.assignedTo?.toString(),
    ].filter((value): value is string => Boolean(value));
    if (recipients.length) {
      await this.notificationsService.notify({
        userIds: recipients,
        eventType: NotificationEventType.TENDER_SUBMITTED,
        title: `Tender submitted: ${current.tenderNumber}`,
        body: `${current.title} was submitted`,
        entityType: 'Tender',
        entityId: id,
      });
    }
    return updated;
  }

  async win(id: string, user: AuthenticatedUser) {
    const current = await this.findById(id);
    assertTransition(current.status, TenderStatus.WON, TENDER_TRANSITIONS);
    return this.setStatus(id, TenderStatus.WON, user, AuditAction.WIN);
  }

  async lose(id: string, dto: LoseTenderDto, user: AuthenticatedUser) {
    const current = await this.findById(id);
    assertTransition(current.status, TenderStatus.LOST, TENDER_TRANSITIONS);
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            status: TenderStatus.LOST,
            lostReason: dto.lostReason,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Tender>()
      .exec();
    await this.auditService.record({
      action: AuditAction.LOSE,
      module: BusinessModule.TENDER,
      entityType: 'Tender',
      entityId: id,
      after: { lostReason: dto.lostReason },
    });
    return updated!;
  }

  async cancel(id: string, user: AuthenticatedUser) {
    const current = await this.findById(id);
    assertTransition(
      current.status,
      TenderStatus.CANCELLED,
      TENDER_TRANSITIONS,
    );
    return this.setStatus(
      id,
      TenderStatus.CANCELLED,
      user,
      AuditAction.STATUS_CHANGE,
    );
  }

  async markStatus(id: string, status: TenderStatus, session?: ClientSession) {
    await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        { $set: { status } },
        { session },
      )
      .exec();
  }

  async assertNotLost(tender: Tender): Promise<void> {
    if (
      tender.status === TenderStatus.LOST ||
      tender.status === TenderStatus.CANCELLED
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'A lost or cancelled tender cannot create an active project',
        ErrorCodes.PROJECT_NOT_ALLOWED,
      );
    }
  }

  private async setStatus(
    id: string,
    status: TenderStatus,
    user: AuthenticatedUser,
    action: AuditAction,
  ) {
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        { $set: { status, updatedBy: new Types.ObjectId(user.userId) } },
        { new: true },
      )
      .lean<Tender>()
      .exec();
    await this.auditService.record({
      action,
      module: BusinessModule.TENDER,
      entityType: 'Tender',
      entityId: id,
      after: { status },
    });
    return updated!;
  }

  private assertDates(issueDate?: string, submissionDate?: string) {
    if (
      issueDate &&
      submissionDate &&
      new Date(submissionDate) < new Date(issueDate)
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Submission date cannot be before issue date',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
  }

  private async notifyAssigned(userId: string, id: string, number: string) {
    await this.notificationsService.notify({
      userIds: [userId],
      eventType: NotificationEventType.TENDER_ASSIGNED,
      title: `Tender assigned: ${number}`,
      body: `You were assigned tender ${number}`,
      entityType: 'Tender',
      entityId: id,
    });
  }

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }
}
