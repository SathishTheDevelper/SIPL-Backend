import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AttachmentsService } from '../../attachments/services/attachments.service';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { ErrorCodes } from '../../common/constants/error-codes';
import { BusinessModule, DocumentType } from '../../common/constants/modules';
import { SystemRole } from '../../common/constants/system-roles';
import { TenantContext } from '../../common/context/tenant.context';
import { AppException } from '../../common/exceptions/app.exception';
import { runInTransaction } from '../../common/utils/mongo-transaction';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { assertTransition } from '../../common/utils/status-transition';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NumberingService } from '../../numbering/services/numbering.service';
import { PurchaseOrderItem } from '../../purchase-orders/schemas/purchase-order-item.schema';
import { PurchaseOrdersService } from '../../purchase-orders/services/purchase-orders.service';
import { TenantsService } from '../../tenants/services/tenants.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersRepository } from '../../users/repositories/users.repository';
import {
  CancelDeliveryDto,
  CreateDeliveryDto,
  ListDeliveriesDto,
  UpdateDeliveryDto,
} from '../dto/delivery.dto';
import { DeliveryStatus } from '../enums/delivery.enums';
import { DeliveryItem } from '../schemas/delivery-item.schema';
import { Delivery } from '../schemas/delivery.schema';
import {
  exceedsReceipt,
  fromMilli,
  toMilli,
} from '../../purchase-orders/utils/po-math';

