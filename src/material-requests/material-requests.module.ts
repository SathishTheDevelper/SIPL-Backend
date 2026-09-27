import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { BoqModule } from '../boq/boq.module';
import { BoqItem, BoqItemSchema } from '../boq/schemas/boq-item.schema';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProjectsModule } from '../projects/projects.module';
import { SitesModule } from '../sites/sites.module';
import { UsersModule } from '../users/users.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { MaterialRequestsController } from './controllers/material-requests.controller';
import {
  MaterialRequestApproval,
  MaterialRequestApprovalSchema,
} from './schemas/material-request-approval.schema';
import {
  MaterialRequestItem,
  MaterialRequestItemSchema,
} from './schemas/material-request-item.schema';
import {
  MaterialRequest,
  MaterialRequestSchema,
} from './schemas/material-request.schema';
import { MaterialRequestQuantityService } from './services/material-request-quantity.service';
import { MaterialRequestsService } from './services/material-requests.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MaterialRequest.name, schema: MaterialRequestSchema },
      { name: MaterialRequestItem.name, schema: MaterialRequestItemSchema },
      {
        name: MaterialRequestApproval.name,
        schema: MaterialRequestApprovalSchema,
      },
      { name: BoqItem.name, schema: BoqItemSchema },
    ]),
    ProjectsModule,
    SitesModule,
    BoqModule,
    NumberingModule,
    CustomFieldsModule,
    WorkflowModule,
    NotificationsModule,
    AuditModule,
    UsersModule,
  ],
  controllers: [MaterialRequestsController],
  providers: [MaterialRequestsService, MaterialRequestQuantityService],
  exports: [MaterialRequestsService],
})
export class MaterialRequestsModule {}
