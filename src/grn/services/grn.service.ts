import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { ErrorCodes } from '../../common/constants/error-codes';
import {
  BusinessModule,
  DocumentType,
  WorkflowModule,
} from '../../common/constants/modules';
import { SystemRole } from '../../common/constants/system-roles';
import { TenantContext } from '../../common/context/tenant.context';
import { AppException } from '../../common/exceptions/app.exception';
import { runInTransactionWithRetry } from '../../common/utils/mongo-transaction';
import { assertEquals } from '../../common/utils/status-transition';
import { DeliveryStatus } from '../../deliveries/enums/delivery.enums';
import { DeliveryItem } from '../../deliveries/schemas/delivery-item.schema';
import { Delivery } from '../../deliveries/schemas/delivery.schema';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NumberingService } from '../../numbering/services/numbering.service';
import { PurchaseOrderStatus } from '../../purchase-orders/enums/purchase-order.enums';
import { PurchaseOrderItem } from '../../purchase-orders/schemas/purchase-order-item.schema';
import { PurchaseOrder } from '../../purchase-orders/schemas/purchase-order.schema';
import { PurchaseOrdersService } from '../../purchase-orders/services/purchase-orders.service';
import {
  exceedsReceipt,
  fromMilli,
  maxReceivableMilli,
  pendingMilli,
  quantitiesBalance,
  toMilli,
} from '../../purchase-orders/utils/po-math';
import { ProjectsService } from '../../projects/services/projects.service';
import { TenantsService } from '../../tenants/services/tenants.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersRepository } from '../../users/repositories/users.repository';
import {
  WorkflowActionType,
  WorkflowInstanceStatus,
} from '../../workflow/enums/workflow.enums';
import {
  WorkflowOutcome,
  WorkflowOutcomeRegistry,
} from '../../workflow/services/workflow-outcome.registry';
import { WorkflowService } from '../../workflow/services/workflow.service';
import {
  CreateGrnDto,
  CreateGrnItemDto,
  GrnReasonDto,
  UpdateGrnDto,
} from '../dto/grn.dto';
import { GrnStatus } from '../enums/grn.enums';
import { GrnAttachment } from '../schemas/grn-attachment.schema';
import { GrnItem } from '../schemas/grn-item.schema';
import { Grn } from '../schemas/grn.schema';
import { GrnQuantityService } from './grn-quantity.service';