const TRANSITIONS: Record<string, string[]> = {
  [DeliveryStatus.SCHEDULED]: [
    DeliveryStatus.IN_TRANSIT,
    DeliveryStatus.CANCELLED,
  ],
  [DeliveryStatus.IN_TRANSIT]: [DeliveryStatus.DELIVERED],
  [DeliveryStatus.DELIVERED]: [],
  [DeliveryStatus.PARTIALLY_RECEIVED]: [],
  [DeliveryStatus.CANCELLED]: [],
};

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Delivery.name) private readonly deliveries: Model<Delivery>,
    @InjectModel(DeliveryItem.name)
    private readonly deliveryItems: Model<DeliveryItem>,
    @InjectModel(PurchaseOrderItem.name)
    private readonly poItems: Model<PurchaseOrderItem>,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly numberingService: NumberingService,
    private readonly attachments: AttachmentsService,
    private readonly tenantsService: TenantsService,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async create(poId: string, dto: CreateDeliveryDto, user: AuthenticatedUser) {
    const order = await this.purchaseOrdersService.requireOpenForReceipt(poId);
    if (!dto.items?.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Delivery has no items',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const tenant = await this.tenantsService.findByIdOrThrow(
      this.tenantId().toString(),
    );
    const tolerance = tenant.settings.overReceiptTolerancePercent;
    const created = await runInTransaction(this.connection, async (session) => {
      const allocated = await this.numberingService.next(
        DocumentType.DELIVERY,
        session,
      );
      const [delivery] = await this.deliveries.create(
        [
          {
            tenantId: this.tenantId(),
            deliveryNumber: allocated.number,
            purchaseOrderId: order._id,
            vendorId: order.vendorId,
            projectId: order.projectId,
            siteId: order.siteId,
            deliveryDate: new Date(dto.deliveryDate),
            expectedDate: dto.expectedDate
              ? new Date(dto.expectedDate)
              : undefined,
            vehicleNumber: dto.vehicleNumber,
            driverName: dto.driverName,
            driverPhone: dto.driverPhone,
            challanNumber: dto.challanNumber,
            remarks: dto.remarks,
            createdBy: this.oid(user.userId),
            status: DeliveryStatus.SCHEDULED,
          },
        ],
        session ? { session } : undefined,
      );
      const payloads = [];
      for (const line of dto.items) {
        const poItem = await this.poItems
          .findOne({
            _id: this.oid(line.purchaseOrderItemId),
            tenantId: this.tenantId(),
            purchaseOrderId: order._id,
          })
          .session(session ?? null)
          .lean<PurchaseOrderItem>()
          .exec();
        if (!poItem) this.missing('Purchase order item not found');
        const shipped = await this.shippedQuantity(poItem._id, session);
        if (
          exceedsReceipt(poItem.quantity, shipped, line.quantity, tolerance)
        ) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'Delivery quantity exceeds the quantity still to be shipped',
            ErrorCodes.PO_QUANTITY_EXCEEDED,
          );
        }
        payloads.push({
          tenantId: this.tenantId(),
          deliveryId: delivery._id,
          purchaseOrderItemId: poItem._id,
          materialId: poItem.materialId,
          quantity: fromMilli(toMilli(line.quantity)),
          unitId: poItem.unitId,
          remarks: line.remarks,
        });
      }
      await this.deliveryItems.insertMany(
        payloads,
        session ? { session } : undefined,
      );
      const attachmentIds = await this.attachments.record(
        'DELIVERY',
        delivery._id,
        dto.attachments,
        user.userId,
        session,
      );
      if (attachmentIds.length) {
        await this.deliveries
          .updateOne(
            { _id: delivery._id },
            { $set: { attachments: attachmentIds } },
            session ? { session } : undefined,
          )
          .exec();
      }
      const saved = await this.deliveries
        .findOne({ _id: delivery._id, tenantId: this.tenantId() })
        .session(session ?? null)
        .lean<Delivery>()
        .exec();
      return saved!;
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.DELIVERY,
      entityType: 'Delivery',
      entityId: created._id.toString(),
      after: {
        deliveryNumber: created.deliveryNumber,
        purchaseOrderId: poId,
        status: created.status,
      },
    });
    await this.notify(
      NotificationEventType.DELIVERY_SCHEDULED,
      'Delivery scheduled',
      `${created.deliveryNumber} was scheduled`,
      created._id.toString(),
    );
    return created;
  }

  async listForPurchaseOrder(poId: string, query: ListDeliveriesDto) {
    await this.purchaseOrdersService.requireOrder(poId);
    return this.list({ ...query, poId });
  }

  async list(query: ListDeliveriesDto) {
    const filter: Record<string, unknown> = { tenantId: this.tenantId() };
    if (query.status) filter.status = query.status;
    if (query.poId) filter.purchaseOrderId = this.oid(query.poId);
    if (query.projectId) filter.projectId = this.oid(query.projectId);
    if (query.siteId) filter.siteId = this.oid(query.siteId);
    const page = skipTake(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.deliveries
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(page.skip)
        .limit(page.limit)
        .lean()
        .exec(),
      this.deliveries.countDocuments(filter).exec(),
    ]);
    return paginated(data, total, query.page, query.limit);
  }

  get(id: string) {
    return this.requireDelivery(id);
  }

  async update(id: string, dto: UpdateDeliveryDto) {
    const current = await this.requireDelivery(id);
    if (
      current.status !== DeliveryStatus.SCHEDULED &&
      current.status !== DeliveryStatus.IN_TRANSIT
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Delivery can only be edited before it is delivered',
        ErrorCodes.INVALID_STATUS,
      );
    }
    const updated = await this.deliveries
      .findOneAndUpdate(
        { _id: current._id, tenantId: this.tenantId() },
        {
          $set: {
            deliveryDate: dto.deliveryDate
              ? new Date(dto.deliveryDate)
              : current.deliveryDate,
            expectedDate: dto.expectedDate
              ? new Date(dto.expectedDate)
              : current.expectedDate,
            vehicleNumber: dto.vehicleNumber ?? current.vehicleNumber,
            driverName: dto.driverName ?? current.driverName,
            driverPhone: dto.driverPhone ?? current.driverPhone,
            challanNumber: dto.challanNumber ?? current.challanNumber,
            remarks: dto.remarks ?? current.remarks,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    await this.auditService.record({
      action: AuditAction.UPDATE,
      module: BusinessModule.DELIVERY,
      entityType: 'Delivery',
      entityId: id,
    });
    return updated;
  }

  inTransit(id: string) {
    return this.transition(
      id,
      DeliveryStatus.IN_TRANSIT,
      NotificationEventType.DELIVERY_IN_TRANSIT,
      'Delivery in transit',
    );
  }

  delivered(id: string) {
    return this.transition(
      id,
      DeliveryStatus.DELIVERED,
      NotificationEventType.DELIVERY_RECEIVED,
      'Delivery received at site',
    );
  }

  async cancel(id: string, dto: CancelDeliveryDto) {
    if (!dto.reason?.trim()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Reason is required to cancel a delivery',
        ErrorCodes.REASON_REQUIRED,
      );
    }
    const current = await this.requireDelivery(id);
    assertTransition(current.status, DeliveryStatus.CANCELLED, TRANSITIONS);
    const updated = await this.deliveries
      .findOneAndUpdate(
        { _id: current._id, tenantId: this.tenantId(), status: current.status },
        {
          $set: {
            status: DeliveryStatus.CANCELLED,
            cancellationReason: dto.reason.trim(),
          },
        },
        { new: true },
      )
      .lean<Delivery>()
      .exec();
    await this.auditService.record({
      action: AuditAction.CANCEL,
      module: BusinessModule.DELIVERY,
      entityType: 'Delivery',
      entityId: id,
      after: { status: DeliveryStatus.CANCELLED, reason: dto.reason.trim() },
    });
    return updated;
  }

  /**
   * Shipment quantity is checked against ordered quantity minus other
   * non-cancelled deliveries. It does not change PO receivedQuantity.
   * GRN approval is the only writer of received and pending quantities.
   */
  private async shippedQuantity(
    purchaseOrderItemId: Types.ObjectId,
    session?: import('mongoose').ClientSession,
  ): Promise<number> {
    const pipeline = this.deliveryItems.aggregate<{ quantity: number }>([
      {
        $match: {
          tenantId: this.tenantId(),
          purchaseOrderItemId,
        },
      },
      {
        $lookup: {
          from: 'deliveries',
          localField: 'deliveryId',
          foreignField: '_id',
          as: 'delivery',
        },
      },
      { $unwind: '$delivery' },
      {
        $match: {
          'delivery.tenantId': this.tenantId(),
          'delivery.status': { $ne: DeliveryStatus.CANCELLED },
        },
      },
      { $group: { _id: null, quantity: { $sum: '$quantity' } } },
    ]);
    if (session) pipeline.session(session);
    const [row] = await pipeline.exec();
    return row?.quantity ?? 0;
  }

  private async transition(
    id: string,
    status: DeliveryStatus,
    eventType: NotificationEventType,
    title: string,
  ) {
    const current = await this.requireDelivery(id);
    assertTransition(current.status, status, TRANSITIONS);
    const updated = await this.deliveries
      .findOneAndUpdate(
        { _id: current._id, tenantId: this.tenantId(), status: current.status },
        { $set: { status } },
        { new: true },
      )
      .lean<Delivery>()
      .exec();
    if (!updated) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Delivery status changed concurrently',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    await this.auditService.record({
      action: AuditAction.STATUS_CHANGE,
      module: BusinessModule.DELIVERY,
      entityType: 'Delivery',
      entityId: id,
      before: { status: current.status },
      after: { status },
    });
    await this.notify(
      eventType,
      title,
      `${current.deliveryNumber} is ${status}`,
      id,
    );
    return updated;
  }

  private async requireDelivery(id: string): Promise<Delivery> {
    const row = await this.deliveries
      .findOne({ _id: this.oid(id), tenantId: this.tenantId() })
      .lean<Delivery>()
      .exec();
    if (!row) this.missing('Delivery not found');
    return row;
  }

  private async notify(
    eventType: NotificationEventType,
    title: string,
    body: string,
    entityId: string,
  ) {
    const users = await this.usersRepository.findMany({
      role: {
        $in: [
          SystemRole.PROJECT_HEAD,
          SystemRole.SITE_ENGINEER,
          SystemRole.PROCUREMENT,
        ],
      },
      status: UserStatus.ACTIVE,
    });
    if (users.length === 0) return;
    await this.notifications.notify({
      userIds: users.map((user) => user._id.toString()),
      eventType,
      title,
      body,
      entityType: 'Delivery',
      entityId,
    });
  }

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }

  private oid(id: string): Types.ObjectId {
    return new Types.ObjectId(id);
  }

  private missing(message: string): never {
    throw new AppException(HttpStatus.NOT_FOUND, message, ErrorCodes.NOT_FOUND);
  }
}
