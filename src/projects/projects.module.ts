import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ClientDecision,
  ClientDecisionSchema,
} from '../business-development/client-decisions/schemas/client-decision.schema';
import {
  Opportunity,
  OpportunitySchema,
} from '../business-development/opportunities/schemas/opportunity.schema';
import {
  Quotation,
  QuotationSchema,
} from '../business-development/quotations/schemas/quotation.schema';
import {
  Requirement,
  RequirementSchema,
} from '../business-development/requirements/schemas/requirement.schema';
import {
  Tender,
  TenderSchema,
} from '../business-development/tenders/schemas/tender.schema';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProjectsController } from './controllers/projects.controller';
import {
  ProjectMember,
  ProjectMemberSchema,
} from './schemas/project-member.schema';
import { Project, ProjectSchema } from './schemas/project.schema';
import { ProjectsService } from './services/projects.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: ProjectMember.name, schema: ProjectMemberSchema },
      { name: ClientDecision.name, schema: ClientDecisionSchema },
      { name: Quotation.name, schema: QuotationSchema },
      { name: Tender.name, schema: TenderSchema },
      { name: Opportunity.name, schema: OpportunitySchema },
      { name: Requirement.name, schema: RequirementSchema },
    ]),
    NumberingModule,
    CustomFieldsModule,
    NotificationsModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
