import { HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ErrorCodes } from '../../common/constants/error-codes';
import { SystemRole } from '../../common/constants/system-roles';
import { AppException } from '../../common/exceptions/app.exception';
import { TenantsService } from '../../tenants/services/tenants.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersRepository } from '../../users/repositories/users.repository';
import { ApproverType } from '../enums/workflow.enums';
import { WorkflowStep } from '../schemas/workflow-definition.schema';

export interface ResolvedApprover {
  userId?: string;
  role?: string;
}

@Injectable()
export class ApproverResolverService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly tenantsService: TenantsService,
  ) {}

  async resolve(
    step: WorkflowStep,
    context: Record<string, unknown>,
    tenantId: string,
  ): Promise<ResolvedApprover> {
    switch (step.approverType) {
      case ApproverType.USER:
        if (!step.approverUser) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            'Workflow step is missing a configured user',
            ErrorCodes.WORKFLOW_NOT_FOUND,
          );
        }
        return { userId: step.approverUser.toString() };
      case ApproverType.ROLE:
        return { role: step.approverRole };
      case ApproverType.MANAGER: {
        const managerId = this.asString(context.managerUserId);
        if (managerId) {
          return { userId: managerId };
        }
        const startedBy = this.asString(context.startedByUserId);
        if (startedBy) {
          const starter = await this.usersRepository.findById(startedBy);
          if (starter?.managerUserId) {
            return { userId: starter.managerUserId.toString() };
          }
        }
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Manager approver could not be resolved from workflow context',
          ErrorCodes.WORKFLOW_NOT_FOUND,
        );
      }
      case ApproverType.PROJECT_HEAD: {
        const projectHead = this.asString(context.projectHeadUserId);
        if (projectHead) {
          return { userId: projectHead };
        }
        const heads = await this.usersRepository.findMany({
          role: SystemRole.PROJECT_HEAD,
          status: UserStatus.ACTIVE,
        });
        if (heads[0]) {
          return {
            userId: heads[0]._id.toString(),
            role: SystemRole.PROJECT_HEAD,
          };
        }
        return { role: SystemRole.PROJECT_HEAD };
      }
      case ApproverType.CONFIGURED_USER: {
        if (step.approverUser) {
          return { userId: step.approverUser.toString() };
        }
        const tenant = await this.tenantsService.findByIdOrThrow(tenantId);
        const match = tenant.settings.approvalHierarchy.find((item) => {
          return (
            item.module === context.module || item.module === step.approverRole
          );
        });
        const configuredUser = this.asString(match?.userId);
        if (configuredUser) {
          return { userId: configuredUser };
        }
        const configuredRole =
          this.asString(match?.roleCode) ?? step.approverRole;
        if (configuredRole) {
          return { role: configuredRole };
        }
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Configured approver is not set on the tenant or workflow step',
          ErrorCodes.WORKFLOW_NOT_FOUND,
        );
      }
      default:
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Unsupported approver type',
          ErrorCodes.VALIDATION_ERROR,
        );
    }
  }

  async canAct(
    actor: { userId: string; role: string },
    resolved: ResolvedApprover,
  ): Promise<boolean> {
    if (resolved.userId && resolved.userId === actor.userId) {
      return true;
    }
    if (resolved.role && actor.role === resolved.role) {
      return true;
    }
    return false;
  }

  private asString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (value instanceof Types.ObjectId) {
      return value.toString();
    }
    return undefined;
  }
}
