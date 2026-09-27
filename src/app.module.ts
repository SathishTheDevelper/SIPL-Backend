import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NumberingModule } from './numbering/numbering.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RedisModule } from './redis/redis.module';
import { RolesModule } from './roles/roles.module';
import { SlaModule } from './sla/sla.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { BusinessDevelopmentModule } from './business-development/business-development.module';
import { ProjectsModule } from './projects/projects.module';
import { AttendanceModule } from './attendance/attendance.module';
import { BoqModule } from './boq/boq.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { EmployeesModule } from './employees/employees.module';
import { GrnModule } from './grn/grn.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MaterialRequestsModule } from './material-requests/material-requests.module';
import { MaterialsModule } from './materials/materials.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { SitesModule } from './sites/sites.module';
import { WorkflowModule } from './workflow/workflow.module';

const redisMemory = process.env.REDIS_MODE === 'memory';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level: configService.get<string>('logLevel', 'info'),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.body.password',
              'req.body.currentPassword',
              'req.body.newPassword',
              'req.body.refreshToken',
              'req.body.token',
              'req.body.SMTP_PASS',
            ],
            remove: true,
          },
          transport:
            configService.get<string>('nodeEnv') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, colorize: true },
                }
              : undefined,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('throttle.ttlMs', 60000),
            limit: configService.get<number>('throttle.limit', 100),
          },
        ],
      }),
    }),
    ...(redisMemory
      ? []
      : [
          BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              connection: {
                host: configService.get<string>('redis.host'),
                port: configService.get<number>('redis.port'),
                password: configService.get<string>('redis.password'),
                db: configService.get<number>('redis.db'),
              },
            }),
          }),
        ]),
    DatabaseModule,
    RedisModule,
    MailModule,
    AuditModule,
    TenantsModule,
    PermissionsModule,
    RolesModule,
    UsersModule,
    AuthModule,
    CustomFieldsModule,
    NumberingModule,
    NotificationsModule,
    SlaModule,
    WorkflowModule,
    BusinessDevelopmentModule,
    ProjectsModule,
    SitesModule,
    MaterialsModule,
    BoqModule,
    MaterialRequestsModule,
    EmployeesModule,
    AttendanceModule,
    PurchaseOrdersModule,
    DeliveriesModule,
    GrnModule,
    InvoicesModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
