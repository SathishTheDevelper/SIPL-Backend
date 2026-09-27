import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { ErrorCodes } from '../../common/constants/error-codes';
import { TenantContext } from '../../common/context/tenant.context';
import { AppException } from '../../common/exceptions/app.exception';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { SlaService } from '../../sla/services/sla.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersRepository } from '../../users/repositories/users.repository';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  CreateWorkflowDefinitionDto,
  StartWorkflowDto,
  WorkflowActDto,
} from '../dto/workflow.dto';
import {
  WorkflowActionType,
  WorkflowInstanceStatus,
  WorkflowStatus,
} from '../enums/workflow.enums';
import { ApprovalHistory } from '../schemas/approval-history.schema';
import { WorkflowAction } from '../schemas/workflow-action.schema';
import {
  WorkflowDefinition,
  WorkflowStep,
} from '../schemas/workflow-definition.schema';
import { WorkflowInstance } from '../schemas/workflow-instance.schema';
import { ApproverResolverService } from './approver-resolver.service';
import { WorkflowOutcomeRegistry } from './workflow-outcome.registry';

@Injectable()
export class WorkflowService {
  constructor(
    @InjectModel(WorkflowDefinition.name)
    private readonly definitionModel: Model<WorkflowDefinition>,
    @InjectModel(WorkflowInstance.name)
    private readonly instanceModel: Model<WorkflowInstance>,
    @InjectModel(WorkflowAction.name)
    private readonly actionModel: Model<WorkflowAction>,
    @InjectModel(ApprovalHistory.name)
    private readonly historyModel: Model<ApprovalHistory>,
    private readonly approverResolver: ApproverResolverService,
    private readonly slaService: SlaService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
    private readonly usersRepository: UsersRepository,
    private readonly outcomeRegistry: WorkflowOutcomeRegistry,
  ) {}

  async createDefinition(
    dto: CreateWorkflowDefinitionDto,
  ): Promise<WorkflowDefinition> {
    const tenantId = this.tenantId();
    const latest = await this.definitionModel
      .findOne({ tenantId, module: dto.module.toUpperCase() })
      .sort({ version: -1 })
      .lean<WorkflowDefinition>()
      .exec();
    const created = await this.definitionModel.create({
      tenantId,
      module: dto.module.toUpperCase(),
      name: dto.name,
      version: (latest?.version ?? 0) + 1,
      status: WorkflowStatus.DRAFT,
      steps: dto.steps.map((step) => ({
        ...step,
        approverUser: step.approverUser
          ? new Types.ObjectId(step.approverUser)
          : undefined,
        actions: step.actions ?? ['APPROVE', 'REJECT', 'SEND_BACK', 'ESCALATE'],
      })),
    });
    return created.toObject();
  }

  async activate(id: string): Promise<WorkflowDefinition> {
    const tenantId = this.tenantId();
    const definition = await this.definitionModel
      .findOne({ _id: id, tenantId })
      .lean<WorkflowDefinition>()
      .exec();
    if (!definition) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    await this.definitionModel.updateMany(
      { tenantId, module: definition.module, status: WorkflowStatus.ACTIVE },
      { $set: { status: WorkflowStatus.INACTIVE } },
    );
    const updated = await this.definitionModel
      .findOneAndUpdate(
        { _id: id, tenantId },
        { $set: { status: WorkflowStatus.ACTIVE } },
        { new: true },
      )
      .lean<WorkflowDefinition>()
      .exec();
    return updated!;
  }

  async listDefinitions(module?: string) {
    const filter: FilterQuery<WorkflowDefinition> = {
      tenantId: this.tenantId(),
    };
    if (module) filter.module = module.toUpperCase();
    return this.definitionModel
      .find(filter)
      .sort({ module: 1, version: -1 })
      .lean<WorkflowDefinition[]>()
      .exec();
  }

