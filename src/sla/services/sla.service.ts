import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { ErrorCodes } from '../../common/constants/error-codes';
import { TenantContext } from '../../common/context/tenant.context';
import { AppException } from '../../common/exceptions/app.exception';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { TenantsService } from '../../tenants/services/tenants.service';
import { UsersRepository } from '../../users/repositories/users.repository';
import {
  CreateCalendarDto,
  CreateHolidayDto,
  UpsertSlaConfigurationDto,
} from '../dto/sla.dto';
import { SlaInstanceStatus } from '../enums/sla-status.enum';
import { CalendarWindow } from '../interfaces/calendar-window.interface';
import { BusinessCalendar } from '../schemas/business-calendar.schema';
import { EscalationEvent } from '../schemas/escalation-event.schema';
import { Holiday } from '../schemas/holiday.schema';
import { SlaConfiguration } from '../schemas/sla-configuration.schema';
import { SlaInstance } from '../schemas/sla-instance.schema';
import { addWorkingHours } from '../utils/working-hours';

export interface StartSlaInput {
  module: string;
  entityType: string;
  entityId: string;
  hours?: number;
  workflowInstanceId?: string;
  startedAt?: Date;
}

@Injectable()
export class SlaService {
  constructor(
    @InjectModel(BusinessCalendar.name)
    private readonly calendarModel: Model<BusinessCalendar>,
    @InjectModel(Holiday.name) private readonly holidayModel: Model<Holiday>,
    @InjectModel(SlaConfiguration.name)
    private readonly configModel: Model<SlaConfiguration>,
    @InjectModel(SlaInstance.name)
    private readonly instanceModel: Model<SlaInstance>,
    @InjectModel(EscalationEvent.name)
    private readonly escalationModel: Model<EscalationEvent>,
    private readonly tenantsService: TenantsService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async createCalendar(dto: CreateCalendarDto): Promise<BusinessCalendar> {
    const tenantId = this.tenantObjectId();
    if (dto.isDefault !== false) {
      await this.calendarModel.updateMany(
        { tenantId },
        { $set: { isDefault: false } },
      );
    }
    const tenant = await this.tenantsService.findByIdOrThrow(
      TenantContext.requireTenantId(),
    );
    const created = await this.calendarModel.create({
      tenantId,
      name: dto.name,
      timezone: dto.timezone ?? tenant.settings.timezone,
      workingDays: dto.workingDays ?? tenant.settings.workingDays,
      workingStartTime:
        dto.workingStartTime ?? tenant.settings.workingStartTime,
      workingEndTime: dto.workingEndTime ?? tenant.settings.workingEndTime,
      isDefault: dto.isDefault ?? true,
    });
    return created.toObject();
  }

  async listCalendars(): Promise<BusinessCalendar[]> {
    return this.calendarModel
      .find({ tenantId: this.tenantObjectId() })
      .lean<BusinessCalendar[]>()
      .exec();
  }

  async addHoliday(dto: CreateHolidayDto): Promise<Holiday> {
    const created = await this.holidayModel.create({
      tenantId: this.tenantObjectId(),
      calendarId: new Types.ObjectId(dto.calendarId),
      date: dto.date,
      name: dto.name,
    });
    return created.toObject();
  }

  async upsertConfiguration(
    dto: UpsertSlaConfigurationDto,
  ): Promise<SlaConfiguration> {
    const tenantId = this.tenantObjectId();
    const updated = await this.configModel
      .findOneAndUpdate(
        { tenantId, module: dto.module.toUpperCase() },
        {
          $set: {
            hours: dto.hours,
            calendarId: dto.calendarId
              ? new Types.ObjectId(dto.calendarId)
              : undefined,
            escalateToRole: dto.escalateToRole,
            escalateToUser: dto.escalateToUser
              ? new Types.ObjectId(dto.escalateToUser)
              : undefined,
          },
        },
        { new: true, upsert: true },
      )
      .lean<SlaConfiguration>()
      .exec();
    return updated;
  }

  async getConfiguration(module: string): Promise<SlaConfiguration | null> {
    return this.configModel
      .findOne({
        tenantId: this.tenantObjectId(),
        module: module.toUpperCase(),
      })
      .lean<SlaConfiguration>()
      .exec();
  }

  async listConfigurations(): Promise<SlaConfiguration[]> {
    return this.configModel
      .find({ tenantId: this.tenantObjectId() })
      .lean<SlaConfiguration[]>()
      .exec();
  }

  async start(input: StartSlaInput): Promise<SlaInstance> {
    const tenantId = this.tenantObjectId();
    const { hours, calendar } = await this.resolveWindow(
      input.module,
      input.hours,
    );
    const startedAt = input.startedAt ?? new Date();
    const dueAt = addWorkingHours(startedAt, hours, calendar);
    const created = await this.instanceModel.create({
      tenantId,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      workflowInstanceId: input.workflowInstanceId
        ? new Types.ObjectId(input.workflowInstanceId)
        : undefined,
      hours,
      startedAt,
      dueAt,
      status: SlaInstanceStatus.PENDING,
    });
    return created.toObject();
  }

  async complete(entityType: string, entityId: string): Promise<void> {
    await this.instanceModel.updateMany(
      {
        tenantId: this.tenantObjectId(),
        entityType,
        entityId,
        status: SlaInstanceStatus.PENDING,
      },
      {
        $set: { status: SlaInstanceStatus.COMPLETED, completedAt: new Date() },
      },
    );
  }

  async calculateDueAt(module: string, hours: number, startedAt = new Date()) {
    const { calendar } = await this.resolveWindow(module, hours);
    return addWorkingHours(startedAt, hours, calendar);
  }

  async listInstances(status?: SlaInstanceStatus) {
    const filter: FilterQuery<SlaInstance> = {
      tenantId: this.tenantObjectId(),
    };
    if (status) filter.status = status;
    return this.instanceModel
      .find(filter)
      .sort({ dueAt: 1 })
      .lean<SlaInstance[]>()
      .exec();
  }

  async checkDueInstances(now = new Date()): Promise<number> {
    const due = await this.instanceModel
      .find({
        status: SlaInstanceStatus.PENDING,
        dueAt: { $lte: now },
      })
      .lean<SlaInstance[]>()
      .exec();
    for (const instance of due) {
      await this.breach(instance);
    }
    return due.length;
  }

  private async breach(instance: SlaInstance): Promise<void> {
    const updated = await this.instanceModel
      .findOneAndUpdate(
        { _id: instance._id, status: SlaInstanceStatus.PENDING },
        {
          $set: {
            status: SlaInstanceStatus.BREACHED,
            breachedAt: new Date(),
          },
        },
        { new: true },
      )
      .lean<SlaInstance>()
      .exec();
    if (!updated) {
      return;
    }

    const config = await this.configModel
      .findOne({ tenantId: instance.tenantId, module: instance.module })
      .lean<SlaConfiguration>()
      .exec();

    await this.escalationModel.create({
      tenantId: instance.tenantId,
      slaInstanceId: instance._id,
      module: instance.module,
      entityType: instance.entityType,
      entityId: instance.entityId,
      escalateToRole: config?.escalateToRole,
      escalateToUser: config?.escalateToUser,
    });

    await TenantContext.run(
      {
        tenantId: instance.tenantId.toString(),
        userId: null,
        role: null,
        permissions: [],
        isSuperAdmin: false,
      },
      async () => {
        const recipients = await this.resolveEscalationRecipients(config);
        if (recipients.length > 0) {
          await this.notificationsService.notify({
            tenantId: instance.tenantId.toString(),
            userIds: recipients,
            eventType: NotificationEventType.SLA_BREACH,
            title: `SLA breached: ${instance.module}`,
            body: `SLA for ${instance.entityType} ${instance.entityId} was due at ${instance.dueAt.toISOString()}`,
            entityType: instance.entityType,
            entityId: instance.entityId,
          });
        }
        await this.auditService.record({
          action: AuditAction.SLA_BREACH,
          module: instance.module,
          entityType: instance.entityType,
          entityId: instance.entityId,
          tenantId: instance.tenantId.toString(),
          after: { dueAt: instance.dueAt, slaInstanceId: instance._id },
        });
      },
    );
  }

  async resolveWindow(
    module: string,
    overrideHours?: number,
  ): Promise<{ hours: number; calendar: CalendarWindow }> {
    const tenantId = TenantContext.requireTenantId();
    const tenant = await this.tenantsService.findByIdOrThrow(tenantId);
    const config = await this.configModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        module: module.toUpperCase(),
      })
      .lean<SlaConfiguration>()
      .exec();
    const hours =
      overrideHours ??
      config?.hours ??
      tenant.settings.slaHoursByModule[module.toUpperCase()];
    if (!hours) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        `SLA hours are not configured for ${module}`,
        ErrorCodes.SLA_NOT_CONFIGURED,
      );
    }

    let calendarDoc: BusinessCalendar | null = null;
    if (config?.calendarId) {
      calendarDoc = await this.calendarModel
        .findOne({ _id: config.calendarId, tenantId: tenant._id })
        .lean<BusinessCalendar>()
        .exec();
    }
    if (!calendarDoc) {
      calendarDoc = await this.calendarModel
        .findOne({ tenantId: tenant._id, isDefault: true })
        .lean<BusinessCalendar>()
        .exec();
    }

    const holidays = calendarDoc
      ? (
          await this.holidayModel
            .find({ tenantId: tenant._id, calendarId: calendarDoc._id })
            .lean<Holiday[]>()
            .exec()
        ).map((holiday) => holiday.date)
      : [];

    return {
      hours,
      calendar: {
        timezone: calendarDoc?.timezone ?? tenant.settings.timezone,
        workingDays: calendarDoc?.workingDays ?? tenant.settings.workingDays,
        workingStartTime:
          calendarDoc?.workingStartTime ?? tenant.settings.workingStartTime,
        workingEndTime:
          calendarDoc?.workingEndTime ?? tenant.settings.workingEndTime,
        holidays,
      },
    };
  }

  private async resolveEscalationRecipients(
    config?: SlaConfiguration | null,
  ): Promise<string[]> {
    if (config?.escalateToUser) {
      return [config.escalateToUser.toString()];
    }
    if (config?.escalateToRole) {
      const users = await this.usersRepository.findMany({
        role: config.escalateToRole,
        status: 'ACTIVE',
      });
      return users.map((user) => user._id.toString());
    }
    return [];
  }

  private tenantObjectId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }
}
