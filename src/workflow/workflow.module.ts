import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { SlaModule } from '../sla/sla.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { WorkflowController } from './controllers/workflow.controller';
import {
  ApprovalHistory,
  ApprovalHistorySchema,
} from './schemas/approval-history.schema';
import {
  WorkflowAction,
  WorkflowActionSchema,
} from './schemas/workflow-action.schema';
import {
  WorkflowDefinition,
  WorkflowDefinitionSchema,
} from './schemas/workflow-definition.schema';
import {
  WorkflowInstance,
  WorkflowInstanceSchema,
} from './schemas/workflow-instance.schema';
import { ApproverResolverService } from './services/approver-resolver.service';
import { WorkflowOutcomeRegistry } from './services/workflow-outcome.registry';
import { WorkflowService } from './services/workflow.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkflowDefinition.name, schema: WorkflowDefinitionSchema },
      { name: WorkflowInstance.name, schema: WorkflowInstanceSchema },
      { name: WorkflowAction.name, schema: WorkflowActionSchema },
      { name: ApprovalHistory.name, schema: ApprovalHistorySchema },
    ]),
    UsersModule,
    TenantsModule,
    SlaModule,
    NotificationsModule,
  ],
  controllers: [WorkflowController],
  providers: [
    WorkflowService,
    ApproverResolverService,
    WorkflowOutcomeRegistry,
  ],
  exports: [WorkflowService, WorkflowOutcomeRegistry],
})
export class WorkflowModule {}
