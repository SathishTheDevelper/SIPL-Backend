import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProjectsModule } from '../projects/projects.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ClientDecisionsController } from './client-decisions/controllers/client-decisions.controller';
import {
  ClientDecision,
  ClientDecisionSchema,
} from './client-decisions/schemas/client-decision.schema';
import { ClientDecisionsService } from './client-decisions/services/client-decisions.service';
import { BusinessDevelopmentController } from './controllers/business-development.controller';
import { LeadsController } from './leads/controllers/leads.controller';
import {
  LeadActivity,
  LeadActivitySchema,
} from './leads/schemas/lead-activity.schema';
import { Lead, LeadSchema } from './leads/schemas/lead.schema';
import { LeadsService } from './leads/services/leads.service';
import { OpportunitiesController } from './opportunities/controllers/opportunities.controller';
import {
  OpportunityActivity,
  OpportunityActivitySchema,
} from './opportunities/schemas/opportunity-activity.schema';
import {
  Opportunity,
  OpportunitySchema,
} from './opportunities/schemas/opportunity.schema';
import { OpportunitiesService } from './opportunities/services/opportunities.service';
import { QuotationsController } from './quotations/controllers/quotations.controller';
import {
  Quotation,
  QuotationSchema,
} from './quotations/schemas/quotation.schema';
import { QuotationsService } from './quotations/services/quotations.service';
import { RequirementsController } from './requirements/controllers/requirements.controller';
import {
  Requirement,
  RequirementSchema,
} from './requirements/schemas/requirement.schema';
import { RequirementsService } from './requirements/services/requirements.service';
import { BusinessDevelopmentSummaryService } from './services/business-development-summary.service';
import { TendersController } from './tenders/controllers/tenders.controller';
import {
  TenderRequirementReference,
  TenderRequirementReferenceSchema,
} from './tenders/schemas/tender-requirement-reference.schema';
import { Tender, TenderSchema } from './tenders/schemas/tender.schema';
import { TendersService } from './tenders/services/tenders.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: LeadActivity.name, schema: LeadActivitySchema },
      { name: Opportunity.name, schema: OpportunitySchema },
      { name: OpportunityActivity.name, schema: OpportunityActivitySchema },
      { name: Tender.name, schema: TenderSchema },
      {
        name: TenderRequirementReference.name,
        schema: TenderRequirementReferenceSchema,
      },
      { name: Requirement.name, schema: RequirementSchema },
      { name: Quotation.name, schema: QuotationSchema },
      { name: ClientDecision.name, schema: ClientDecisionSchema },
    ]),
    NumberingModule,
    CustomFieldsModule,
    NotificationsModule,
    WorkflowModule,
    ProjectsModule,
  ],
  controllers: [
    BusinessDevelopmentController,
    LeadsController,
    OpportunitiesController,
    TendersController,
    RequirementsController,
    QuotationsController,
    ClientDecisionsController,
  ],
  providers: [
    LeadsService,
    OpportunitiesService,
    TendersService,
    RequirementsService,
    QuotationsService,
    ClientDecisionsService,
    BusinessDevelopmentSummaryService,
  ],
  exports: [
    LeadsService,
    OpportunitiesService,
    TendersService,
    RequirementsService,
    QuotationsService,
    ClientDecisionsService,
  ],
})
export class BusinessDevelopmentModule {}
