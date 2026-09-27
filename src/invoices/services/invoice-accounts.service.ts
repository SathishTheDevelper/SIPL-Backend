import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { ErrorCodes } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { EntityAttachment } from '../../attachments/schemas/entity-attachment.schema';
import { GrnItem } from '../../grn/schemas/grn-item.schema';
import { Grn } from '../../grn/schemas/grn.schema';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { PurchaseOrderItem } from '../../purchase-orders/schemas/purchase-order-item.schema';
import { PurchaseOrder } from '../../purchase-orders/schemas/purchase-order.schema';
import { VendorSource } from '../../purchase-orders/schemas/upstream.schema';
import { ProjectsService } from '../../projects/services/projects.service';
import { SitesService } from '../../sites/services/sites.service';
import { SlaService } from '../../sla/services/sla.service';
import { fromMilli, toMilli } from '../../purchase-orders/utils/po-math';
import {
  WorkflowActionType,
  WorkflowInstanceStatus,
} from '../../workflow/enums/workflow.enums';
import {
  WorkflowOutcome,
  WorkflowOutcomeRegistry,
} from '../../workflow/services/workflow-outcome.registry';
import { WorkflowService } from '../../workflow/services/workflow.service';
import { INVOICE_ACCOUNTS_REVIEW_SLA } from '../constants';
import { InvoiceListQueryDto } from '../dto/invoice-list-query.dto';
import { HoldInvoiceDto, InvoiceReasonDto } from '../dto/hold-invoice.dto';
import { ReviewInvoiceDto } from '../dto/review-invoice.dto';
import { InvoiceReferenceType } from '../enums/invoice-reference-type.enum';
import { InvoiceMatchStatus } from '../enums/invoice-match-status.enum';
import {
  CONSUMED_INVOICE_STATUSES,
  InvoiceStatus,
} from '../enums/invoice-status.enum';
import { InvoiceItem } from '../schemas/invoice-item.schema';
import { InvoiceMatchResult } from '../schemas/invoice-match-result.schema';
import { InvoiceReference } from '../schemas/invoice-reference.schema';
import { Invoice } from '../schemas/invoice.schema';
import { objectId, tenantObjectId } from '../utils/invoice-context';
import { assertInvoiceTransition } from '../utils/invoice-status';
import { InvoiceEventsService } from './invoice-events.service';
import { InvoiceService } from './invoice.service';
import { InvoiceValidationService } from './invoice-validation.service';

