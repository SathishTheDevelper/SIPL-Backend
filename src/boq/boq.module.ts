import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { MaterialsModule } from '../materials/materials.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProjectsModule } from '../projects/projects.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { BoqController } from './controllers/boq.controller';
import { MaterialPlanningController } from './controllers/material-planning.controller';
import { BoqItem, BoqItemSchema } from './schemas/boq-item.schema';
import { BoqVersion, BoqVersionSchema } from './schemas/boq-version.schema';
import { Boq, BoqSchema } from './schemas/boq.schema';
import {
  MaterialPlanning,
  MaterialPlanningSchema,
} from './schemas/material-planning.schema';
import { BoqService } from './services/boq.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Boq.name, schema: BoqSchema },
      { name: BoqItem.name, schema: BoqItemSchema },
      { name: BoqVersion.name, schema: BoqVersionSchema },
      { name: MaterialPlanning.name, schema: MaterialPlanningSchema },
    ]),
    ProjectsModule,
    MaterialsModule,
    NumberingModule,
    CustomFieldsModule,
    WorkflowModule,
    NotificationsModule,
    AuditModule,
  ],
  controllers: [BoqController, MaterialPlanningController],
  providers: [BoqService],
  exports: [BoqService],
})
export class BoqModule {}
