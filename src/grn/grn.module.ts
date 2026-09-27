import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProjectsModule } from '../projects/projects.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { GrnController } from './controllers/grn.controller';
import {
  GrnAttachment,
  GrnAttachmentSchema,
} from './schemas/grn-attachment.schema';
import { GrnItem, GrnItemSchema } from './schemas/grn-item.schema';
import { Grn, GrnSchema } from './schemas/grn.schema';
import { GrnQuantityService } from './services/grn-quantity.service';
import { GrnService } from './services/grn.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Grn.name, schema: GrnSchema },
      { name: GrnItem.name, schema: GrnItemSchema },
      { name: GrnAttachment.name, schema: GrnAttachmentSchema },
    ]),
    PurchaseOrdersModule,
    DeliveriesModule,
    ProjectsModule,
    TenantsModule,
    NumberingModule,
    WorkflowModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [GrnController],
  providers: [GrnService, GrnQuantityService],
  exports: [GrnService, GrnQuantityService, MongooseModule],
})
export class GrnModule {}
