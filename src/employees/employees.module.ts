import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProjectsModule } from '../projects/projects.module';
import { SitesModule } from '../sites/sites.module';
import { UsersModule } from '../users/users.module';
import { WorkflowModule } from '../workflow/workflow.module';
import {
  EmployeesController,
  SiteAssignmentsController,
} from './controllers/employees.controller';
import { SiteAccessController } from './controllers/site-access.controller';
import {
  EmployeeSiteAssignment,
  EmployeeSiteAssignmentSchema,
} from './schemas/employee-site-assignment.schema';
import { Employee, EmployeeSchema } from './schemas/employee.schema';
import {
  SiteAccessRequest,
  SiteAccessRequestSchema,
} from './schemas/site-access-request.schema';
import { EmployeesService } from './services/employees.service';
import { SiteAccessService } from './services/site-access.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      {
        name: EmployeeSiteAssignment.name,
        schema: EmployeeSiteAssignmentSchema,
      },
      { name: SiteAccessRequest.name, schema: SiteAccessRequestSchema },
    ]),
    NumberingModule,
    CustomFieldsModule,
    UsersModule,
    SitesModule,
    ProjectsModule,
    WorkflowModule,
    NotificationsModule,
    AuditModule,
  ],
  controllers: [
    EmployeesController,
    SiteAssignmentsController,
    SiteAccessController,
  ],
  providers: [EmployeesService, SiteAccessService],
  exports: [EmployeesService, MongooseModule],
})
export class EmployeesModule {}
