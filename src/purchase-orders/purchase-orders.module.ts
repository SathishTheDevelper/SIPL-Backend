import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { MaterialsModule } from '../materials/materials.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProjectsModule } from '../projects/projects.module';
import { SitesModule } from '../sites/sites.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { PurchaseOrderChargesController } from './controllers/purchase-order-charges.controller';
import { PurchaseOrderItemsController } from './controllers/purchase-order-items.controller';
import { PurchaseOrdersController } from './controllers/purchase-orders.controller';
import {
  PurchaseOrderApprovalReference,
  PurchaseOrderApprovalReferenceSchema,
} from './schemas/purchase-order-approval-reference.schema';
import {
  PurchaseOrderCharge,
  PurchaseOrderChargeSchema,
} from './schemas/purchase-order-charge.schema';
import {
  PurchaseOrderItem,
  PurchaseOrderItemSchema,
} from './schemas/purchase-order-item.schema';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from './schemas/purchase-order.schema';
import {
  ComparisonStatementSource,
  ComparisonStatementSourceSchema,
  ProcurementRequestSource,
  ProcurementRequestSourceSchema,
  PurchaseApprovalSource,
  PurchaseApprovalSourceSchema,
  VendorSelectionItemSource,
  VendorSelectionItemSourceSchema,
  VendorSelectionSource,
  VendorSelectionSourceSchema,
  VendorSource,
  VendorSourceSchema,
} from './schemas/upstream.schema';
import { PurchaseOrdersService } from './services/purchase-orders.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: PurchaseOrderItem.name, schema: PurchaseOrderItemSchema },
      { name: PurchaseOrderCharge.name, schema: PurchaseOrderChargeSchema },
      {
        name: PurchaseOrderApprovalReference.name,
        schema: PurchaseOrderApprovalReferenceSchema,
      },
      {
        name: PurchaseApprovalSource.name,
        schema: PurchaseApprovalSourceSchema,
      },
      { name: VendorSelectionSource.name, schema: VendorSelectionSourceSchema },
      {
        name: VendorSelectionItemSource.name,
        schema: VendorSelectionItemSourceSchema,
      },
      {
        name: ProcurementRequestSource.name,
        schema: ProcurementRequestSourceSchema,
      },
      {
        name: ComparisonStatementSource.name,
        schema: ComparisonStatementSourceSchema,
      },
      { name: VendorSource.name, schema: VendorSourceSchema },
    ]),
    ProjectsModule,
    SitesModule,
    MaterialsModule,
    TenantsModule,
    NumberingModule,
    CustomFieldsModule,
    WorkflowModule,
    NotificationsModule,
    AuditModule,
    UsersModule,
  ],
  controllers: [
    PurchaseOrdersController,
    PurchaseOrderItemsController,
    PurchaseOrderChargesController,
  ],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService, MongooseModule],
})
export class PurchaseOrdersModule {}
