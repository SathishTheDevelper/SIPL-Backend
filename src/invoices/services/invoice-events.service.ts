import { Injectable, Logger } from '@nestjs/common';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { BusinessModule } from '../../common/constants/modules';
import { PermissionCode } from '../../common/constants/permissions';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersRepository } from '../../users/repositories/users.repository';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { Invoice } from '../schemas/invoice.schema';

@Injectable()
export class InvoiceEventsService {
  private readonly logger = new Logger(InvoiceEventsService.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
    private readonly usersRepository: UsersRepository,
  ) {}

  log(
    message: string,
    invoice: Pick<Invoice, '_id' | 'tenantId' | 'purchaseOrderId'>,
    userId?: string,
  ): void {
    this.logger.log({
      msg: message,
      tenantId: invoice.tenantId.toString(),
      invoiceId: invoice._id.toString(),
      purchaseOrderId: invoice.purchaseOrderId.toString(),
      userId,
    });
  }

  async audit(
    action: AuditAction,
    invoice: Invoice,
    before?: unknown,
    after?: unknown,
  ): Promise<void> {
    await this.auditService.record({
      action,
      module: BusinessModule.INVOICE,
      entityType: 'INVOICE',
      entityId: invoice._id.toString(),
      before,
      after,
    });
  }

  async notify(input: {
    eventType: NotificationEventType;
    invoice: Invoice;
    title: string;
    body: string;
    includeCreator?: boolean;
  }): Promise<void> {
    const reviewers = await this.usersRepository.findMany({
      status: UserStatus.ACTIVE,
      permissions: PermissionCode.INVOICES_REVIEW,
    });
    const userIds = new Set(reviewers.map((user) => user._id.toString()));
    if (input.includeCreator) {
      userIds.add(input.invoice.createdBy.toString());
    }
    if (userIds.size === 0) return;
    await this.notifications.notify({
      userIds: [...userIds],
      eventType: input.eventType,
      title: input.title,
      body: input.body,
      entityType: 'INVOICE',
      entityId: input.invoice._id.toString(),
      metadata: {
        tenantId: input.invoice.tenantId.toString(),
        invoiceId: input.invoice._id.toString(),
        eventType: input.eventType,
      },
    });
  }
}
