import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { ErrorCodes } from '../../common/constants/error-codes';
import { WorkflowModule } from '../../common/constants/modules';
import { AppException } from '../../common/exceptions/app.exception';
import { RedisService } from '../../redis/redis.service';
import { runInTransactionWithRetry } from '../../common/utils/mongo-transaction';
import { GrnStatus } from '../../grn/enums/grn.enums';
import { GrnItem } from '../../grn/schemas/grn-item.schema';
import { Grn } from '../../grn/schemas/grn.schema';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { PurchaseOrderItem } from '../../purchase-orders/schemas/purchase-order-item.schema';
import { PurchaseOrder } from '../../purchase-orders/schemas/purchase-order.schema';
import { fromMilli, toMilli } from '../../purchase-orders/utils/po-math';
import { SlaService } from '../../sla/services/sla.service';
import { TenantsService } from '../../tenants/services/tenants.service';
import { ProjectsService } from '../../projects/services/projects.service';
import { WorkflowService } from '../../workflow/services/workflow.service';
import { matchIdempotencyKey, poMatchLockKey } from '../constants';
import { InvoiceReferenceType } from '../enums/invoice-reference-type.enum';
import { InvoiceMatchStatus } from '../enums/invoice-match-status.enum';
import {
  CONSUMED_INVOICE_STATUSES,
  InvoiceStatus,
} from '../enums/invoice-status.enum';
import { ThreeWayMatchResult } from '../interfaces/invoice-match-result.interface';
import { InvoiceItem } from '../schemas/invoice-item.schema';
import { InvoiceMatchLock } from '../schemas/invoice-match-lock.schema';
import { InvoiceMatchResult } from '../schemas/invoice-match-result.schema';
import { InvoiceReference } from '../schemas/invoice-reference.schema';
import { Invoice } from '../schemas/invoice.schema';
import { delay, objectId, tenantObjectId } from '../utils/invoice-context';
import { evaluateThreeWayMatch } from '../utils/invoice-match.engine';
import {
  assertInvoiceTransition,
  assertMatchable,
} from '../utils/invoice-status';
import { InvoiceEventsService } from './invoice-events.service';
import { InvoiceValidationService } from './invoice-validation.service';

@Injectable()
export class InvoiceMatchService {
  private readonly logger = new Logger(InvoiceMatchService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(InvoiceItem.name)
    private readonly invoiceItems: Model<InvoiceItem>,
    @InjectModel(InvoiceReference.name)
    private readonly references: Model<InvoiceReference>,
    @InjectModel(InvoiceMatchResult.name)
    private readonly results: Model<InvoiceMatchResult>,
    @InjectModel(InvoiceMatchLock.name)
    private readonly locks: Model<InvoiceMatchLock>,
    @InjectModel(PurchaseOrder.name)
    private readonly orders: Model<PurchaseOrder>,
    @InjectModel(PurchaseOrderItem.name)
    private readonly poItems: Model<PurchaseOrderItem>,
    @InjectModel(Grn.name) private readonly grns: Model<Grn>,
    @InjectModel(GrnItem.name) private readonly grnItems: Model<GrnItem>,
    private readonly validation: InvoiceValidationService,
    private readonly tenantsService: TenantsService,
    private readonly projectsService: ProjectsService,
    private readonly workflowService: WorkflowService,
    private readonly slaService: SlaService,
    private readonly events: InvoiceEventsService,
    private readonly redis: RedisService,
  ) {}