  async startIfConfigured(
    dto: StartWorkflowDto,
    user: AuthenticatedUser,
  ): Promise<WorkflowInstance | null> {
    const tenantId = this.tenantId();
    const definition = await this.definitionModel
      .findOne({
        tenantId,
        module: dto.module.toUpperCase(),
        status: WorkflowStatus.ACTIVE,
      })
      .lean<WorkflowDefinition>()
      .exec();
    if (!definition) {
      return null;
    }
    return this.start(dto, user);
  }

  async start(
    dto: StartWorkflowDto,
    user: AuthenticatedUser,
  ): Promise<WorkflowInstance> {
    const tenantId = this.tenantId();
    const definition = await this.definitionModel
      .findOne({
        tenantId,
        module: dto.module.toUpperCase(),
        status: WorkflowStatus.ACTIVE,
      })
      .sort({ version: -1 })
      .lean<WorkflowDefinition>()
      .exec();
    if (!definition) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        `No active workflow for ${dto.module}`,
        ErrorCodes.WORKFLOW_NOT_FOUND,
      );
    }

    const existing = await this.instanceModel
      .findOne({
        tenantId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        status: WorkflowInstanceStatus.IN_PROGRESS,
      })
      .lean<WorkflowInstance>()
      .exec();
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'An open workflow already exists for this record',
        ErrorCodes.CONFLICT,
      );
    }

    const firstStep = this.stepAt(definition, 1);
    const context = {
      ...(dto.context ?? {}),
      module: definition.module,
      startedByUserId: user.userId,
    };
    const approver = await this.approverResolver.resolve(
      firstStep,
      context,
      tenantId.toString(),
    );

    const created = await this.instanceModel.create({
      tenantId,
      definitionId: definition._id,
      module: definition.module,
      entityType: dto.entityType,
      entityId: dto.entityId,
      currentStep: 1,
      status: WorkflowInstanceStatus.IN_PROGRESS,
      currentApproverUserId: approver.userId
        ? new Types.ObjectId(approver.userId)
        : undefined,
      currentApproverRole: approver.role,
      startedBy: new Types.ObjectId(user.userId),
      context,
      version: 1,
    });

    await this.slaService.start({
      module: definition.module,
      entityType: dto.entityType,
      entityId: dto.entityId,
      hours: firstStep.slaHours,
      workflowInstanceId: created._id.toString(),
    });

    const recipientIds = await this.notifyRecipients(approver);
    await this.notificationsService.notify({
      userIds: recipientIds,
      eventType: NotificationEventType.APPROVAL_PENDING,
      title: `Approval pending: ${definition.name}`,
      body: `${definition.module} ${dto.entityType} ${dto.entityId} is waiting for your action`,
      entityType: dto.entityType,
      entityId: dto.entityId,
    });

    await this.auditService.record({
      action: AuditAction.CREATE,
      module: definition.module,
      entityType: 'WorkflowInstance',
      entityId: created._id.toString(),
      after: { entityType: dto.entityType, entityId: dto.entityId },
    });

    return created.toObject();
  }

  async act(
    instanceId: string,
    dto: WorkflowActDto,
    user: AuthenticatedUser,
  ): Promise<WorkflowInstance> {
    if (
      (dto.action === WorkflowActionType.REJECT ||
        dto.action === WorkflowActionType.SEND_BACK) &&
      !dto.reason?.trim()
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Reason is required for this action',
        ErrorCodes.REASON_REQUIRED,
      );
    }

    const tenantId = this.tenantId();
    const instance = await this.instanceModel
      .findOne({ _id: instanceId, tenantId })
      .lean<WorkflowInstance>()
      .exec();
    if (!instance) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    if (instance.status !== WorkflowInstanceStatus.IN_PROGRESS) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Workflow is no longer open',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }

    const definition = await this.definitionModel
      .findById(instance.definitionId)
      .lean<WorkflowDefinition>()
      .exec();
    if (!definition) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Workflow definition is missing',
        ErrorCodes.WORKFLOW_NOT_FOUND,
      );
    }

    const step = this.stepAt(definition, instance.currentStep);
    if (!step.actions.includes(dto.action)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Action is not allowed on this step',
        ErrorCodes.INVALID_TRANSITION,
      );
    }

    const resolved = await this.approverResolver.resolve(
      step,
      instance.context ?? {},
      tenantId.toString(),
    );
    const allowed = await this.approverResolver.canAct(
      { userId: user.userId, role: user.role },
      {
        userId: instance.currentApproverUserId?.toString() ?? resolved.userId,
        role: instance.currentApproverRole ?? resolved.role,
      },
    );
    if (!allowed) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'You are not the assigned approver',
        ErrorCodes.NOT_APPROVER,
      );
    }

    const next = await this.applyAction(definition, instance, dto.action);
    const claimed = await this.instanceModel
      .findOneAndUpdate(
        {
          _id: instance._id,
          tenantId,
          version: instance.version,
          status: WorkflowInstanceStatus.IN_PROGRESS,
        },
        {
          $inc: { version: 1 },
          $set: {
            status: next.status,
            currentStep: next.currentStep,
            currentApproverUserId: next.approverUserId
              ? new Types.ObjectId(next.approverUserId)
              : null,
            currentApproverRole: next.approverRole,
          },
        },
        { new: true },
      )
      .lean<WorkflowInstance>()
      .exec();

    if (!claimed) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'This approval was already processed',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }

    await this.actionModel.create({
      tenantId,
      instanceId: instance._id,
      action: dto.action,
      actorUserId: new Types.ObjectId(user.userId),
      fromStep: instance.currentStep,
      toStep: next.currentStep,
      reason: dto.reason,
    });

    await this.historyModel.create({
      tenantId,
      instanceId: instance._id,
      entityType: instance.entityType,
      entityId: instance.entityId,
      action: dto.action,
      actorUserId: new Types.ObjectId(user.userId),
      actorRole: user.role,
      fromStatus: instance.status,
      toStatus: next.status,
      reason: dto.reason,
      timestamp: new Date(),
    });

    await this.slaService.complete(instance.entityType, instance.entityId);
    if (next.status === WorkflowInstanceStatus.IN_PROGRESS) {
      const nextStep = this.stepAt(definition, next.currentStep);
      await this.slaService.start({
        module: instance.module,
        entityType: instance.entityType,
        entityId: instance.entityId,
        hours: nextStep.slaHours,
        workflowInstanceId: instance._id.toString(),
      });
    }

    await this.notifyAction(instance, next, dto.action);
    await this.auditService.record({
      action: this.auditAction(dto.action),
      module: instance.module,
      entityType: instance.entityType,
      entityId: instance.entityId,
      before: { status: instance.status, step: instance.currentStep },
      after: {
        status: next.status,
        step: next.currentStep,
        reason: dto.reason,
      },
    });

    await this.outcomeRegistry.emit({
      module: instance.module,
      entityType: instance.entityType,
      entityId: instance.entityId,
      action: dto.action,
      instanceStatus: next.status,
      reason: dto.reason,
      actorUserId: user.userId,
      instanceId: instance._id.toString(),
    });

    return claimed;
  }

  async inbox(user: AuthenticatedUser, query: PaginationQueryDto) {
    const tenantId = this.tenantId();
    const filter: FilterQuery<WorkflowInstance> = {
      tenantId,
      status: WorkflowInstanceStatus.IN_PROGRESS,
      $or: [
        { currentApproverUserId: new Types.ObjectId(user.userId) },
        { currentApproverRole: user.role },
      ],
    };
    const { skip, limit } = skipTake(query.page, query.limit);
    const [items, total] = await Promise.all([
      this.instanceModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<WorkflowInstance[]>()
        .exec(),
      this.instanceModel.countDocuments(filter).exec(),
    ]);
    return paginated(items, total, query.page, query.limit);
  }

  async getInstance(id: string) {
    const instance = await this.instanceModel
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<WorkflowInstance>()
      .exec();
    if (!instance) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    const history = await this.historyModel
      .find({ tenantId: this.tenantId(), instanceId: instance._id })
      .sort({ timestamp: 1 })
      .lean<ApprovalHistory[]>()
      .exec();
    return { ...instance, history };
  }

  private async applyAction(
    definition: WorkflowDefinition,
    instance: WorkflowInstance,
    action: WorkflowActionType,
  ): Promise<{
    status: WorkflowInstanceStatus;
    currentStep: number;
    approverUserId?: string;
    approverRole?: string;
  }> {
    if (action === WorkflowActionType.REJECT) {
      return {
        status: WorkflowInstanceStatus.REJECTED,
        currentStep: instance.currentStep,
      };
    }
    if (action === WorkflowActionType.SEND_BACK) {
      return {
        status: WorkflowInstanceStatus.SENT_BACK,
        currentStep: instance.currentStep,
      };
    }
    if (action === WorkflowActionType.ESCALATE) {
      const config = await this.slaService.getConfiguration(instance.module);
      if (!config?.escalateToRole && !config?.escalateToUser) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Escalation target is not configured for this module',
          ErrorCodes.SLA_NOT_CONFIGURED,
        );
      }
      return {
        status: WorkflowInstanceStatus.IN_PROGRESS,
        currentStep: instance.currentStep,
        approverUserId: config.escalateToUser?.toString(),
        approverRole: config.escalateToRole,
      };
    }

    const maxStep = Math.max(...definition.steps.map((step) => step.sequence));
    if (instance.currentStep >= maxStep) {
      return {
        status: WorkflowInstanceStatus.APPROVED,
        currentStep: instance.currentStep,
      };
    }
    const nextStep = this.stepAt(definition, instance.currentStep + 1);
    const approver = await this.approverResolver.resolve(
      nextStep,
      instance.context ?? {},
      instance.tenantId.toString(),
    );
    return {
      status: WorkflowInstanceStatus.IN_PROGRESS,
      currentStep: instance.currentStep + 1,
      approverUserId: approver.userId,
      approverRole: approver.role,
    };
  }

  private stepAt(
    definition: WorkflowDefinition,
    sequence: number,
  ): WorkflowStep {
    const step = definition.steps.find((item) => item.sequence === sequence);
    if (!step) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        `Workflow step ${sequence} is missing`,
        ErrorCodes.WORKFLOW_NOT_FOUND,
      );
    }
    return step;
  }

  private async notifyAction(
    instance: WorkflowInstance,
    next: { status: WorkflowInstanceStatus; currentStep: number },
    action: WorkflowActionType,
  ): Promise<void> {
    const event =
      action === WorkflowActionType.APPROVE
        ? NotificationEventType.APPROVAL_APPROVED
        : action === WorkflowActionType.REJECT
          ? NotificationEventType.APPROVAL_REJECTED
          : action === WorkflowActionType.SEND_BACK
            ? NotificationEventType.SEND_BACK
            : NotificationEventType.ESCALATED;
    await this.notificationsService.notify({
      userIds: [instance.startedBy.toString()],
      eventType: event,
      title: `Workflow ${action.toLowerCase()}`,
      body: `${instance.entityType} ${instance.entityId} is now ${next.status}`,
      entityType: instance.entityType,
      entityId: instance.entityId,
    });
  }

  private async notifyRecipients(approver: {
    userId?: string;
    role?: string;
  }): Promise<string[]> {
    if (approver.userId) {
      return [approver.userId];
    }
    if (approver.role) {
      const users = await this.usersRepository.findMany({
        role: approver.role,
        status: UserStatus.ACTIVE,
      });
      return users.map((user) => user._id.toString());
    }
    return [];
  }

  private auditAction(action: WorkflowActionType): AuditAction {
    if (action === WorkflowActionType.APPROVE) return AuditAction.APPROVE;
    if (action === WorkflowActionType.REJECT) return AuditAction.REJECT;
    if (action === WorkflowActionType.SEND_BACK) return AuditAction.SEND_BACK;
    return AuditAction.ESCALATE;
  }

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }
}
