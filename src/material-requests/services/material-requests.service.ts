import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import {
  BusinessModule,
  DocumentType,
  WorkflowModule,
} from '../../common/constants/modules';
import { ErrorCodes } from '../../common/constants/error-codes';
import { SystemRole } from '../../common/constants/system-roles';
import { TenantContext } from '../../common/context/tenant.context';
import { FilteredQueryDto } from '../../common/dto/filtered-query.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { assertEquals } from '../../common/utils/status-transition';
import { BoqService } from '../../boq/services/boq.service';
import { BoqItem } from '../../boq/schemas/boq-item.schema';
import { CustomFieldValidationService } from '../../custom-fields/services/custom-field-validation.service';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NumberingService } from '../../numbering/services/numbering.service';
import { ProjectsService } from '../../projects/services/projects.service';
import { SiteStatus } from '../../sites/enums/site-status.enum';
import { SitesService } from '../../sites/services/sites.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersRepository } from '../../users/repositories/users.repository';
import { WorkflowInstanceStatus } from '../../workflow/enums/workflow.enums';
import {
  WorkflowOutcome,
  WorkflowOutcomeRegistry,
} from '../../workflow/services/workflow-outcome.registry';
import { WorkflowService } from '../../workflow/services/workflow.service';
import {
  CreateMaterialRequestDto,
  CreateMaterialRequestItemDto,
  UpdateMaterialRequestDto,
  UpdateMaterialRequestItemDto,
} from '../dto/material-request.dto';
import {
  ExceptionStatus,
  MaterialRequestStatus,
} from '../enums/material-request.enums';
import { MaterialRequestApproval } from '../schemas/material-request-approval.schema';
import { MaterialRequestItem } from '../schemas/material-request-item.schema';
import { MaterialRequest } from '../schemas/material-request.schema';
import { calculateBoqIncrease } from '../utils/exception-calculator';
import { MaterialRequestQuantityService } from './material-request-quantity.service';

const EDITABLE = [MaterialRequestStatus.DRAFT, MaterialRequestStatus.SEND_BACK];

@Injectable()
export class MaterialRequestsService implements OnModuleInit {
  constructor(
    @InjectModel(MaterialRequest.name)
    private readonly requests: Model<MaterialRequest>,
    @InjectModel(MaterialRequestItem.name)
    private readonly items: Model<MaterialRequestItem>,
    @InjectModel(MaterialRequestApproval.name)
    private readonly approvals: Model<MaterialRequestApproval>,
    @InjectModel(BoqItem.name) private readonly boqItems: Model<BoqItem>,
    private readonly projectsService: ProjectsService,
    private readonly sitesService: SitesService,
    private readonly boqService: BoqService,
    private readonly quantities: MaterialRequestQuantityService,
    private readonly numberingService: NumberingService,
    private readonly customFields: CustomFieldValidationService,
    private readonly workflowService: WorkflowService,
    private readonly outcomeRegistry: WorkflowOutcomeRegistry,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
    private readonly usersRepository: UsersRepository,
  ) {}

