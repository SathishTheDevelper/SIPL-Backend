import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { BusinessModule, WorkflowModule } from '../../common/constants/modules';
import { ErrorCodes } from '../../common/constants/error-codes';
import { SystemRole } from '../../common/constants/system-roles';
import { TenantContext } from '../../common/context/tenant.context';
import { FilteredQueryDto } from '../../common/dto/filtered-query.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { CustomFieldValidationService } from '../../custom-fields/services/custom-field-validation.service';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { SitesService } from '../../sites/services/sites.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersRepository } from '../../users/repositories/users.repository';
import {
  WorkflowActionType,
  WorkflowInstanceStatus,
} from '../../workflow/enums/workflow.enums';
import {
  WorkflowOutcome,
  WorkflowOutcomeRegistry,
} from '../../workflow/services/workflow-outcome.registry';
import { WorkflowService } from '../../workflow/services/workflow.service';
import {
  CreateSiteAccessDto,
  SiteAccessDecisionDto,
} from '../dto/employee.dto';
import { AssignmentStatus, SiteAccessStatus } from '../enums/employee.enums';
import { EmployeeSiteAssignment } from '../schemas/employee-site-assignment.schema';
import { SiteAccessRequest } from '../schemas/site-access-request.schema';
import { EmployeesService } from './employees.service';