@Injectable()
export class InvoiceAccountsService implements OnModuleInit {
  constructor(
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(InvoiceItem.name)
    private readonly invoiceItems: Model<InvoiceItem>,
    @InjectModel(InvoiceReference.name)
    private readonly references: Model<InvoiceReference>,
    @InjectModel(InvoiceMatchResult.name)
    private readonly results: Model<InvoiceMatchResult>,
    @InjectModel(PurchaseOrder.name)
    private readonly orders: Model<PurchaseOrder>,
    @InjectModel(PurchaseOrderItem.name)
    private readonly poItems: Model<PurchaseOrderItem>,
    @InjectModel(VendorSource.name)
    private readonly vendors: Model<VendorSource>,
    @InjectModel(Grn.name) private readonly grns: Model<Grn>,
    @InjectModel(GrnItem.name) private readonly grnItems: Model<GrnItem>,
    @InjectModel(EntityAttachment.name)
    private readonly attachments: Model<EntityAttachment>,
    private readonly invoicesService: InvoiceService,
    private readonly validation: InvoiceValidationService,
    private readonly events: InvoiceEventsService,
    private readonly slaService: SlaService,
    private readonly workflowService: WorkflowService,
    private readonly outcomeRegistry: WorkflowOutcomeRegistry,
    private readonly projectsService: ProjectsService,
    private readonly sitesService: SitesService,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit(): void {
    this.outcomeRegistry.register((outcome) => this.onWorkflowOutcome(outcome));
  }

  pending(query: InvoiceListQueryDto) {
    return this.invoicesService.list({
      ...query,
      status: InvoiceStatus.SUBMITTED,
    });
  }

  reviewQueue(query: InvoiceListQueryDto) {
    return this.invoicesService.list({
      ...query,
      status: InvoiceStatus.ACCOUNTS_REVIEW,
    });
  }

  mismatch(query: InvoiceListQueryDto) {
    return this.invoicesService.list({
      ...query,
      status: InvoiceStatus.MISMATCH,
    });
  }

  onHold(query: InvoiceListQueryDto) {
    return this.invoicesService.list({
      ...query,
      status: InvoiceStatus.ON_HOLD,
    });
  }

  async accountsView(id: string) {
    const invoice = await this.validation.requireInvoice(id);
    const tenantId = tenantObjectId();
    const [
      items,
      refs,
      vendor,
      project,
      site,
      order,
      poItems,
      attachments,
      matchResults,
      previous,
      audit,
    ] = await Promise.all([
      this.invoiceItems
        .find({ tenantId, invoiceId: invoice._id })
        .lean()
        .exec(),
      this.references.find({ tenantId, invoiceId: invoice._id }).lean().exec(),
      this.vendors.findOne({ _id: invoice.vendorId, tenantId }).lean().exec(),
      this.projectsService.findById(invoice.projectId.toString()),
      this.sitesService.findById(invoice.siteId.toString()),
      this.orders
        .findOne({ _id: invoice.purchaseOrderId, tenantId })
        .lean()
        .exec(),
      this.poItems
        .find({ tenantId, purchaseOrderId: invoice.purchaseOrderId })
        .lean()
        .exec(),
      this.attachments
        .find({ tenantId, _id: { $in: invoice.attachments } })
        .lean()
        .exec(),
      this.results
        .find({ tenantId, invoiceId: invoice._id })
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.invoices
        .find({
          tenantId,
          purchaseOrderId: invoice.purchaseOrderId,
          _id: { $ne: invoice._id },
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
        .exec(),
      this.auditService.findAll({
        entityType: 'INVOICE',
        entityId: invoice._id.toString(),
        page: 1,
        limit: 50,
      }),
    ]);
    const grnIds = refs
      .filter(
        (row) => row.referenceType === InvoiceReferenceType.GRN && row.grnId,
      )
      .map((row) => row.grnId as Types.ObjectId);
    const [grns, grnItems, remaining] = await Promise.all([
      this.grns
        .find({ _id: { $in: grnIds }, tenantId })
        .lean()
        .exec(),
      this.grnItems
        .find({ tenantId, grnId: { $in: grnIds } })
        .lean()
        .exec(),
      this.remainingQuantities(invoice.purchaseOrderId, poItems),
    ]);
    return {
      invoice,
      vendor,
      project,
      site,
      purchaseOrder: order,
      purchaseOrderItems: poItems,
      grns,
      grnItems,
      invoiceItems: items,
      references: refs,
      attachments,
      matchResults,
      latestMatch: matchResults[0] ?? null,
      previousInvoices: previous,
      remainingInvoiceableQuantity: remaining,
      auditHistory: audit,
    };
  }

  async review(id: string, dto: ReviewInvoiceDto, user: AuthenticatedUser) {
    const current = await this.validation.requireInvoice(id);
    if (dto.decision === 'SEND_BACK') {
      if (current.status !== InvoiceStatus.MISMATCH) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Only a mismatched invoice can be sent back for correction',
          ErrorCodes.INVALID_INVOICE_STATUS,
        );
      }
      if (!dto.reason?.trim()) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'A reason is required to send an invoice back',
          ErrorCodes.REASON_REQUIRED,
        );
      }
      assertInvoiceTransition(current.status, InvoiceStatus.ACCOUNTS_REVIEW);
      const updated = await this.transition(
        current,
        InvoiceStatus.ACCOUNTS_REVIEW,
        {
          correctionOpen: true,
          remarks: dto.remarks ?? current.remarks,
          updatedBy: objectId(user.userId),
        },
      );
      await this.events.audit(
        AuditAction.INVOICE_SENT_BACK,
        updated,
        { status: current.status },
        { status: updated.status, reason: dto.reason, changedBy: user.userId },
      );
      await this.events.notify({
        eventType: NotificationEventType.SEND_BACK,
        invoice: updated,
        title: 'Invoice sent back',
        body: dto.reason,
        includeCreator: true,
      });
      return updated;
    }
    if (current.status === InvoiceStatus.ACCOUNTS_REVIEW) return current;
    assertInvoiceTransition(current.status, InvoiceStatus.ACCOUNTS_REVIEW);
    const updated = await this.transition(
      current,
      InvoiceStatus.ACCOUNTS_REVIEW,
      {
        remarks: dto.remarks ?? current.remarks,
        updatedBy: objectId(user.userId),
      },
    );
    await this.slaService.start({
      module: INVOICE_ACCOUNTS_REVIEW_SLA,
      entityType: 'INVOICE',
      entityId: updated._id.toString(),
    });
    this.events.log('Invoice entered accounts review', updated, user.userId);
    await this.events.notify({
      eventType: NotificationEventType.INVOICE_ACCOUNTS_REVIEW,
      invoice: updated,
      title: 'Invoice in accounts review',
      body: `${updated.invoiceNumber} is waiting for accounts review`,
      includeCreator: true,
    });
    return updated;
  }

  async hold(id: string, dto: HoldInvoiceDto, user: AuthenticatedUser) {
    const current = await this.validation.requireInvoice(id);
    assertInvoiceTransition(current.status, InvoiceStatus.ON_HOLD);
    const updated = await this.transition(current, InvoiceStatus.ON_HOLD, {
      matchStatus: InvoiceMatchStatus.HOLD,
      holdReason: dto.holdReason.trim(),
      heldBy: objectId(user.userId),
      heldAt: new Date(),
      updatedBy: objectId(user.userId),
    });
    await this.slaService.complete('INVOICE', updated._id.toString());
    this.events.log('Invoice placed on hold', updated, user.userId);
    await this.events.audit(AuditAction.INVOICE_HOLD, updated, undefined, {
      status: InvoiceStatus.ON_HOLD,
      holdReason: dto.holdReason.trim(),
      heldBy: user.userId,
      heldAt: updated.heldAt,
    });
    await this.events.notify({
      eventType: NotificationEventType.INVOICE_HOLD,
      invoice: updated,
      title: 'Invoice on hold',
      body: dto.holdReason.trim(),
      includeCreator: true,
    });
    return updated;
  }

  async releaseHold(id: string, user: AuthenticatedUser) {
    const current = await this.validation.requireInvoice(id);
    assertInvoiceTransition(current.status, InvoiceStatus.ACCOUNTS_REVIEW);
    const updated = await this.invoices
      .findOneAndUpdate(
        {
          _id: current._id,
          tenantId: tenantObjectId(),
          status: InvoiceStatus.ON_HOLD,
        },
        {
          $set: {
            status: InvoiceStatus.ACCOUNTS_REVIEW,
            matchStatus: InvoiceMatchStatus.PENDING,
            updatedBy: objectId(user.userId),
          },
          $unset: { holdReason: 1, heldBy: 1, heldAt: 1 },
        },
        { new: true },
      )
      .lean<Invoice>()
      .exec();
    if (!updated) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Invoice is not on hold',
        ErrorCodes.INVALID_INVOICE_STATUS,
      );
    }
    await this.slaService.start({
      module: INVOICE_ACCOUNTS_REVIEW_SLA,
      entityType: 'INVOICE',
      entityId: updated._id.toString(),
    });
    this.events.log('Invoice released from hold', updated, user.userId);
    await this.events.audit(
      AuditAction.INVOICE_RELEASED_FROM_HOLD,
      updated,
      { status: InvoiceStatus.ON_HOLD },
      { status: InvoiceStatus.ACCOUNTS_REVIEW },
    );
    await this.events.notify({
      eventType: NotificationEventType.INVOICE_RELEASED,
      invoice: updated,
      title: 'Invoice released from hold',
      body: `${updated.invoiceNumber} returned to accounts review`,
      includeCreator: true,
    });
    return updated;
  }

  async approve(id: string, user: AuthenticatedUser) {
    const current = await this.validation.requireInvoice(id);
    if (current.status === InvoiceStatus.APPROVED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Invoice is already approved',
        ErrorCodes.INVOICE_ALREADY_APPROVED,
      );
    }
    if (
      current.status === InvoiceStatus.MISMATCH ||
      current.matchStatus === InvoiceMatchStatus.MISMATCH
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'A mismatch cannot be approved',
        ErrorCodes.INVALID_INVOICE_STATUS,
      );
    }
    assertInvoiceTransition(current.status, InvoiceStatus.APPROVED);
    if (current.matchStatus !== InvoiceMatchStatus.MATCH) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Only a matched invoice can be approved',
        ErrorCodes.INVALID_INVOICE_STATUS,
      );
    }
    if (!current.workflowInstanceId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Invoice approval workflow is not configured',
        ErrorCodes.WORKFLOW_NOT_FOUND,
      );
    }
    await this.workflowService.act(
      current.workflowInstanceId.toString(),
      { action: WorkflowActionType.APPROVE },
      user,
    );
    return this.validation.requireInvoice(id);
  }

  async reject(id: string, dto: InvoiceReasonDto, user: AuthenticatedUser) {
    const current = await this.validation.requireInvoice(id);
    if (current.status === InvoiceStatus.APPROVED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'An approved invoice cannot be rejected',
        ErrorCodes.INVOICE_ALREADY_APPROVED,
      );
    }
    if (
      current.status === InvoiceStatus.MATCHED &&
      current.workflowInstanceId
    ) {
      await this.workflowService.act(
        current.workflowInstanceId.toString(),
        { action: WorkflowActionType.REJECT, reason: dto.reason.trim() },
        user,
      );
      return this.validation.requireInvoice(id);
    }
    assertInvoiceTransition(current.status, InvoiceStatus.REJECTED);
    const updated = await this.transition(current, InvoiceStatus.REJECTED, {
      rejectionReason: dto.reason.trim(),
      updatedBy: objectId(user.userId),
    });
    await this.slaService.complete('INVOICE', updated._id.toString());
    this.events.log('Invoice rejected', updated, user.userId);
    await this.events.audit(AuditAction.INVOICE_REJECTED, updated, undefined, {
      status: InvoiceStatus.REJECTED,
      reason: dto.reason.trim(),
    });
    await this.events.notify({
      eventType: NotificationEventType.INVOICE_REJECTED,
      invoice: updated,
      title: 'Invoice rejected',
      body: dto.reason.trim(),
      includeCreator: true,
    });
    return updated;
  }

  private async onWorkflowOutcome(outcome: WorkflowOutcome): Promise<void> {
    if (outcome.entityType !== 'INVOICE') return;
    const current = await this.invoices
      .findOne({
        _id: objectId(outcome.entityId),
        tenantId: tenantObjectId(),
      })
      .lean<Invoice>()
      .exec();
    if (!current || current.status !== InvoiceStatus.MATCHED) return;
    if (outcome.instanceStatus === WorkflowInstanceStatus.APPROVED) {
      const updated = await this.transition(current, InvoiceStatus.APPROVED, {
        updatedBy: objectId(outcome.actorUserId),
      });
      await this.slaService.complete('INVOICE', updated._id.toString());
      this.events.log('Invoice approved', updated, outcome.actorUserId);
      await this.events.audit(
        AuditAction.INVOICE_APPROVED,
        updated,
        undefined,
        {
          status: InvoiceStatus.APPROVED,
        },
      );
      await this.events.notify({
        eventType: NotificationEventType.INVOICE_APPROVED,
        invoice: updated,
        title: 'Invoice approved',
        body: `${updated.invoiceNumber} was approved. Payment is not released in this phase.`,
        includeCreator: true,
      });
      return;
    }
    if (outcome.instanceStatus === WorkflowInstanceStatus.REJECTED) {
      const updated = await this.transition(current, InvoiceStatus.REJECTED, {
        rejectionReason: outcome.reason,
        updatedBy: objectId(outcome.actorUserId),
      });
      await this.events.audit(
        AuditAction.INVOICE_REJECTED,
        updated,
        undefined,
        {
          status: InvoiceStatus.REJECTED,
          reason: outcome.reason,
        },
      );
      await this.events.notify({
        eventType: NotificationEventType.INVOICE_REJECTED,
        invoice: updated,
        title: 'Invoice rejected',
        body: outcome.reason ?? `${updated.invoiceNumber} was rejected`,
        includeCreator: true,
      });
      return;
    }
    if (outcome.instanceStatus === WorkflowInstanceStatus.SENT_BACK) {
      const updated = await this.transition(
        current,
        InvoiceStatus.ACCOUNTS_REVIEW,
        {
          correctionOpen: true,
          matchStatus: InvoiceMatchStatus.PENDING,
          updatedBy: objectId(outcome.actorUserId),
        },
      );
      await this.events.audit(
        AuditAction.INVOICE_SENT_BACK,
        updated,
        undefined,
        {
          status: InvoiceStatus.ACCOUNTS_REVIEW,
          reason: outcome.reason,
        },
      );
    }
  }

  private async transition(
    current: Invoice,
    status: InvoiceStatus,
    patch: Record<string, unknown>,
  ) {
    const updated = await this.invoices
      .findOneAndUpdate(
        {
          _id: current._id,
          tenantId: tenantObjectId(),
          status: current.status,
        },
        { $set: { ...patch, status } },
        { new: true },
      )
      .lean<Invoice>()
      .exec();
    if (!updated) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Invoice status changed before it could be updated',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    return updated;
  }

  private async remainingQuantities(
    purchaseOrderId: Types.ObjectId,
    poItems: PurchaseOrderItem[],
  ) {
    const rows = await this.invoices
      .aggregate<{ _id: Types.ObjectId; quantity: number }>([
        {
          $match: {
            tenantId: tenantObjectId(),
            purchaseOrderId,
            status: { $in: CONSUMED_INVOICE_STATUSES },
          },
        },
        {
          $lookup: {
            from: 'invoice_items',
            let: { invoiceId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$invoiceId', '$$invoiceId'] },
                      { $eq: ['$tenantId', tenantObjectId()] },
                    ],
                  },
                },
              },
            ],
            as: 'items',
          },
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.purchaseOrderItemId',
            quantity: { $sum: '$items.invoicedQuantity' },
          },
        },
      ])
      .exec();
    const consumed = new Map(
      rows.map((row) => [row._id.toString(), fromMilli(toMilli(row.quantity))]),
    );
    return poItems.map((item) => {
      const previously = consumed.get(item._id.toString()) ?? 0;
      return {
        purchaseOrderItemId: item._id,
        poQuantity: item.quantity,
        previouslyInvoicedQuantity: previously,
        remainingInvoiceableQuantity: fromMilli(
          Math.max(toMilli(item.quantity) - toMilli(previously), 0),
        ),
      };
    });
  }
}
