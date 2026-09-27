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
import { TenantContext } from '../../common/context/tenant.context';
import { AppException } from '../../common/exceptions/app.exception';
import {
  assertEquals,
  assertTransition,
} from '../../common/utils/status-transition';
import { CustomFieldValidationService } from '../../custom-fields/services/custom-field-validation.service';
import { MaterialsService } from '../../materials/services/materials.service';
import { NumberingService } from '../../numbering/services/numbering.service';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { ProjectStatus } from '../../projects/enums/project.enums';
import { ProjectsService } from '../../projects/services/projects.service';
import {
  WorkflowActionType,
  WorkflowInstanceStatus,
} from '../../workflow/enums/workflow.enums';
import { WorkflowOutcomeRegistry } from '../../workflow/services/workflow-outcome.registry';
import { WorkflowService } from '../../workflow/services/workflow.service';
import {
  BoqDecisionDto,
  CreateBoqDto,
  CreateBoqItemDto,
  CreatePlanningDto,
  UpdateBoqDto,
  UpdateBoqItemDto,
  UpdatePlanningDto,
} from '../dto/boq.dto';
import { BOQ_TRANSITIONS, BoqStatus, PlanningStatus } from '../enums/boq.enums';
import { BoqItem } from '../schemas/boq-item.schema';
import { BoqVersion } from '../schemas/boq-version.schema';
import { Boq } from '../schemas/boq.schema';
import { MaterialPlanning } from '../schemas/material-planning.schema';

const CLOSED_PROJECTS = [
  ProjectStatus.COMPLETED,
  ProjectStatus.CLOSED,
  ProjectStatus.CANCELLED,
];