  onModuleInit(): void {
    this.outcomeRegistry.register((outcome) => this.onWorkflowOutcome(outcome));
  }

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }

  private missing(message: string): never {
    throw new AppException(HttpStatus.NOT_FOUND, message, ErrorCodes.NOT_FOUND);
  }

  async requireRequest(id: string): Promise<MaterialRequest> {
    const row = await this.requests
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<MaterialRequest>()
      .exec();
    if (!row) this.missing('Material request not found');
    return row;
  }

  async create(
    projectId: string,
    dto: CreateMaterialRequestDto,
    user: AuthenticatedUser,
  ) {
    const project = await this.projectsService.findById(projectId);
    const site = await this.sitesService.findById(dto.siteId);
    if (site.projectId.toString() !== project._id.toString()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Site does not belong to this project',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    if (site.status !== SiteStatus.ACTIVE) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Site is not active',
        ErrorCodes.INVALID_STATUS,
      );
    }
    const boq = await this.boqService.findApprovedForProject(projectId);
    const customFields = await this.customFields.validate(
      BusinessModule.MATERIAL_REQUEST,
      dto.customFields,
    );
    const allocated = await this.numberingService.next(DocumentType.MR);
    const created = await this.requests.create({
      tenantId: this.tenantId(),
      requestNumber: allocated.number,
      projectId: project._id,
      siteId: site._id,
      boqId: boq._id,
      requestDate: new Date(),
      requiredDate: new Date(dto.requiredDate),
      requestedBy: new Types.ObjectId(user.userId),
      remarks: dto.remarks,
      customFields,
      createdBy: new Types.ObjectId(user.userId),
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.MATERIAL_REQUEST,
      entityType: 'MaterialRequest',
      entityId: created._id.toString(),
      after: {
        requestNumber: created.requestNumber,
        projectId,
        siteId: dto.siteId,
      },
    });
    return created.toObject();
  }

  async listByProject(projectId: string, query: FilteredQueryDto) {
    await this.projectsService.findById(projectId);
    const filter: Record<string, unknown> = {
      tenantId: this.tenantId(),
      projectId: new Types.ObjectId(projectId),
    };
    if (query.status) filter.status = query.status;
    const page = skipTake(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.requests
        .find(filter)
        .select({
          requestNumber: 1,
          status: 1,
          exceptionStatus: 1,
          exceptionPercentage: 1,
          siteId: 1,
          requiredDate: 1,
          createdAt: 1,
        })
        .sort({ createdAt: -1 })
        .skip(page.skip)
        .limit(page.limit)
        .lean()
        .exec(),
      this.requests.countDocuments(filter).exec(),
    ]);
    return paginated(data, total, query.page, query.limit);
  }

  get(id: string) {
    return this.requireRequest(id);
  }

  async update(
    id: string,
    dto: UpdateMaterialRequestDto,
    user: AuthenticatedUser,
  ) {
    const current = await this.requireRequest(id);
    assertEquals(current.status, EDITABLE, 'Material request cannot be edited');
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.MATERIAL_REQUEST,
          dto.customFields,
        )
      : current.customFields;
    return this.requests
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            requiredDate: dto.requiredDate
              ? new Date(dto.requiredDate)
              : current.requiredDate,
            remarks: dto.remarks ?? current.remarks,
            customFields,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  async cancel(id: string, user: AuthenticatedUser) {
    const current = await this.requireRequest(id);
    assertEquals(
      current.status,
      [
        ...EDITABLE,
        MaterialRequestStatus.PENDING_APPROVAL,
        MaterialRequestStatus.SUBMITTED,
      ],
      'Material request cannot be cancelled',
    );
    const updated = await this.requests
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId(), status: current.status },
        {
          $set: {
            status: MaterialRequestStatus.CANCELLED,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    await this.auditService.record({
      action: AuditAction.STATUS_CHANGE,
      module: BusinessModule.MATERIAL_REQUEST,
      entityType: 'MaterialRequest',
      entityId: id,
      after: { status: MaterialRequestStatus.CANCELLED },
    });
    return updated;
  }

  async listItems(id: string) {
    await this.requireRequest(id);
    return this.items
      .find({
        tenantId: this.tenantId(),
        materialRequestId: new Types.ObjectId(id),
      })
      .lean()
      .exec();
  }

  async addItem(id: string, dto: CreateMaterialRequestItemDto) {
    const request = await this.requireRequest(id);
    assertEquals(
      request.status,
      EDITABLE,
      'Items can only be changed before submission',
    );
    const boqItem = await this.loadBoqItem(request, dto.boqItemId);
    const customFields = await this.customFields.validate(
      BusinessModule.MATERIAL_REQUEST_ITEM,
      dto.customFields,
    );
    const created = await this.items.create({
      tenantId: this.tenantId(),
      materialRequestId: request._id,
      projectId: request.projectId,
      siteId: request.siteId,
      boqId: request.boqId,
      boqItemId: boqItem._id,
      materialId: boqItem.materialId,
      unitId: boqItem.unitId,
      boqQuantity: boqItem.quantity,
      previouslyApprovedQuantity: 0,
      currentRequestQuantity: dto.currentRequestQuantity,
      cumulativeQuantity: 0,
      increasePercentage: 0,
      remarks: dto.remarks,
      customFields,
    });
    return created.toObject();
  }

  async updateItem(
    id: string,
    itemId: string,
    dto: UpdateMaterialRequestItemDto,
  ) {
    const request = await this.requireRequest(id);
    assertEquals(
      request.status,
      EDITABLE,
      'Items can only be changed before submission',
    );
    const current = await this.items
      .findOne({
        _id: itemId,
        materialRequestId: id,
        tenantId: this.tenantId(),
      })
      .lean<MaterialRequestItem>()
      .exec();
    if (!current) this.missing('Material request item not found');
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.MATERIAL_REQUEST_ITEM,
          dto.customFields,
        )
      : current.customFields;
    return this.items
      .findOneAndUpdate(
        { _id: itemId, materialRequestId: id, tenantId: this.tenantId() },
        {
          $set: {
            currentRequestQuantity:
              dto.currentRequestQuantity ?? current.currentRequestQuantity,
            remarks: dto.remarks ?? current.remarks,
            customFields,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  async deleteItem(id: string, itemId: string) {
    const request = await this.requireRequest(id);
    assertEquals(
      request.status,
      EDITABLE,
      'Items can only be changed before submission',
    );
    const result = await this.items
      .deleteOne({
        _id: itemId,
        materialRequestId: id,
        tenantId: this.tenantId(),
      })
      .exec();
    if (result.deletedCount === 0)
      this.missing('Material request item not found');
    return { deleted: true };
  }

  async submit(id: string, user: AuthenticatedUser) {
    const existing = await this.requireRequest(id);
    if (
      existing.status === MaterialRequestStatus.PENDING_APPROVAL &&
      existing.workflowInstanceId
    ) {
      return existing;
    }
    const locked = await this.requests
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId(), status: { $in: EDITABLE } },
        { $set: { status: MaterialRequestStatus.UNDER_REVIEW } },
        { new: true },
      )
      .lean<MaterialRequest>()
      .exec();
    if (!locked) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Material request was already submitted',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    try {
      const calculated = await this.recalculate(locked);
      const project = await this.projectsService.findById(
        locked.projectId.toString(),
      );
      const instance = await this.workflowService.start(
        {
          module: WorkflowModule.MATERIAL_APPROVAL,
          entityType: 'MaterialRequest',
          entityId: locked._id.toString(),
          context: {
            projectId: locked.projectId.toString(),
            projectHeadUserId: project.projectHead?.toString(),
            exceptionStatus: calculated.exceptionStatus,
          },
        },
        user,
      );
      const updated = await this.requests
        .findOneAndUpdate(
          {
            _id: id,
            tenantId: this.tenantId(),
            status: MaterialRequestStatus.UNDER_REVIEW,
          },
          {
            $set: {
              status: MaterialRequestStatus.PENDING_APPROVAL,
              exceptionStatus: calculated.exceptionStatus,
              exceptionPercentage: calculated.exceptionPercentage,
              exceptionReason: calculated.exceptionReason,
              workflowInstanceId: instance._id,
              updatedBy: new Types.ObjectId(user.userId),
            },
          },
          { new: true },
        )
        .lean<MaterialRequest>()
        .exec();
      await this.auditService.record({
        action: AuditAction.SUBMIT,
        module: BusinessModule.MATERIAL_REQUEST,
        entityType: 'MaterialRequest',
        entityId: id,
        after: {
          status: MaterialRequestStatus.PENDING_APPROVAL,
          exceptionStatus: calculated.exceptionStatus,
          exceptionPercentage: calculated.exceptionPercentage,
        },
      });
      if (calculated.exceptionStatus === ExceptionStatus.EXCEPTION) {
        await this.auditService.record({
          action: AuditAction.STATUS_CHANGE,
          module: BusinessModule.MATERIAL_REQUEST,
          entityType: 'MaterialRequest',
          entityId: id,
          after: {
            event: 'EXCEPTION_DETECTED',
            exceptionPercentage: calculated.exceptionPercentage,
          },
        });
        await this.notifyRoles(
          [SystemRole.MD, SystemRole.DIRECTOR],
          NotificationEventType.MATERIAL_EXCEPTION,
          '30% BOQ exception',
          `${locked.requestNumber} exceeds the 30% cumulative BOQ increase (${calculated.exceptionPercentage}%). Project Head approval is required.`,
          id,
        );
      }
      await this.notifications.notify({
        userIds: [user.userId],
        eventType: NotificationEventType.MATERIAL_REQUEST_SUBMITTED,
        title: 'Material request submitted',
        body: `${locked.requestNumber} is pending approval`,
        entityType: 'MaterialRequest',
        entityId: id,
      });
      return updated;
    } catch (error) {
      await this.requests
        .updateOne(
          {
            _id: id,
            tenantId: this.tenantId(),
            status: MaterialRequestStatus.UNDER_REVIEW,
          },
          { $set: { status: MaterialRequestStatus.DRAFT } },
        )
        .exec();
      throw error;
    }
  }

  private async recalculate(request: MaterialRequest) {
    const rows = await this.items
      .find({ tenantId: this.tenantId(), materialRequestId: request._id })
      .lean<MaterialRequestItem[]>()
      .exec();
    if (rows.length === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Material request has no items',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const boq = await this.boqService.findApprovedForProject(
      request.projectId.toString(),
    );
    if (boq._id.toString() !== request.boqId.toString()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Material request is not linked to the active approved BOQ',
        ErrorCodes.BOQ_NOT_APPROVED,
      );
    }
    const site = await this.sitesService.findById(request.siteId.toString());
    if (
      site.projectId.toString() !== request.projectId.toString() ||
      site.status !== SiteStatus.ACTIVE
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Site is not valid for this request',
        ErrorCodes.INVALID_STATUS,
      );
    }
    const approved = await this.quantities.getPreviouslyApprovedQuantities(
      this.tenantId(),
      request.projectId,
      rows.map((row) => row.boqItemId),
      request._id,
    );
    let exception = false;
    let maxPercentage = 0;
    for (const row of rows) {
      const boqItem = await this.loadBoqItem(request, row.boqItemId.toString());
      const previouslyApprovedQuantity =
        approved.get(row.boqItemId.toString()) ?? 0;
      const result = calculateBoqIncrease(
        boqItem.quantity,
        previouslyApprovedQuantity,
        row.currentRequestQuantity,
      );
      if (result.exceptionStatus === 'EXCEPTION') exception = true;
      maxPercentage = Math.max(maxPercentage, result.increasePercentage);
      await this.items
        .updateOne(
          { _id: row._id, tenantId: this.tenantId() },
          {
            $set: {
              boqId: boq._id,
              materialId: boqItem.materialId,
              unitId: boqItem.unitId,
              boqQuantity: boqItem.quantity,
              previouslyApprovedQuantity,
              cumulativeQuantity: result.cumulativeQuantity,
              increasePercentage: result.increasePercentage,
            },
          },
        )
        .exec();
    }
    return {
      exceptionStatus: exception
        ? ExceptionStatus.EXCEPTION
        : ExceptionStatus.NORMAL,
      exceptionPercentage: maxPercentage,
      exceptionReason: exception
        ? 'Cumulative approved and current quantity exceeds 30% of the BOQ quantity'
        : undefined,
    };
  }

  private async loadBoqItem(
    request: MaterialRequest,
    boqItemId: string,
  ): Promise<BoqItem> {
    const item = await this.boqItems
      .findOne({
        _id: boqItemId,
        tenantId: this.tenantId(),
        boqId: request.boqId,
        projectId: request.projectId,
      })
      .lean<BoqItem>()
      .exec();
    if (!item) this.missing('BOQ item not found');
    return item;
  }

  private async notifyRoles(
    roles: string[],
    eventType: NotificationEventType,
    title: string,
    body: string,
    entityId: string,
  ) {
    const users = await this.usersRepository.findMany({
      role: { $in: roles },
      status: UserStatus.ACTIVE,
    });
    await this.notifications.notify({
      userIds: users.map((user) => user._id.toString()),
      eventType,
      title,
      body,
      entityType: 'MaterialRequest',
      entityId,
    });
  }

  private async onWorkflowOutcome(outcome: WorkflowOutcome): Promise<void> {
    if (outcome.entityType !== 'MaterialRequest') return;
    const current = await this.requireRequest(outcome.entityId).catch(
      () => null,
    );
    if (!current || current.status !== MaterialRequestStatus.PENDING_APPROVAL)
      return;

    let status = current.status;
    if (outcome.instanceStatus === WorkflowInstanceStatus.APPROVED)
      status = MaterialRequestStatus.APPROVED;
    if (outcome.instanceStatus === WorkflowInstanceStatus.REJECTED)
      status = MaterialRequestStatus.REJECTED;
    if (outcome.instanceStatus === WorkflowInstanceStatus.SENT_BACK)
      status = MaterialRequestStatus.SEND_BACK;
    if (status === current.status) return;

    const updated = await this.requests
      .findOneAndUpdate(
        {
          _id: current._id,
          tenantId: this.tenantId(),
          status: MaterialRequestStatus.PENDING_APPROVAL,
        },
        {
          $set: {
            status,
            ...(status === MaterialRequestStatus.REJECTED
              ? { rejectionReason: outcome.reason }
              : {}),
          },
        },
        { new: true },
      )
      .lean<MaterialRequest>()
      .exec();
    if (!updated) return;

    await this.approvals.create({
      tenantId: this.tenantId(),
      materialRequestId: current._id,
      action: outcome.action,
      actorUserId: new Types.ObjectId(outcome.actorUserId),
      reason: outcome.reason,
      instanceStatus: outcome.instanceStatus,
    });

    if (status === MaterialRequestStatus.APPROVED) {
      const rows = await this.items
        .find({ tenantId: this.tenantId(), materialRequestId: current._id })
        .select({ boqItemId: 1 })
        .lean<MaterialRequestItem[]>()
        .exec();
      const totals = await this.quantities.getPreviouslyApprovedQuantities(
        this.tenantId(),
        current.projectId,
        rows.map((row) => row.boqItemId),
      );
      await this.boqService.applyApprovedQuantities(
        current.projectId.toString(),
        totals,
      );
      await this.notifications.notify({
        userIds: [current.requestedBy.toString()],
        eventType: NotificationEventType.APPROVAL_APPROVED,
        title: 'Material request approved',
        body: `${current.requestNumber} was approved`,
        entityType: 'MaterialRequest',
        entityId: current._id.toString(),
      });
      await this.auditService.record({
        action: AuditAction.APPROVE,
        module: BusinessModule.MATERIAL_REQUEST,
        entityType: 'MaterialRequest',
        entityId: current._id.toString(),
        after: { status, exceptionStatus: current.exceptionStatus },
      });
      return;
    }

    if (status === MaterialRequestStatus.REJECTED) {
      await this.notifications.notify({
        userIds: [current.requestedBy.toString()],
        eventType: NotificationEventType.APPROVAL_REJECTED,
        title: 'Material request rejected',
        body: outcome.reason ?? `${current.requestNumber} was rejected`,
        entityType: 'MaterialRequest',
        entityId: current._id.toString(),
      });
      await this.notifyRoles(
        [SystemRole.SITE_ENGINEER, SystemRole.SITE_MANAGER],
        NotificationEventType.APPROVAL_REJECTED,
        'Material request rejected',
        `${current.requestNumber} was rejected. ${outcome.reason ?? ''}`,
        current._id.toString(),
      );
      await this.auditService.record({
        action: AuditAction.REJECT,
        module: BusinessModule.MATERIAL_REQUEST,
        entityType: 'MaterialRequest',
        entityId: current._id.toString(),
        after: { status, rejectionReason: outcome.reason },
      });
      return;
    }

    await this.notifications.notify({
      userIds: [current.requestedBy.toString()],
      eventType: NotificationEventType.SEND_BACK,
      title: 'Material request sent back',
      body: outcome.reason ?? `${current.requestNumber} was sent back`,
      entityType: 'MaterialRequest',
      entityId: current._id.toString(),
    });
    await this.auditService.record({
      action: AuditAction.SEND_BACK,
      module: BusinessModule.MATERIAL_REQUEST,
      entityType: 'MaterialRequest',
      entityId: current._id.toString(),
      after: { status, reason: outcome.reason },
    });
  }
}
