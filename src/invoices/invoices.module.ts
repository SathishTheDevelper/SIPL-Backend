import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttachmentsModule } from '../attachments/attachments.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { GrnModule } from '../grn/grn.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProjectsModule } from '../projects/projects.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { SitesModule } from '../sites/sites.module';
import { SlaModule } from '../sla/sla.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { InvoiceMatchController } from './controllers/invoice-match.controller';
import { InvoiceController } from './controllers/invoice.controller';
import { InvoiceItem, InvoiceItemSchema } from './schemas/invoice-item.schema';
import {
  InvoiceMatchLock,
  InvoiceMatchLockSchema,
} from './schemas/invoice-match-lock.schema';
import {
  InvoiceMatchResult,
  InvoiceMatchResultSchema,
} from './schemas/invoice-match-result.schema';
import {
  InvoiceReference,
  InvoiceReferenceSchema,
} from './schemas/invoice-reference.schema';
import { Invoice, InvoiceSchema } from './schemas/invoice.schema';
import { InvoiceAccountsService } from './services/invoice-accounts.service';
import { InvoiceEventsService } from './services/invoice-events.service';
import { InvoiceMatchService } from './services/invoice-match.service';
import { InvoiceValidationService } from './services/invoice-validation.service';
import { InvoiceService } from './services/invoice.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: InvoiceItem.name, schema: InvoiceItemSchema },
      { name: InvoiceReference.name, schema: InvoiceReferenceSchema },
      { name: InvoiceMatchResult.name, schema: InvoiceMatchResultSchema },
      { name: InvoiceMatchLock.name, schema: InvoiceMatchLockSchema },
    ]),
    PurchaseOrdersModule,
    GrnModule,
    ProjectsModule,
    SitesModule,
    TenantsModule,
    NumberingModule,
    CustomFieldsModule,
    AttachmentsModule,
    WorkflowModule,
    NotificationsModule,
    SlaModule,
    UsersModule,
  ],
  controllers: [InvoiceController, InvoiceMatchController],
  providers: [
    InvoiceService,
    InvoiceMatchService,
    InvoiceValidationService,
    InvoiceAccountsService,
    InvoiceEventsService,
  ],
  exports: [InvoiceService, InvoiceMatchService],
})
export class InvoicesModule {}