@Injectable()
export class BoqService implements OnModuleInit {
  constructor(
    @InjectModel(Boq.name) private readonly boqs: Model<Boq>,
    @InjectModel(BoqItem.name) private readonly items: Model<BoqItem>,
    @InjectModel(BoqVersion.name) private readonly versions: Model<BoqVersion>,
    @InjectModel(MaterialPlanning.name)
    private readonly planning: Model<MaterialPlanning>,
    private readonly projectsService: ProjectsService,
    private readonly materialsService: MaterialsService,
    private readonly numberingService: NumberingService,
    private readonly customFields: CustomFieldValidationService,
    private readonly workflowService: WorkflowService,
    private readonly outcomeRegistry: WorkflowOutcomeRegistry,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
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

  async requireBoq(id: string): Promise<Boq> {
    const row = await this.boqs
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<Boq>()
      .exec();
    if (!row) this.missing('BOQ not found');
    return row;
  }

  async findApprovedForProject(projectId: string): Promise<Boq> {
    const row = await this.boqs
      .findOne({
        tenantId: this.tenantId(),
        projectId: new Types.ObjectId(projectId),
        status: BoqStatus.APPROVED,
      })
      .sort({ version: -1 })
      .lean<Boq>()
      .exec();
    if (!row) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'No approved BOQ is active for this project',
        ErrorCodes.BOQ_NOT_APPROVED,
      );
    }
    return row;
  }

  async requireItem(boqId: string, itemId: string): Promise<BoqItem> {
    const row = await this.items
      .findOne({
        _id: itemId,
        boqId: new Types.ObjectId(boqId),
        tenantId: this.tenantId(),
      })
      .lean<BoqItem>()
      .exec();
    if (!row) this.missing('BOQ item not found');
    return row;
  }

  private async assertOpenProject(projectId: string) {
    const project = await this.projectsService.findById(projectId);
    if (CLOSED_PROJECTS.includes(project.status)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Project cannot accept a BOQ in its current status',
        ErrorCodes.PROJECT_NOT_ALLOWED,
      );
    }
    return project;
  }

  async create(projectId: string, dto: CreateBoqDto, user: AuthenticatedUser) {
    const project = await this.assertOpenProject(projectId);
    const latest = await this.boqs
      .findOne({ tenantId: this.tenantId(), projectId: project._id })
      .sort({ version: -1 })
      .select({ version: 1 })
      .lean<{ version: number }>()
      .exec();
    const version = (latest?.version ?? 0) + 1;
    const customFields = await this.customFields.validate(
      BusinessModule.BOQ,
      dto.customFields,
    );
    const allocated = await this.numberingService.next(DocumentType.BOQ);
    const created = await this.boqs.create({
      tenantId: this.tenantId(),
      projectId: project._id,
      boqNumber: allocated.number,
      version,
      description: dto.description,
      customFields,
      totalAmount: 0,
      createdBy: new Types.ObjectId(user.userId),
    });
    await this.versions.create({
      tenantId: this.tenantId(),
      projectId: project._id,
      boqId: created._id,
      version,
      status: BoqStatus.DRAFT,
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.BOQ,
      entityType: 'BOQ',
      entityId: created._id.toString(),
      after: { version, boqNumber: created.boqNumber },
    });
    return created.toObject();
  }

  listByProject(projectId: string) {
    return this.boqs
      .find({
        tenantId: this.tenantId(),
        projectId: new Types.ObjectId(projectId),
      })
      .sort({ version: -1 })
      .lean()
      .exec();
  }

  get(id: string) {
    return this.requireBoq(id);
  }

  async update(id: string, dto: UpdateBoqDto, user: AuthenticatedUser) {
    const current = await this.requireBoq(id);
    assertEquals(
      current.status,
      BoqStatus.DRAFT,
      'Only a draft BOQ can be edited',
    );
    const customFields = dto.customFields
      ? await this.customFields.validate(BusinessModule.BOQ, dto.customFields)
      : current.customFields;
    return this.boqs
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            description: dto.description ?? current.description,
            customFields,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  async submit(id: string, user: AuthenticatedUser) {
    const current = await this.requireBoq(id);
    if (current.status === BoqStatus.SUBMITTED && current.workflowInstanceId) {
      return current;
    }
    assertTransition(current.status, BoqStatus.SUBMITTED, BOQ_TRANSITIONS);
    const count = await this.items
      .countDocuments({ tenantId: this.tenantId(), boqId: current._id })
      .exec();
    if (count === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'BOQ has no items',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const project = await this.projectsService.findById(
      current.projectId.toString(),
    );
    const instance = await this.workflowService.start(
      {
        module: WorkflowModule.BOQ_APPROVAL,
        entityType: 'BOQ',
        entityId: current._id.toString(),
        context: {
          projectId: current.projectId.toString(),
          projectHeadUserId: project.projectHead?.toString(),
        },
      },
      user,
    );
    const updated = await this.boqs
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId(), status: BoqStatus.DRAFT },
        {
          $set: {
            status: BoqStatus.SUBMITTED,
            workflowInstanceId: instance._id,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Boq>()
      .exec();
    if (!updated) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'BOQ was already submitted',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    await this.syncVersion(updated);
    await this.auditService.record({
      action: AuditAction.SUBMIT,
      module: BusinessModule.BOQ,
      entityType: 'BOQ',
      entityId: id,
      after: {
        status: BoqStatus.SUBMITTED,
        workflowInstanceId: instance._id.toString(),
      },
    });
    await this.notifications.notify({
      userIds: [user.userId],
      eventType: NotificationEventType.BOQ_SUBMITTED,
      title: 'BOQ submitted',
      body: `${updated.boqNumber} version ${updated.version} was submitted for approval`,
      entityType: 'BOQ',
      entityId: id,
    });
    return updated;
  }

  async approve(id: string, dto: BoqDecisionDto, user: AuthenticatedUser) {
    return this.decide(id, WorkflowActionType.APPROVE, dto.reason, user);
  }

  async reject(id: string, dto: BoqDecisionDto, user: AuthenticatedUser) {
    return this.decide(id, WorkflowActionType.REJECT, dto.reason, user);
  }

  private async decide(
    id: string,
    action: WorkflowActionType,
    reason: string | undefined,
    user: AuthenticatedUser,
  ) {
    const current = await this.requireBoq(id);
    assertEquals(
      current.status,
      BoqStatus.SUBMITTED,
      'Only a submitted BOQ can be actioned',
    );
    if (!current.workflowInstanceId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'BOQ has no workflow',
        ErrorCodes.WORKFLOW_NOT_FOUND,
      );
    }
    await this.workflowService.act(
      current.workflowInstanceId.toString(),
      { action, reason },
      user,
    );
    return this.requireBoq(id);
  }

  async revise(id: string, user: AuthenticatedUser) {
    const source = await this.requireBoq(id);
    assertEquals(
      source.status,
      [BoqStatus.APPROVED, BoqStatus.REJECTED],
      'Only an approved or rejected BOQ can be revised',
    );
    const latest = await this.boqs
      .findOne({ tenantId: this.tenantId(), projectId: source.projectId })
      .sort({ version: -1 })
      .select({ version: 1 })
      .lean<{ version: number }>()
      .exec();
    const version = (latest?.version ?? source.version) + 1;
    const allocated = await this.numberingService.next(DocumentType.BOQ);
    const created = await this.boqs.create({
      tenantId: this.tenantId(),
      projectId: source.projectId,
      boqNumber: allocated.number,
      version,
      description: source.description,
      customFields: source.customFields ?? {},
      totalAmount: source.totalAmount,
      revisedFromId: source._id,
      createdBy: new Types.ObjectId(user.userId),
    });
    const sourceItems = await this.items
      .find({ tenantId: this.tenantId(), boqId: source._id })
      .lean<BoqItem[]>()
      .exec();
    if (sourceItems.length > 0) {
      await this.items.insertMany(
        sourceItems.map((item) => ({
          tenantId: this.tenantId(),
          boqId: created._id,
          projectId: source.projectId,
          materialId: item.materialId,
          description: item.description,
          categoryId: item.categoryId,
          unitId: item.unitId,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
          remarks: item.remarks,
          customFields: item.customFields ?? {},
        })),
      );
    }
    await this.versions.create({
      tenantId: this.tenantId(),
      projectId: source.projectId,
      boqId: created._id,
      version,
      status: BoqStatus.DRAFT,
    });
    await this.auditService.record({
      action: AuditAction.REVISE,
      module: BusinessModule.BOQ,
      entityType: 'BOQ',
      entityId: created._id.toString(),
      after: { revisedFromId: source._id.toString(), version },
    });
    return created.toObject();
  }

  async listItems(boqId: string) {
    await this.requireBoq(boqId);
    return this.items
      .find({ tenantId: this.tenantId(), boqId: new Types.ObjectId(boqId) })
      .lean()
      .exec();
  }

  async addItem(boqId: string, dto: CreateBoqItemDto) {
    const boq = await this.requireBoq(boqId);
    assertEquals(
      boq.status,
      BoqStatus.DRAFT,
      'BOQ items can only be changed on a draft',
    );
    const material = await this.materialsService.requireMaterial(
      dto.materialId,
    );
    if (material.status !== 'ACTIVE') {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Material is not active',
        ErrorCodes.INVALID_STATUS,
      );
    }
    const customFields = await this.customFields.validate(
      BusinessModule.BOQ_ITEM,
      dto.customFields,
    );
    const amount = dto.quantity * dto.rate;
    const created = await this.items.create({
      tenantId: this.tenantId(),
      boqId: boq._id,
      projectId: boq.projectId,
      materialId: material._id,
      description: dto.description ?? material.name,
      categoryId: material.categoryId,
      unitId: material.unitId,
      quantity: dto.quantity,
      rate: dto.rate,
      amount,
      remarks: dto.remarks,
      customFields,
    });
    await this.refreshTotal(boq._id);
    return created.toObject();
  }

  async updateItem(boqId: string, itemId: string, dto: UpdateBoqItemDto) {
    const boq = await this.requireBoq(boqId);
    assertEquals(
      boq.status,
      BoqStatus.DRAFT,
      'BOQ items can only be changed on a draft',
    );
    const current = await this.requireItem(boqId, itemId);
    const quantity = dto.quantity ?? current.quantity;
    const rate = dto.rate ?? current.rate;
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.BOQ_ITEM,
          dto.customFields,
        )
      : current.customFields;
    const updated = await this.items
      .findOneAndUpdate(
        {
          _id: itemId,
          boqId: new Types.ObjectId(boqId),
          tenantId: this.tenantId(),
        },
        {
          $set: {
            description: dto.description ?? current.description,
            quantity,
            rate,
            amount: quantity * rate,
            remarks: dto.remarks ?? current.remarks,
            customFields,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    await this.refreshTotal(boq._id);
    return updated;
  }

  async deleteItem(boqId: string, itemId: string) {
    const boq = await this.requireBoq(boqId);
    assertEquals(
      boq.status,
      BoqStatus.DRAFT,
      'BOQ items can only be changed on a draft',
    );
    const result = await this.items
      .deleteOne({
        _id: itemId,
        boqId: new Types.ObjectId(boqId),
        tenantId: this.tenantId(),
      })
      .exec();
    if (result.deletedCount === 0) this.missing('BOQ item not found');
    await this.refreshTotal(boq._id);
    return { deleted: true };
  }

  async createPlanning(
    projectId: string,
    dto: CreatePlanningDto,
    user: AuthenticatedUser,
  ) {
    await this.assertOpenProject(projectId);
    const boq = await this.requireBoq(dto.boqId);
    if (
      boq.projectId.toString() !== projectId ||
      boq.status !== BoqStatus.APPROVED
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Planning must use the approved BOQ of this project',
        ErrorCodes.BOQ_NOT_APPROVED,
      );
    }
    const item = await this.requireItem(dto.boqId, dto.boqItemId);
    const created = await this.planning.create({
      tenantId: this.tenantId(),
      projectId: new Types.ObjectId(projectId),
      boqId: boq._id,
      boqItemId: item._id,
      materialId: item.materialId,
      plannedQuantity: dto.plannedQuantity,
      plannedDate: new Date(dto.plannedDate),
      remarks: dto.remarks,
      createdBy: new Types.ObjectId(user.userId),
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.BOQ,
      entityType: 'MaterialPlanning',
      entityId: created._id.toString(),
      after: {
        boqItemId: item._id.toString(),
        plannedQuantity: dto.plannedQuantity,
      },
    });
    return created.toObject();
  }

  listPlanning(projectId: string) {
    return this.planning
      .find({
        tenantId: this.tenantId(),
        projectId: new Types.ObjectId(projectId),
      })
      .sort({ plannedDate: 1 })
      .lean()
      .exec();
  }

  async getPlanning(id: string) {
    const row = await this.planning
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean()
      .exec();
    if (!row) this.missing('Material planning not found');
    return row;
  }

  async updatePlanning(id: string, dto: UpdatePlanningDto) {
    const current = await this.getPlanning(id);
    if (current.status === PlanningStatus.CLOSED) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Closed planning cannot be edited',
        ErrorCodes.INVALID_STATUS,
      );
    }
    return this.planning
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            plannedQuantity: dto.plannedQuantity ?? current.plannedQuantity,
            plannedDate: dto.plannedDate
              ? new Date(dto.plannedDate)
              : current.plannedDate,
            remarks: dto.remarks ?? current.remarks,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  async applyApprovedQuantities(
    projectId: string,
    approvedByItem: Map<string, number>,
  ) {
    const rows = await this.planning
      .find({
        tenantId: this.tenantId(),
        projectId: new Types.ObjectId(projectId),
      })
      .lean<MaterialPlanning[]>()
      .exec();
    for (const row of rows) {
      const approved = approvedByItem.get(row.boqItemId.toString()) ?? 0;
      let status = PlanningStatus.PLANNED;
      if (approved > 0 && approved < row.plannedQuantity)
        status = PlanningStatus.PARTIALLY_REQUESTED;
      if (approved >= row.plannedQuantity && row.plannedQuantity > 0)
        status = PlanningStatus.FULLY_REQUESTED;
      if (status !== row.status) {
        await this.planning
          .updateOne(
            { _id: row._id, tenantId: this.tenantId() },
            { $set: { status } },
          )
          .exec();
      }
    }
  }

  private async refreshTotal(boqId: Types.ObjectId) {
    const [sum] = await this.items
      .aggregate<{ total: number }>([
        { $match: { tenantId: this.tenantId(), boqId } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .exec();
    await this.boqs
      .updateOne(
        { _id: boqId, tenantId: this.tenantId() },
        { $set: { totalAmount: sum?.total ?? 0 } },
      )
      .exec();
  }

  private async syncVersion(boq: Boq) {
    await this.versions
      .updateOne(
        { tenantId: this.tenantId(), boqId: boq._id },
        { $set: { status: boq.status } },
      )
      .exec();
  }

  private async onWorkflowOutcome(outcome: {
    entityType: string;
    entityId: string;
    action: string;
    instanceStatus: string;
    reason?: string;
    actorUserId: string;
  }): Promise<void> {
    if (outcome.entityType !== 'BOQ') return;
    const current = await this.boqs
      .findOne({ _id: outcome.entityId, tenantId: this.tenantId() })
      .lean<Boq>()
      .exec();
    if (!current || current.status !== BoqStatus.SUBMITTED) return;

    if (outcome.instanceStatus === WorkflowInstanceStatus.APPROVED) {
      await this.boqs.updateMany(
        {
          tenantId: this.tenantId(),
          projectId: current.projectId,
          status: BoqStatus.APPROVED,
          _id: { $ne: current._id },
        },
        { $set: { status: BoqStatus.SUPERSEDED } },
      );
      await this.versions.updateMany(
        {
          tenantId: this.tenantId(),
          projectId: current.projectId,
          status: BoqStatus.APPROVED,
          boqId: { $ne: current._id },
        },
        { $set: { status: BoqStatus.SUPERSEDED, supersededBy: current._id } },
      );
      const approved = await this.boqs
        .findOneAndUpdate(
          {
            _id: current._id,
            tenantId: this.tenantId(),
            status: BoqStatus.SUBMITTED,
          },
          {
            $set: {
              status: BoqStatus.APPROVED,
              approvedAt: new Date(),
              approvedBy: new Types.ObjectId(outcome.actorUserId),
            },
          },
          { new: true },
        )
        .lean<Boq>()
        .exec();
      if (approved) await this.syncVersion(approved);
      await this.auditService.record({
        action: AuditAction.APPROVE,
        module: BusinessModule.BOQ,
        entityType: 'BOQ',
        entityId: current._id.toString(),
        after: { status: BoqStatus.APPROVED },
      });
      return;
    }

    if (outcome.instanceStatus === WorkflowInstanceStatus.REJECTED) {
      const rejected = await this.boqs
        .findOneAndUpdate(
          {
            _id: current._id,
            tenantId: this.tenantId(),
            status: BoqStatus.SUBMITTED,
          },
          { $set: { status: BoqStatus.REJECTED } },
          { new: true },
        )
        .lean<Boq>()
        .exec();
      if (rejected) await this.syncVersion(rejected);
      await this.auditService.record({
        action: AuditAction.REJECT,
        module: BusinessModule.BOQ,
        entityType: 'BOQ',
        entityId: current._id.toString(),
        after: { status: BoqStatus.REJECTED, reason: outcome.reason },
      });
      return;
    }

    if (outcome.instanceStatus === WorkflowInstanceStatus.SENT_BACK) {
      const draft = await this.boqs
        .findOneAndUpdate(
          {
            _id: current._id,
            tenantId: this.tenantId(),
            status: BoqStatus.SUBMITTED,
          },
          { $set: { status: BoqStatus.DRAFT, workflowInstanceId: undefined } },
          { new: true },
        )
        .lean<Boq>()
        .exec();
      if (draft) await this.syncVersion(draft);
    }
  }
}