@Injectable()
export class GrnService implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Grn.name) private readonly grns: Model<Grn>,
    @InjectModel(GrnItem.name) private readonly grnItems: Model<GrnItem>,
    @InjectModel(GrnAttachment.name)
    private readonly grnAttachments: Model<GrnAttachment>,
    @InjectModel(PurchaseOrder.name)
    private readonly orders: Model<PurchaseOrder>,
    @InjectModel(PurchaseOrderItem.name)
    private readonly poItems: Model<PurchaseOrderItem>,
    @InjectModel(Delivery.name) private readonly deliveries: Model<Delivery>,
    @InjectModel(DeliveryItem.name)
    private readonly deliveryItems: Model<DeliveryItem>,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly quantities: GrnQuantityService,
    private readonly numberingService: NumberingService,
    private readonly projectsService: ProjectsService,
    private readonly tenantsService: TenantsService,
    private readonly workflowService: WorkflowService,
    private readonly outcomeRegistry: WorkflowOutcomeRegistry,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
    private readonly usersRepository: UsersRepository,
  ) {}

  onModuleInit(): void {
    this.outcomeRegistry.register((outcome) => this.onWorkflowOutcome(outcome));
  }

  async create(poId: string, dto: CreateGrnDto, user: AuthenticatedUser) {
    const order = await this.purchaseOrdersService.requireOpenForReceipt(poId);
    const delivery = await this.requireDelivery(dto.deliveryId, order._id);
    if (!dto.items?.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'GRN has no items',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const tenant = await this.tenantsService.findByIdOrThrow(
      this.tenantId().toString(),
    );
    const prepared = await this.prepareItems(
      order,
      delivery,
      dto.items,
      tenant.settings.overReceiptTolerancePercent,
    );
    const grn = await this.grns.create({
      tenantId: this.tenantId(),
      grnNumber: (await this.numberingService.next(DocumentType.GRN)).number,
      purchaseOrderId: order._id,
      deliveryId: delivery._id,
      projectId: order.projectId,
      siteId: order.siteId,
      vendorId: order.vendorId,
      grnDate: dto.grnDate ? new Date(dto.grnDate) : new Date(),
      receivedBy: this.oid(user.userId),
      remarks: dto.remarks,
      createdBy: this.oid(user.userId),
      status: GrnStatus.DRAFT,
    });
    await this.grnItems.insertMany(
      prepared.map((item) => ({ ...item, grnId: grn._id })),
    );
    if (dto.attachments?.length) {
      const files = await this.grnAttachments.insertMany(
        dto.attachments.map((file) => ({
          tenantId: this.tenantId(),
          entityType: 'GRN',
          entityId: grn._id,
          fileName: file.fileName,
          mimeType: file.mimeType,
          size: file.size,
          storageKey: file.storageKey,
          uploadedBy: this.oid(user.userId),
        })),
      );
      await this.grns.updateOne(
        { _id: grn._id },
        { $set: { attachments: files.map((file) => file._id) } },
      );
    }
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.GRN,
      entityType: 'GRN',
      entityId: grn._id.toString(),
      after: {
        grnNumber: grn.grnNumber,
        purchaseOrderId: poId,
        deliveryId: dto.deliveryId,
      },
    });
    return this.requireGrn(grn._id.toString());
  }

  async listForPurchaseOrder(poId: string) {
    await this.purchaseOrdersService.requireOrder(poId);
    return this.grns
      .find({
        tenantId: this.tenantId(),
        purchaseOrderId: this.oid(poId),
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  get(id: string) {
    return this.requireGrn(id);
  }

  async update(id: string, dto: UpdateGrnDto, user: AuthenticatedUser) {
    const current = await this.requireGrn(id);
    assertEquals(
      current.status,
      GrnStatus.DRAFT,
      'Only a draft GRN can be edited',
    );
    return this.grns
      .findOneAndUpdate(
        {
          _id: current._id,
          tenantId: this.tenantId(),
          status: GrnStatus.DRAFT,
        },
        {
          $set: {
            grnDate: dto.grnDate ? new Date(dto.grnDate) : current.grnDate,
            remarks: dto.remarks ?? current.remarks,
            updatedBy: this.oid(user.userId),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  async listItems(id: string) {
    const grn = await this.requireGrn(id);
    return this.grnItems
      .find({ tenantId: this.tenantId(), grnId: grn._id })
      .lean()
      .exec();
  }

  async addItem(id: string, dto: CreateGrnItemDto) {
    const grn = await this.requireGrn(id);
    assertEquals(
      grn.status,
      GrnStatus.DRAFT,
      'GRN items can only be added on a draft',
    );
    const order = await this.purchaseOrdersService.requireOpenForReceipt(
      grn.purchaseOrderId.toString(),
    );
    const delivery = await this.requireDelivery(
      grn.deliveryId.toString(),
      order._id,
    );
    const tenant = await this.tenantsService.findByIdOrThrow(
      this.tenantId().toString(),
    );
    const [prepared] = await this.prepareItems(
      order,
      delivery,
      [dto],
      tenant.settings.overReceiptTolerancePercent,
    );
    const created = await this.grnItems.create({ ...prepared, grnId: grn._id });
    return created.toObject();
  }

  async submit(id: string, user: AuthenticatedUser) {
    const existing = await this.requireGrn(id);
    if (
      existing.status === GrnStatus.SUBMITTED &&
      existing.workflowInstanceId
    ) {
      return existing;
    }
    const count = await this.grnItems.countDocuments({
      tenantId: this.tenantId(),
      grnId: existing._id,
    });
    if (count === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'GRN has no items',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const locked = await this.grns
      .findOneAndUpdate(
        {
          _id: existing._id,
          tenantId: this.tenantId(),
          status: GrnStatus.DRAFT,
        },
        {
          $set: {
            status: GrnStatus.SUBMITTED,
            updatedBy: this.oid(user.userId),
          },
        },
        { new: true },
      )
      .lean<Grn>()
      .exec();
    if (!locked) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'GRN was already submitted',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    try {
      const project = await this.projectsService.findById(
        locked.projectId.toString(),
      );
      const instance = await this.workflowService.start(
        {
          module: WorkflowModule.GRN_APPROVAL,
          entityType: 'GRN',
          entityId: locked._id.toString(),
          context: {
            projectId: locked.projectId.toString(),
            projectHeadUserId: project.projectHead?.toString(),
            purchaseOrderId: locked.purchaseOrderId.toString(),
          },
        },
        user,
      );
      const updated = await this.grns
        .findOneAndUpdate(
          { _id: locked._id, tenantId: this.tenantId() },
          { $set: { workflowInstanceId: instance._id } },
          { new: true },
        )
        .lean<Grn>()
        .exec();
      await this.auditService.record({
        action: AuditAction.SUBMIT,
        module: BusinessModule.GRN,
        entityType: 'GRN',
        entityId: id,
        after: { status: GrnStatus.SUBMITTED },
      });
      await this.notify(
        NotificationEventType.GRN_SUBMITTED,
        'GRN submitted',
        `${locked.grnNumber} was submitted`,
        id,
      );
      await this.notify(
        NotificationEventType.GRN_APPROVAL_PENDING,
        'GRN approval pending',
        `${locked.grnNumber} is waiting for approval`,
        id,
      );
      return updated;
    } catch (error) {
      await this.grns
        .updateOne(
          {
            _id: locked._id,
            tenantId: this.tenantId(),
            status: GrnStatus.SUBMITTED,
          },
          { $set: { status: GrnStatus.DRAFT } },
        )
        .exec();
      throw error;
    }
  }

  async approve(id: string, user: AuthenticatedUser) {
    const current = await this.requireGrn(id);
    if (current.status === GrnStatus.APPROVED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'GRN is already approved',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    if (current.status === GrnStatus.REJECTED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'A rejected GRN cannot be approved',
        ErrorCodes.INVALID_STATUS,
      );
    }
    assertEquals(
      current.status,
      GrnStatus.SUBMITTED,
      'Only a submitted GRN can be approved',
    );
    if (!current.workflowInstanceId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'GRN has no workflow',
        ErrorCodes.WORKFLOW_NOT_FOUND,
      );
    }
    await this.workflowService.act(
      current.workflowInstanceId.toString(),
      { action: WorkflowActionType.APPROVE },
      user,
    );
    return this.requireGrn(id);
  }

  async reject(id: string, dto: GrnReasonDto, user: AuthenticatedUser) {
    if (!dto.reason?.trim()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Reason is required to reject a GRN',
        ErrorCodes.REASON_REQUIRED,
      );
    }
    const current = await this.requireGrn(id);
    if (current.status === GrnStatus.APPROVED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'An approved GRN cannot be rejected',
        ErrorCodes.INVALID_STATUS,
      );
    }
    assertEquals(
      current.status,
      GrnStatus.SUBMITTED,
      'Only a submitted GRN can be rejected',
    );
    if (!current.workflowInstanceId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'GRN has no workflow',
        ErrorCodes.WORKFLOW_NOT_FOUND,
      );
    }
    await this.workflowService.act(
      current.workflowInstanceId.toString(),
      { action: WorkflowActionType.REJECT, reason: dto.reason.trim() },
      user,
    );
    return this.requireGrn(id);
  }

  async cancel(id: string, dto: GrnReasonDto, user: AuthenticatedUser) {
    if (!dto.reason?.trim()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Reason is required to cancel a GRN',
        ErrorCodes.REASON_REQUIRED,
      );
    }
    const current = await this.requireGrn(id);
    assertEquals(
      current.status,
      GrnStatus.DRAFT,
      'Only a draft GRN can be cancelled',
    );
    const updated = await this.grns
      .findOneAndUpdate(
        {
          _id: current._id,
          tenantId: this.tenantId(),
          status: GrnStatus.DRAFT,
        },
        {
          $set: {
            status: GrnStatus.CANCELLED,
            cancellationReason: dto.reason.trim(),
            updatedBy: this.oid(user.userId),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    await this.auditService.record({
      action: AuditAction.CANCEL,
      module: BusinessModule.GRN,
      entityType: 'GRN',
      entityId: id,
      after: { status: GrnStatus.CANCELLED, reason: dto.reason.trim() },
    });
    return updated;
  }

  async summary() {
    const tenantId = this.tenantId();
    const [grnRows, poRows] = await Promise.all([
      this.grns
        .aggregate<{ _id: string; count: number }>([
          { $match: { tenantId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.orders
        .aggregate<{ _id: string; count: number }>([
          { $match: { tenantId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);
    const grnCount = (status: string) =>
      grnRows.find((row) => row._id === status)?.count ?? 0;
    const poCount = (status: string) =>
      poRows.find((row) => row._id === status)?.count ?? 0;
    return {
      pendingGRN: grnCount(GrnStatus.DRAFT) + grnCount(GrnStatus.SUBMITTED),
      approvedGRN: grnCount(GrnStatus.APPROVED),
      rejectedGRN: grnCount(GrnStatus.REJECTED),
      partialReceipts: poCount(PurchaseOrderStatus.PARTIALLY_DELIVERED),
      completedReceipts: poCount(PurchaseOrderStatus.FULLY_DELIVERED),
    };
  }

  private async onWorkflowOutcome(outcome: WorkflowOutcome): Promise<void> {
    if (outcome.entityType !== 'GRN') return;
    const current = await this.grns
      .findOne({ _id: this.oid(outcome.entityId), tenantId: this.tenantId() })
      .lean<Grn>()
      .exec();
    if (!current || current.status !== GrnStatus.SUBMITTED) return;

    if (outcome.instanceStatus === WorkflowInstanceStatus.APPROVED) {
      const poStatus = await this.applyApproval(current);
      await this.auditService.record({
        action: AuditAction.APPROVE,
        module: BusinessModule.GRN,
        entityType: 'GRN',
        entityId: current._id.toString(),
        after: { status: GrnStatus.APPROVED, purchaseOrderStatus: poStatus },
      });
      await this.notify(
        NotificationEventType.GRN_APPROVED,
        'GRN approved',
        `${current.grnNumber} was approved`,
        current._id.toString(),
      );
      if (poStatus === PurchaseOrderStatus.PARTIALLY_DELIVERED) {
        await this.notify(
          NotificationEventType.PO_PARTIALLY_DELIVERED,
          'Purchase order partially delivered',
          `Receipt against ${current.grnNumber} left a balance on the purchase order`,
          current.purchaseOrderId.toString(),
        );
      }
      if (poStatus === PurchaseOrderStatus.FULLY_DELIVERED) {
        await this.notify(
          NotificationEventType.PO_FULLY_DELIVERED,
          'Purchase order fully delivered',
          `Receipt against ${current.grnNumber} completed the purchase order`,
          current.purchaseOrderId.toString(),
        );
      }
      return;
    }

    if (outcome.instanceStatus === WorkflowInstanceStatus.REJECTED) {
      await this.grns
        .updateOne(
          {
            _id: current._id,
            tenantId: this.tenantId(),
            status: GrnStatus.SUBMITTED,
          },
          {
            $set: {
              status: GrnStatus.REJECTED,
              rejectionReason: outcome.reason,
            },
          },
        )
        .exec();
      await this.auditService.record({
        action: AuditAction.REJECT,
        module: BusinessModule.GRN,
        entityType: 'GRN',
        entityId: current._id.toString(),
        after: { status: GrnStatus.REJECTED, reason: outcome.reason },
      });
      await this.notify(
        NotificationEventType.GRN_REJECTED,
        'GRN rejected',
        outcome.reason ?? `${current.grnNumber} was rejected`,
        current._id.toString(),
      );
      return;
    }

    if (outcome.instanceStatus === WorkflowInstanceStatus.SENT_BACK) {
      await this.grns
        .updateOne(
          {
            _id: current._id,
            tenantId: this.tenantId(),
            status: GrnStatus.SUBMITTED,
          },
          {
            $set: { status: GrnStatus.DRAFT },
            $unset: { workflowInstanceId: 1 },
          },
        )
        .exec();
      await this.auditService.record({
        action: AuditAction.SEND_BACK,
        module: BusinessModule.GRN,
        entityType: 'GRN',
        entityId: current._id.toString(),
        after: { status: GrnStatus.DRAFT, reason: outcome.reason },
      });
    }
  }

  private async applyApproval(
    grn: Grn,
  ): Promise<PurchaseOrderStatus | undefined> {
    return runInTransactionWithRetry(this.connection, async (session) => {
      const current = await this.grns
        .findOne({
          _id: grn._id,
          tenantId: this.tenantId(),
          status: GrnStatus.SUBMITTED,
        })
        .session(session ?? null)
        .lean<Grn>()
        .exec();
      if (!current) {
        const existing = await this.grns
          .findOne({ _id: grn._id, tenantId: this.tenantId() })
          .session(session ?? null)
          .lean<Grn>()
          .exec();
        if (existing?.status === GrnStatus.APPROVED) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'GRN is already approved',
            ErrorCodes.ALREADY_PROCESSED,
          );
        }
        throw new AppException(
          HttpStatus.CONFLICT,
          'GRN is not awaiting approval',
          ErrorCodes.INVALID_STATUS,
        );
      }
      const lines = await this.grnItems
        .find({ tenantId: this.tenantId(), grnId: current._id })
        .session(session ?? null)
        .lean<GrnItem[]>()
        .exec();
      const historical = await this.quantities.getReceivedQuantities(
        this.tenantId(),
        current.purchaseOrderId,
        lines.map((line) => line.purchaseOrderItemId),
        session,
      );
      const tenant = await this.tenantsService.findByIdOrThrow(
        this.tenantId().toString(),
      );
      const tolerance = tenant.settings.overReceiptTolerancePercent;
      for (const line of lines) {
        const poItem = await this.poItems
          .findOne({
            _id: line.purchaseOrderItemId,
            tenantId: this.tenantId(),
            purchaseOrderId: current.purchaseOrderId,
          })
          .session(session ?? null)
          .lean<PurchaseOrderItem>()
          .exec();
        if (!poItem) this.missing('Purchase order item not found');
        const already = historical.get(poItem._id.toString()) ?? 0;
        if (
          exceedsReceipt(
            poItem.quantity,
            already,
            line.acceptedQuantity,
            tolerance,
          )
        ) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'Accepted quantity exceeds the remaining purchase order quantity',
            ErrorCodes.PO_QUANTITY_EXCEEDED,
          );
        }
        const acceptedMilli = toMilli(line.acceptedQuantity);
        const maxMilli = maxReceivableMilli(poItem.quantity, tolerance);
        const updated = await this.poItems
          .findOneAndUpdate(
            {
              _id: poItem._id,
              tenantId: this.tenantId(),
              $expr: {
                $lte: [
                  {
                    $add: [
                      {
                        $round: [{ $multiply: ['$receivedQuantity', 1000] }, 0],
                      },
                      acceptedMilli,
                    ],
                  },
                  maxMilli,
                ],
              },
            },
            [
              {
                $set: {
                  receivedQuantity: {
                    $divide: [
                      {
                        $add: [
                          {
                            $round: [
                              { $multiply: ['$receivedQuantity', 1000] },
                              0,
                            ],
                          },
                          acceptedMilli,
                        ],
                      },
                      1000,
                    ],
                  },
                  pendingQuantity: {
                    $max: [
                      0,
                      {
                        $divide: [
                          {
                            $subtract: [
                              {
                                $round: [{ $multiply: ['$quantity', 1000] }, 0],
                              },
                              {
                                $add: [
                                  {
                                    $round: [
                                      {
                                        $multiply: ['$receivedQuantity', 1000],
                                      },
                                      0,
                                    ],
                                  },
                                  acceptedMilli,
                                ],
                              },
                            ],
                          },
                          1000,
                        ],
                      },
                    ],
                  },
                },
              },
            ],
            { new: true, session: session ?? undefined },
          )
          .lean<PurchaseOrderItem>()
          .exec();
        if (!updated) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'Accepted quantity exceeds the remaining purchase order quantity',
            ErrorCodes.PO_QUANTITY_EXCEEDED,
          );
        }
        await this.auditService.record({
          action: AuditAction.UPDATE,
          module: BusinessModule.PURCHASE_ORDER_ITEM,
          entityType: 'PurchaseOrderItem',
          entityId: poItem._id.toString(),
          before: {
            receivedQuantity: poItem.receivedQuantity,
            pendingQuantity: poItem.pendingQuantity,
          },
          after: {
            receivedQuantity: updated.receivedQuantity,
            pendingQuantity: updated.pendingQuantity,
            grnId: current._id.toString(),
          },
        });
      }
      await this.grns
        .updateOne(
          {
            _id: current._id,
            tenantId: this.tenantId(),
            status: GrnStatus.SUBMITTED,
          },
          { $set: { status: GrnStatus.APPROVED } },
          session ? { session } : undefined,
        )
        .exec();
      return this.syncPurchaseOrder(current.purchaseOrderId, session);
    });
  }

  private async syncPurchaseOrder(
    purchaseOrderId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<PurchaseOrderStatus | undefined> {
    const query = this.poItems.find({
      tenantId: this.tenantId(),
      purchaseOrderId,
    });
    if (session) query.session(session);
    const items = await query.lean<PurchaseOrderItem[]>().exec();
    if (items.length === 0) return undefined;
    const anyReceived = items.some(
      (item) => toMilli(item.receivedQuantity) > 0,
    );
    const complete = items.every(
      (item) => toMilli(item.receivedQuantity) >= toMilli(item.quantity),
    );
    if (!anyReceived) return undefined;
    const status = complete
      ? PurchaseOrderStatus.FULLY_DELIVERED
      : PurchaseOrderStatus.PARTIALLY_DELIVERED;
    await this.orders
      .updateOne(
        {
          _id: purchaseOrderId,
          tenantId: this.tenantId(),
          status: {
            $in: [
              PurchaseOrderStatus.APPROVED,
              PurchaseOrderStatus.SENT_TO_VENDOR,
              PurchaseOrderStatus.ACKNOWLEDGED,
              PurchaseOrderStatus.PARTIALLY_DELIVERED,
            ],
          },
        },
        { $set: { status } },
        session ? { session } : undefined,
      )
      .exec();
    await this.auditService.record({
      action: AuditAction.STATUS_CHANGE,
      module: BusinessModule.PURCHASE_ORDER,
      entityType: 'PurchaseOrder',
      entityId: purchaseOrderId.toString(),
      after: { status },
    });
    return status;
  }

  private async prepareItems(
    order: PurchaseOrder,
    delivery: Delivery,
    lines: CreateGrnItemDto[],
    tolerance?: number,
  ) {
    const poItemIds = lines.map((line) => this.oid(line.purchaseOrderItemId));
    const historical = await this.quantities.getReceivedQuantities(
      this.tenantId(),
      order._id,
      poItemIds,
    );
    const prepared = [];
    for (const line of lines) {
      if (
        !quantitiesBalance(
          line.receivedQuantity,
          line.acceptedQuantity,
          line.rejectedQuantity,
        )
      ) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Accepted quantity plus rejected quantity must equal received quantity',
          ErrorCodes.VALIDATION_ERROR,
        );
      }
      const poItem = await this.poItems
        .findOne({
          _id: this.oid(line.purchaseOrderItemId),
          tenantId: this.tenantId(),
          purchaseOrderId: order._id,
        })
        .lean<PurchaseOrderItem>()
        .exec();
      if (!poItem) this.missing('Purchase order item not found');
      const shipment = await this.deliveryItems
        .findOne({
          tenantId: this.tenantId(),
          deliveryId: delivery._id,
          purchaseOrderItemId: poItem._id,
        })
        .lean<DeliveryItem>()
        .exec();
      if (!shipment) this.missing('Delivery item not found');
      if (toMilli(line.receivedQuantity) > toMilli(shipment.quantity)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'Received quantity exceeds the delivered quantity',
          ErrorCodes.PO_QUANTITY_EXCEEDED,
        );
      }
      const previously = historical.get(poItem._id.toString()) ?? 0;
      if (
        exceedsReceipt(
          poItem.quantity,
          previously,
          line.receivedQuantity,
          tolerance,
        )
      ) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'Received quantity exceeds the remaining purchase order quantity',
          ErrorCodes.PO_QUANTITY_EXCEEDED,
        );
      }
      const pending = fromMilli(
        pendingMilli(poItem.quantity, previously + line.receivedQuantity),
      );
      if (pending < 0 && !(tolerance && tolerance > 0)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'Pending quantity cannot be negative',
          ErrorCodes.PO_QUANTITY_EXCEEDED,
        );
      }
      prepared.push({
        tenantId: this.tenantId(),
        purchaseOrderItemId: poItem._id,
        materialId: poItem.materialId,
        orderedQuantity: poItem.quantity,
        previouslyReceivedQuantity: previously,
        receivedQuantity: fromMilli(toMilli(line.receivedQuantity)),
        acceptedQuantity: fromMilli(toMilli(line.acceptedQuantity)),
        rejectedQuantity: fromMilli(toMilli(line.rejectedQuantity)),
        unitId: poItem.unitId,
        remarks: line.remarks,
      });
    }
    return prepared;
  }

  private async requireDelivery(
    id: string,
    purchaseOrderId: Types.ObjectId,
  ): Promise<Delivery> {
    const delivery = await this.deliveries
      .findOne({
        _id: this.oid(id),
        tenantId: this.tenantId(),
        purchaseOrderId,
      })
      .lean<Delivery>()
      .exec();
    if (!delivery) this.missing('Delivery not found');
    assertEquals(
      delivery.status,
      [DeliveryStatus.DELIVERED, DeliveryStatus.PARTIALLY_RECEIVED],
      'Delivery is not ready for receipt',
    );
    return delivery;
  }

  private async requireGrn(id: string): Promise<Grn> {
    const row = await this.grns
      .findOne({ _id: this.oid(id), tenantId: this.tenantId() })
      .lean<Grn>()
      .exec();
    if (!row) this.missing('GRN not found');
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
      entityType: eventType.startsWith('PO_') ? 'PurchaseOrder' : 'GRN',
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
