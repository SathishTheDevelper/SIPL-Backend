import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttachmentsModule } from '../attachments/attachments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NumberingModule } from '../numbering/numbering.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { DeliveriesController } from './controllers/deliveries.controller';
import {
  DeliveryItem,
  DeliveryItemSchema,
} from './schemas/delivery-item.schema';
import { Delivery, DeliverySchema } from './schemas/delivery.schema';
import { DeliveriesService } from './services/deliveries.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Delivery.name, schema: DeliverySchema },
      { name: DeliveryItem.name, schema: DeliveryItemSchema },
    ]),
    PurchaseOrdersModule,
    AttachmentsModule,
    NumberingModule,
    TenantsModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService, MongooseModule],
})
export class DeliveriesModule {}
