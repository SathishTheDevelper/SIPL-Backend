import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QUEUE_SLA } from '../common/constants/queues';
import { NotificationsModule } from '../notifications/notifications.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { SlaController } from './controllers/sla.controller';
import { SlaProcessor } from './processors/sla.processor';
import {
  BusinessCalendar,
  BusinessCalendarSchema,
} from './schemas/business-calendar.schema';
import {
  EscalationEvent,
  EscalationEventSchema,
} from './schemas/escalation-event.schema';
import { Holiday, HolidaySchema } from './schemas/holiday.schema';
import {
  SlaConfiguration,
  SlaConfigurationSchema,
} from './schemas/sla-configuration.schema';
import { SlaInstance, SlaInstanceSchema } from './schemas/sla-instance.schema';
import { SlaScheduler } from './services/sla.scheduler';
import { SlaService } from './services/sla.service';

const redisMemory = process.env.REDIS_MODE === 'memory';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BusinessCalendar.name, schema: BusinessCalendarSchema },
      { name: Holiday.name, schema: HolidaySchema },
      { name: SlaConfiguration.name, schema: SlaConfigurationSchema },
      { name: SlaInstance.name, schema: SlaInstanceSchema },
      { name: EscalationEvent.name, schema: EscalationEventSchema },
    ]),
    ...(redisMemory ? [] : [BullModule.registerQueue({ name: QUEUE_SLA })]),
    TenantsModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [SlaController],
  providers: redisMemory
    ? [SlaService]
    : [SlaService, SlaProcessor, SlaScheduler],
  exports: [SlaService],
})
export class SlaModule {}