@Injectable()
export class SiteAccessService implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(SiteAccessRequest.name)
    private readonly requests: Model<SiteAccessRequest>,
    @InjectModel(EmployeeSiteAssignment.name)
    private readonly assignments: Model<EmployeeSiteAssignment>,
    private readonly employeesService: EmployeesService,
    private readonly sitesService: SitesService,
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

  async requireRequest(id: string): Promise<SiteAccessRequest> {
    const row = await this.requests
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<SiteAccessRequest>()
      .exec();
    if (!row) this.missing('Site access request not found');
    return row;
  }

  async create(dto: CreateSiteAccessDto, user: AuthenticatedUser) {
    const employee = await this.employeesService.findByUser(user.userId);
    const site = await this.sitesService.findById(dto.requestedSiteId);
    const requestedFrom = new Date(dto.requestedFrom);
    const requestedTo = new Date(dto.requestedTo);
    if (requestedTo < requestedFrom) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'requestedTo cannot be before requestedFrom',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const customFields = await this.customFields.validate(
      BusinessModule.SITE_ACCESS_REQUEST,
      dto.customFields,
    );
    const created = await this.requests.create({
      tenantId: this.tenantId(),
      employeeId: employee._id,
      requestedSiteId: site._id,
      requestedProjectId: site.projectId,
      reason: dto.reason,
      requestedFrom,
      requestedTo,
      customFields,
      createdBy: new Types.ObjectId(user.userId),
    });
    const instance = await this.workflowService.start(
      {
        module: WorkflowModule.SITE_ACCESS,
        entityType: 'SiteAccessRequest',
        entityId: created._id.toString(),
        context: {
          projectId: site.projectId.toString(),
          approverRole: SystemRole.HR,
        },
      },
      user,
    );
    const updated = await this.requests
      .findOneAndUpdate(
        { _id: created._id, tenantId: this.tenantId() },
        { $set: { workflowInstanceId: instance._id } },
        { new: true },
      )
      .lean<SiteAccessRequest>()
      .exec();
    const hr = await this.usersRepository.findMany({
      role: SystemRole.HR,
      status: UserStatus.ACTIVE,
    });
    await this.notifications.notify({
      userIds: hr.map((person) => person._id.toString()),
      eventType: NotificationEventType.SITE_ACCESS_REQUESTED,
      title: 'Additional site access requested',
      body: `${employee.name} requested access to site ${site.code}`,
      entityType: 'SiteAccessRequest',
      entityId: created._id.toString(),
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.SITE_ACCESS_REQUEST,
      entityType: 'SiteAccessRequest',
      entityId: created._id.toString(),
      after: {
        siteId: site._id.toString(),
        employeeId: employee._id.toString(),
      },
    });
    return updated;
  }

  async list(query: FilteredQueryDto) {
    const filter: Record<string, unknown> = { tenantId: this.tenantId() };
    if (query.status) filter.status = query.status;
    const page = skipTake(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.requests
        .find(filter)
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

  async approve(
    id: string,
    dto: SiteAccessDecisionDto,
    user: AuthenticatedUser,
  ) {
    const current = await this.requireRequest(id);
    if (current.status === SiteAccessStatus.APPROVED) return current;
    if (!current.workflowInstanceId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Site access request has no workflow',
        ErrorCodes.WORKFLOW_NOT_FOUND,
      );
    }
    await this.workflowService.act(
      current.workflowInstanceId.toString(),
      { action: WorkflowActionType.APPROVE, reason: dto.reason },
      user,
    );
    return this.requireRequest(id);
  }

  async reject(
    id: string,
    dto: SiteAccessDecisionDto,
    user: AuthenticatedUser,
  ) {
    const current = await this.requireRequest(id);
    if (!current.workflowInstanceId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Site access request has no workflow',
        ErrorCodes.WORKFLOW_NOT_FOUND,
      );
    }
    await this.workflowService.act(
      current.workflowInstanceId.toString(),
      { action: WorkflowActionType.REJECT, reason: dto.reason },
      user,
    );
    return this.requireRequest(id);
  }

  async cancel(id: string, user: AuthenticatedUser) {
    const current = await this.requireRequest(id);
    const employee = await this.employeesService.findByUser(user.userId);
    if (employee._id.toString() !== current.employeeId.toString()) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Only the requesting employee can cancel',
        ErrorCodes.FORBIDDEN,
      );
    }
    if (current.status !== SiteAccessStatus.PENDING) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Request is no longer pending',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    return this.requests
      .findOneAndUpdate(
        {
          _id: id,
          tenantId: this.tenantId(),
          status: SiteAccessStatus.PENDING,
        },
        { $set: { status: SiteAccessStatus.CANCELLED } },
        { new: true },
      )
      .lean()
      .exec();
  }

  private async onWorkflowOutcome(outcome: WorkflowOutcome): Promise<void> {
    if (outcome.entityType !== 'SiteAccessRequest') return;
    const current = await this.requests
      .findOne({
        _id: outcome.entityId,
        tenantId: this.tenantId(),
        status: SiteAccessStatus.PENDING,
      })
      .lean<SiteAccessRequest>()
      .exec();
    if (!current) return;

    if (outcome.instanceStatus === WorkflowInstanceStatus.APPROVED) {
      await this.withTransaction(async (session) => {
        const assignment = await this.assignments.create(
          [
            {
              tenantId: this.tenantId(),
              employeeId: current.employeeId,
              siteId: current.requestedSiteId,
              projectId: current.requestedProjectId,
              validFrom: current.requestedFrom,
              validTo: current.requestedTo,
              status: AssignmentStatus.ACTIVE,
              assignedBy: new Types.ObjectId(outcome.actorUserId),
            },
          ],
          session ? { session } : undefined,
        );
        await this.requests
          .updateOne(
            {
              _id: current._id,
              tenantId: this.tenantId(),
              status: SiteAccessStatus.PENDING,
            },
            {
              $set: {
                status: SiteAccessStatus.APPROVED,
                approvedBy: new Types.ObjectId(outcome.actorUserId),
                approvedAt: new Date(),
                assignmentId: assignment[0]?._id,
              },
            },
            session ? { session } : undefined,
          )
          .exec();
      });
      const employee = await this.employeesService.requireEmployee(
        current.employeeId.toString(),
      );
      if (employee.userId) {
        await this.notifications.notify({
          userIds: [employee.userId.toString()],
          eventType: NotificationEventType.SITE_ACCESS_DECIDED,
          title: 'Site access approved',
          body: 'Your additional site access was approved',
          entityType: 'SiteAccessRequest',
          entityId: current._id.toString(),
        });
      }
      await this.auditService.record({
        action: AuditAction.APPROVE,
        module: BusinessModule.SITE_ACCESS_REQUEST,
        entityType: 'SiteAccessRequest',
        entityId: current._id.toString(),
        after: { status: SiteAccessStatus.APPROVED },
      });
      return;
    }

    if (outcome.instanceStatus === WorkflowInstanceStatus.REJECTED) {
      await this.requests
        .updateOne(
          {
            _id: current._id,
            tenantId: this.tenantId(),
            status: SiteAccessStatus.PENDING,
          },
          {
            $set: {
              status: SiteAccessStatus.REJECTED,
              rejectedAt: new Date(),
              rejectionReason: outcome.reason,
            },
          },
        )
        .exec();
      const employee = await this.employeesService.requireEmployee(
        current.employeeId.toString(),
      );
      if (employee.userId) {
        await this.notifications.notify({
          userIds: [employee.userId.toString()],
          eventType: NotificationEventType.SITE_ACCESS_DECIDED,
          title: 'Site access rejected',
          body: outcome.reason ?? 'Your additional site access was rejected',
          entityType: 'SiteAccessRequest',
          entityId: current._id.toString(),
        });
      }
      await this.auditService.record({
        action: AuditAction.REJECT,
        module: BusinessModule.SITE_ACCESS_REQUEST,
        entityType: 'SiteAccessRequest',
        entityId: current._id.toString(),
        after: {
          status: SiteAccessStatus.REJECTED,
          rejectionReason: outcome.reason,
        },
      });
    }
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
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
