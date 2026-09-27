import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import {
  NOTIFICATION_JOB_SEND,
  QUEUE_NOTIFICATIONS,
} from '../../common/constants/queues';
import { TenantContext } from '../../common/context/tenant.context';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { MailService } from '../../mail/mail.service';
import { UsersRepository } from '../../users/repositories/users.repository';
import { UpdatePreferenceDto } from '../dto/notification.dto';
import {
  NotificationChannel,
  NotificationEventType,
} from '../enums/notification.enums';
import { NotificationPreference } from '../schemas/notification-preference.schema';
import { NotificationTemplate } from '../schemas/notification-template.schema';
import { Notification } from '../schemas/notification.schema';

export interface NotifyInput {
  userIds: string[];
  eventType: NotificationEventType | string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  tenantId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    @InjectModel(NotificationTemplate.name)
    private readonly templateModel: Model<NotificationTemplate>,
    @InjectModel(NotificationPreference.name)
    private readonly preferenceModel: Model<NotificationPreference>,
    private readonly mailService: MailService,
    private readonly usersRepository: UsersRepository,
    @Optional()
    @InjectQueue(QUEUE_NOTIFICATIONS)
    private readonly queue?: Queue<NotifyInput>,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    const payload: NotifyInput = {
      ...input,
      tenantId: input.tenantId ?? TenantContext.requireTenantId(),
    };
    if (this.queue) {
      await this.queue.add(NOTIFICATION_JOB_SEND, payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      });
      return;
    }
    await this.deliver(payload);
  }

  async deliver(input: NotifyInput): Promise<void> {
    const tenantId = input.tenantId ?? TenantContext.requireTenantId();
    const uniqueUserIds = [...new Set(input.userIds)].filter(Boolean);
    for (const userId of uniqueUserIds) {
      const channels = await this.resolveChannels(
        tenantId,
        userId,
        input.eventType,
      );
      for (const channel of channels) {
        if (
          channel === NotificationChannel.WHATSAPP ||
          channel === NotificationChannel.PUSH
        ) {
          continue;
        }
        const rendered = await this.render(tenantId, input, channel);
        await this.notificationModel.create({
          tenantId: new Types.ObjectId(tenantId),
          userId: new Types.ObjectId(userId),
          channel,
          eventType: input.eventType,
          title: rendered.title,
          body: rendered.body,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: input.metadata,
        });
        if (channel === NotificationChannel.EMAIL) {
          await this.sendEmail(userId, rendered);
        }
      }
    }
  }

  async myInbox(userId: string, query: PaginationQueryDto) {
    const tenantId = new Types.ObjectId(TenantContext.requireTenantId());
    const filter = {
      tenantId,
      userId: new Types.ObjectId(userId),
      channel: NotificationChannel.IN_APP,
    };
    const { skip, limit } = skipTake(query.page, query.limit);
    const [items, total] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<Notification[]>()
        .exec(),
      this.notificationModel.countDocuments(filter).exec(),
    ]);
    return paginated(items, total, query.page, query.limit);
  }

  async markRead(userId: string, id: string) {
    const tenantId = new Types.ObjectId(TenantContext.requireTenantId());
    return this.notificationModel
      .findOneAndUpdate(
        { _id: id, tenantId, userId: new Types.ObjectId(userId) },
        { $set: { readAt: new Date() } },
        { new: true },
      )
      .lean<Notification>()
      .exec();
  }

  async upsertPreference(userId: string, dto: UpdatePreferenceDto) {
    const tenantId = new Types.ObjectId(TenantContext.requireTenantId());
    return this.preferenceModel
      .findOneAndUpdate(
        {
          tenantId,
          userId: new Types.ObjectId(userId),
          eventType: dto.eventType,
        },
        {
          $set: { channels: dto.channels, enabled: dto.enabled },
          $setOnInsert: {
            tenantId,
            userId: new Types.ObjectId(userId),
            eventType: dto.eventType,
          },
        },
        { new: true, upsert: true },
      )
      .lean<NotificationPreference>()
      .exec();
  }

  async listPreferences(userId: string) {
    const tenantId = new Types.ObjectId(TenantContext.requireTenantId());
    return this.preferenceModel
      .find({ tenantId, userId: new Types.ObjectId(userId) })
      .lean<NotificationPreference[]>()
      .exec();
  }

  private async resolveChannels(
    tenantId: string,
    userId: string,
    eventType: string,
  ): Promise<NotificationChannel[]> {
    const pref = await this.preferenceModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        userId: new Types.ObjectId(userId),
        eventType,
      })
      .lean<NotificationPreference>()
      .exec();
    if (pref && !pref.enabled) {
      return [];
    }
    if (pref?.channels?.length) {
      return pref.channels;
    }
    return [NotificationChannel.IN_APP, NotificationChannel.EMAIL];
  }

  private async render(
    tenantId: string,
    input: NotifyInput,
    channel: NotificationChannel,
  ): Promise<NotifyInput> {
    const template = await this.templateModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        code: input.eventType,
        channel,
      })
      .lean<NotificationTemplate>()
      .exec();
    if (!template) {
      return input;
    }
    const vars: Record<string, string> = {
      title: input.title,
      body: input.body,
      entityType: input.entityType ?? '',
      entityId: input.entityId ?? '',
      ...(input.metadata
        ? Object.fromEntries(
            Object.entries(input.metadata).map(([key, value]) => [
              key,
              String(value ?? ''),
            ]),
          )
        : {}),
    };
    return {
      ...input,
      title: this.interpolate(template.subject, vars),
      body: this.interpolate(template.body, vars),
    };
  }

  private interpolate(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
      return vars[key] ?? '';
    });
  }

  private async sendEmail(userId: string, input: NotifyInput): Promise<void> {
    const user = await this.usersRepository.findAuthById(userId);
    if (!user?.email) {
      this.logger.warn(`No email for user ${userId}`);
      return;
    }
    await this.mailService.sendMail({
      to: user.email,
      subject: input.title,
      text: input.body,
    });
  }
}