  async runThreeWayMatch(id: string, user: AuthenticatedUser) {
    const current = await this.validation.requireInvoice(id);
    if (current.status === InvoiceStatus.APPROVED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'An approved invoice cannot be matched again',
        ErrorCodes.INVOICE_ALREADY_APPROVED,
      );
    }
    if (current.status === InvoiceStatus.MATCHED) {
      return this.latestResponse(current);
    }
    assertMatchable(current.status);
    const key = matchIdempotencyKey(
      current.tenantId.toString(),
      current._id.toString(),
    );
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const again = await this.validation.requireInvoice(id);
      if (again.status === InvoiceStatus.MATCHED) {
        return this.latestResponse(again);
      }
      if (again.status === InvoiceStatus.APPROVED) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'An approved invoice cannot be matched again',
          ErrorCodes.INVOICE_ALREADY_APPROVED,
        );
      }
      const acquired = await this.redis.setIfAbsent(key, user.userId, 45);
      if (!acquired) {
        await delay(40 * (attempt + 1));
        continue;
      }
      try {
        return await this.executeMatch(again, user);
      } finally {
        await this.redis.del(key);
      }
    }
    throw new AppException(
      HttpStatus.CONFLICT,
      'Invoice match is already in progress',
      ErrorCodes.ALREADY_PROCESSED,
    );
  }

  private async executeMatch(invoice: Invoice, user: AuthenticatedUser) {
    const poKey = poMatchLockKey(
      invoice.tenantId.toString(),
      invoice.purchaseOrderId.toString(),
    );
    let poLocked = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      poLocked = await this.redis.setIfAbsent(
        poKey,
        invoice._id.toString(),
        45,
      );
      if (poLocked) break;
      await delay(30 * (attempt + 1));
    }
    if (!poLocked) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Another invoice is matching against this purchase order',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    try {
      this.events.log('3-way match started', invoice, user.userId);
      await this.events.audit(
        AuditAction.INVOICE_MATCH_STARTED,
        invoice,
        undefined,
        { status: InvoiceStatus.MATCH_PENDING },
      );
      const saved = await runInTransactionWithRetry(
        this.connection,
        async (session) =>
          this.persistMatch(invoice._id.toString(), user, session),
      );
      const updated = await this.validation.requireInvoice(
        invoice._id.toString(),
      );
      this.events.log(
        saved.result.status === 'MATCH'
          ? '3-way match completed'
          : '3-way match mismatch',
        updated,
        user.userId,
      );
      await this.events.audit(
        saved.result.status === 'MATCH'
          ? AuditAction.INVOICE_MATCH_COMPLETED
          : AuditAction.INVOICE_MISMATCHED,
        updated,
        undefined,
        {
          status: updated.status,
          matchStatus: updated.matchStatus,
          issues: saved.result.issues,
        },
      );
      await this.events.notify({
        eventType:
          saved.result.status === 'MATCH'
            ? NotificationEventType.INVOICE_MATCH_COMPLETED
            : NotificationEventType.INVOICE_MISMATCH,
        invoice: updated,
        title:
          saved.result.status === 'MATCH'
            ? 'Invoice matched'
            : 'Invoice mismatch',
        body: `${updated.invoiceNumber} is ${saved.result.status}`,
        includeCreator: true,
      });
      if (saved.result.status === 'MATCH') {
        await this.slaService.complete('INVOICE', updated._id.toString());
        await this.startApprovalWorkflow(updated, user);
      }
      return this.toResponse(saved.resultDoc, saved.result);
    } finally {
      await this.redis.del(poKey);
    }
  }

  private async persistMatch(
    invoiceId: string,
    user: AuthenticatedUser,
    session?: ClientSession,
  ) {
    const invoice = await this.validation.requireInvoice(invoiceId, session);
    await this.locks
      .updateOne(
        {
          tenantId: tenantObjectId(),
          purchaseOrderId: invoice.purchaseOrderId,
        },
        {
          $inc: { version: 1 },
          $setOnInsert: {
            tenantId: tenantObjectId(),
            purchaseOrderId: invoice.purchaseOrderId,
          },
        },
        { upsert: true, session },
      )
      .exec();
    const current = await this.validation.requireInvoice(invoiceId, session);
    if (
      current.status === InvoiceStatus.MATCHED ||
      current.status === InvoiceStatus.APPROVED
    ) {
      const existing = await this.latest(current);
      if (!existing) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'Match result is missing',
          ErrorCodes.INVOICE_ALREADY_MATCHED,
        );
      }
      return {
        result: this.fromDocument(existing),
        resultDoc: existing,
      };
    }
    assertMatchable(current.status);
    if (current.status !== InvoiceStatus.MATCH_PENDING) {
      assertInvoiceTransition(current.status, InvoiceStatus.MATCH_PENDING);
    }
    const order = await this.bind(
      this.orders.findOne({
        _id: current.purchaseOrderId,
        tenantId: tenantObjectId(),
      }),
      session,
    )
      .lean<PurchaseOrder>()
      .exec();
    if (!order) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Purchase order not found',
        ErrorCodes.PO_NOT_FOUND,
      );
    }
    const [poLines, invoiceLines, refs] = await Promise.all([
      this.bind(
        this.poItems.find({
          tenantId: tenantObjectId(),
          purchaseOrderId: order._id,
        }),
        session,
      )
        .lean<PurchaseOrderItem[]>()
        .exec(),
      this.bind(
        this.invoiceItems.find({
          tenantId: tenantObjectId(),
          invoiceId: current._id,
        }),
        session,
      )
        .lean<InvoiceItem[]>()
        .exec(),
      this.bind(
        this.references.find({
          tenantId: tenantObjectId(),
          invoiceId: current._id,
          referenceType: InvoiceReferenceType.GRN,
        }),
        session,
      )
        .lean<InvoiceReference[]>()
        .exec(),
    ]);
    if (invoiceLines.length === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Invoice has no items',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const grnIds = refs
      .map((row) => row.grnId)
      .filter((value): value is Types.ObjectId => Boolean(value));
    const grns = await this.bind(
      this.grns.find({
        _id: { $in: grnIds },
        tenantId: tenantObjectId(),
        purchaseOrderId: order._id,
        status: GrnStatus.APPROVED,
      }),
      session,
    )
      .lean<Grn[]>()
      .exec();
    const received = await this.receivedQuantities(
      grns.map((grn) => grn._id),
      order._id,
      session,
    );
    const previously = await this.previouslyInvoiced(
      order._id,
      current._id,
      session,
    );
    const poById = new Map(poLines.map((line) => [line._id.toString(), line]));
    const tenant = await this.tenantsService.findByIdOrThrow(
      tenantObjectId().toString(),
    );
    const result = evaluateThreeWayMatch({
      poTotalAmount: order.grandTotal,
      invoiceTotalAmount: current.totalAmount,
      additionalCharges: current.additionalCharges,
      tolerance: {
        percent: tenant.settings.invoiceTolerancePercent ?? 0,
        amount: tenant.settings.invoiceToleranceAmount ?? 0,
      },
      lines: invoiceLines.map((line) => {
        const poLine = poById.get(line.purchaseOrderItemId.toString());
        if (!poLine) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            'Invoice item is not on the purchase order',
            ErrorCodes.VALIDATION_ERROR,
          );
        }
        return {
          invoiceItemId: line._id.toString(),
          purchaseOrderItemId: poLine._id.toString(),
          poQuantity: poLine.quantity,
          receivedQuantity: received.get(poLine._id.toString()) ?? 0,
          previouslyInvoicedQuantity:
            previously.get(poLine._id.toString()) ?? 0,
          invoiceQuantity: line.invoicedQuantity,
          poUnitPrice: poLine.unitRate,
          invoiceUnitPrice: line.unitPrice,
          poDiscount: poLine.discount,
          poTaxRate: poLine.taxRate,
          invoiceAmount: line.lineAmount,
        };
      }),
    });
    if (result.status === 'MATCH' && result.issues.length > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'A mismatch cannot be stored as a match',
        ErrorCodes.QUANTITY_MISMATCH,
      );
    }
    const nextStatus =
      result.status === 'MATCH'
        ? InvoiceStatus.MATCHED
        : InvoiceStatus.MISMATCH;
    assertInvoiceTransition(InvoiceStatus.MATCH_PENDING, nextStatus);
    const [stored] = await this.results.create(
      [
        {
          tenantId: tenantObjectId(),
          invoiceId: current._id,
          purchaseOrderId: order._id,
          grnIds: grns.map((grn) => grn._id),
          matchStatus:
            result.status === 'MATCH'
              ? InvoiceMatchStatus.MATCH
              : InvoiceMatchStatus.MISMATCH,
          matchedAt: new Date(),
          matchedBy: objectId(user.userId),
          poTotalAmount: result.poTotalAmount,
          invoiceTotalAmount: result.invoiceTotalAmount,
          receivedTotalAmount: result.receivedTotalAmount,
          quantityVariance: result.quantityVariance,
          amountVariance: result.amountVariance,
          toleranceApplied: result.toleranceApplied,
          lineResults: result.lines,
          issues: result.issues,
          summary: result.summary,
          quantityMatched: result.quantityMatched,
          amountMatched: result.amountMatched,
        },
      ],
      session ? { session } : undefined,
    );
    await this.invoices.updateOne(
      { _id: current._id, tenantId: tenantObjectId() },
      {
        $set: {
          status: nextStatus,
          matchStatus:
            result.status === 'MATCH'
              ? InvoiceMatchStatus.MATCH
              : InvoiceMatchStatus.MISMATCH,
          latestMatchResultId: stored._id,
          correctionOpen: false,
          updatedBy: objectId(user.userId),
        },
      },
      session ? { session } : undefined,
    );
    return { result, resultDoc: stored.toObject() };
  }

  private bind<T extends { session(value: ClientSession): T }>(
    query: T,
    session?: ClientSession,
  ): T {
    return session ? query.session(session) : query;
  }

  private async startApprovalWorkflow(
    invoice: Invoice,
    user: AuthenticatedUser,
  ) {
    try {
      const project = await this.projectsService.findById(
        invoice.projectId.toString(),
      );
      const instance = await this.workflowService.start(
        {
          module: WorkflowModule.INVOICE_APPROVAL,
          entityType: 'INVOICE',
          entityId: invoice._id.toString(),
          context: {
            projectId: invoice.projectId.toString(),
            projectHeadUserId: project.projectHead?.toString(),
            purchaseOrderId: invoice.purchaseOrderId.toString(),
            invoiceTotal: invoice.totalAmount,
          },
        },
        user,
      );
      await this.invoices.updateOne(
        { _id: invoice._id, tenantId: tenantObjectId() },
        { $set: { workflowInstanceId: instance._id } },
      );
    } catch (error) {
      if (
        error instanceof AppException &&
        (error.errorCode === ErrorCodes.WORKFLOW_NOT_FOUND ||
          error.errorCode === ErrorCodes.CONFLICT)
      ) {
        this.logger.warn({
          msg: 'Invoice matched without a new approval workflow',
          tenantId: invoice.tenantId.toString(),
          invoiceId: invoice._id.toString(),
          purchaseOrderId: invoice.purchaseOrderId.toString(),
          userId: user.userId,
          errorCode: error.errorCode,
        });
        return;
      }
      throw error;
    }
  }

  private async previouslyInvoiced(
    purchaseOrderId: Types.ObjectId,
    excludeInvoiceId: Types.ObjectId,
    session?: ClientSession,
  ) {
    const pipeline = this.invoices.aggregate<{
      _id: Types.ObjectId;
      quantity: number;
    }>([
      {
        $match: {
          tenantId: tenantObjectId(),
          purchaseOrderId,
          status: { $in: CONSUMED_INVOICE_STATUSES },
          _id: { $ne: excludeInvoiceId },
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
    ]);
    if (session) pipeline.session(session);
    const rows = await pipeline.exec();
    return new Map(
      rows.map((row) => [row._id.toString(), fromMilli(toMilli(row.quantity))]),
    );
  }

  private async receivedQuantities(
    grnIds: Types.ObjectId[],
    purchaseOrderId: Types.ObjectId,
    session?: ClientSession,
  ) {
    const pipeline = this.grnItems.aggregate<{
      _id: Types.ObjectId;
      quantity: number;
    }>([
      {
        $match: {
          tenantId: tenantObjectId(),
          grnId: { $in: grnIds },
        },
      },
      {
        $lookup: {
          from: 'grns',
          let: { grnId: '$grnId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$grnId'] },
                tenantId: tenantObjectId(),
                purchaseOrderId,
                status: GrnStatus.APPROVED,
              },
            },
            { $project: { _id: 1 } },
          ],
          as: 'grn',
        },
      },
      { $match: { 'grn.0': { $exists: true } } },
      {
        $group: {
          _id: '$purchaseOrderItemId',
          quantity: { $sum: '$acceptedQuantity' },
        },
      },
    ]);
    if (session) pipeline.session(session);
    const rows = await pipeline.exec();
    return new Map(
      rows.map((row) => [row._id.toString(), fromMilli(toMilli(row.quantity))]),
    );
  }

  private async latest(invoice: Invoice) {
    return this.results
      .findOne({ tenantId: tenantObjectId(), invoiceId: invoice._id })
      .sort({ createdAt: -1 })
      .lean<InvoiceMatchResult>()
      .exec();
  }

  private async latestResponse(invoice: Invoice) {
    const existing = await this.latest(invoice);
    if (!existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Invoice is already matched',
        ErrorCodes.INVOICE_ALREADY_MATCHED,
      );
    }
    return this.toResponse(existing, this.fromDocument(existing));
  }

  private fromDocument(doc: InvoiceMatchResult): ThreeWayMatchResult {
    return {
      status:
        doc.matchStatus === InvoiceMatchStatus.MATCH ? 'MATCH' : 'MISMATCH',
      quantityMatched: doc.quantityMatched,
      amountMatched: doc.amountMatched,
      lines: doc.lineResults,
      summary: doc.summary,
      issues: doc.issues,
      toleranceApplied: doc.toleranceApplied,
      poTotalAmount: doc.poTotalAmount,
      invoiceTotalAmount: doc.invoiceTotalAmount,
      receivedTotalAmount: doc.receivedTotalAmount,
      quantityVariance: doc.quantityVariance,
      amountVariance: doc.amountVariance,
    };
  }

  private toResponse(doc: InvoiceMatchResult, result: ThreeWayMatchResult) {
    return {
      ...result,
      matchResultId: doc._id.toString(),
      invoiceId: doc.invoiceId.toString(),
      purchaseOrderId: doc.purchaseOrderId.toString(),
      grnIds: doc.grnIds.map((id) => id.toString()),
      matchedAt: doc.matchedAt,
      matchedBy: doc.matchedBy.toString(),
    };
  }
}
