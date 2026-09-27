import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { MongoServerError } from 'mongodb';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AttachmentsService } from '../../attachments/services/attachments.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { DocumentType } from '../../common/constants/modules';
import { ErrorCodes } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { runInTransactionWithRetry } from '../../common/utils/mongo-transaction';
import { EntityAttachment } from '../../attachments/schemas/entity-attachment.schema';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { NumberingService } from '../../numbering/services/numbering.service';
import { TenantsService } from '../../tenants/services/tenants.service';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { InvoiceListQueryDto } from '../dto/invoice-list-query.dto';
import { InvoiceReasonDto } from '../dto/hold-invoice.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';
import { InvoiceReferenceType } from '../enums/invoice-reference-type.enum';
import { InvoiceMatchStatus } from '../enums/invoice-match-status.enum';
import { InvoiceStatus } from '../enums/invoice-status.enum';
import { InvoiceType } from '../enums/invoice-type.enum';
import { InvoiceItem } from '../schemas/invoice-item.schema';
import { InvoiceReference } from '../schemas/invoice-reference.schema';
import { Invoice } from '../schemas/invoice.schema';
import { objectId, tenantObjectId } from '../utils/invoice-context';
import { invoicePage, buildInvoiceFilter } from '../utils/invoice-query';
import {
  assertInvoiceEditable,
  assertInvoiceTransition,
} from '../utils/invoice-status';
import { InvoiceEventsService } from './invoice-events.service';
import { InvoiceValidationService } from './invoice-validation.service';

@Injectable()
export class InvoiceService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(InvoiceItem.name)
    private readonly invoiceItems: Model<InvoiceItem>,
    @InjectModel(InvoiceReference.name)
    private readonly references: Model<InvoiceReference>,
    @InjectModel(EntityAttachment.name)
    private readonly attachmentModel: Model<EntityAttachment>,
    private readonly validation: InvoiceValidationService,
    private readonly numberingService: NumberingService,
    private readonly attachments: AttachmentsService,
    private readonly tenantsService: TenantsService,
    private readonly events: InvoiceEventsService,
  ) {}

  async create(dto: CreateInvoiceDto, user: AuthenticatedUser) {
    const prepared = await this.prepare(dto);
    const customFields = await this.validation.validateCustomFields(
      dto.customFields,
    );
    await this.validation.assertVendorInvoiceAvailable(
      dto.vendorId,
      dto.vendorInvoiceNumber,
    );
    const tenant = await this.tenantsService.findByIdOrThrow(
      tenantObjectId().toString(),
    );
    const invoiceDate = new Date(dto.invoiceDate);
    const dueDate = dto.dueDate
      ? new Date(dto.dueDate)
      : new Date(
          invoiceDate.getTime() +
            tenant.settings.defaultPaymentTermsDays * 24 * 60 * 60 * 1000,
        );
    try {
      const id = await runInTransactionWithRetry(
        this.connection,
        async (session) => {
          const allocated = await this.numberingService.next(
            DocumentType.INVOICE,
            session,
          );
          const [invoice] = await this.invoices.create(
            [
              {
                tenantId: tenantObjectId(),
                invoiceNumber: allocated.number,
                vendorInvoiceNumber: dto.vendorInvoiceNumber.trim(),
                invoiceType: dto.invoiceType ?? InvoiceType.MATERIAL,
                invoiceDate,
                dueDate,
                vendorId: prepared.order.vendorId,
                vendorName: prepared.vendor.name,
                purchaseOrderId: prepared.order._id,
                poNumber: prepared.order.poNumber,
                projectId: prepared.order.projectId,
                siteId: prepared.order.siteId,
                currency: prepared.order.currency,
                subtotal: prepared.lines.subtotal,
                taxAmount: dto.taxAmount ?? prepared.lines.taxAmount,
                discountAmount:
                  dto.discountAmount ?? prepared.lines.discountAmount,
                additionalCharges: dto.additionalCharges ?? 0,
                totalAmount: dto.totalAmount,
                status: InvoiceStatus.DRAFT,
                matchStatus: InvoiceMatchStatus.PENDING,
                paymentTerms: dto.paymentTerms ?? prepared.order.paymentTerms,
                remarks: dto.remarks,
                customFields,
                createdBy: objectId(user.userId),
              },
            ],
            session ? { session } : undefined,
          );
          await this.invoiceItems.insertMany(
            prepared.lines.items.map((item) => ({
              ...item,
              tenantId: tenantObjectId(),
              invoiceId: invoice._id,
            })),
            session ? { session } : undefined,
          );
          await this.references.insertMany(
            [
              {
                tenantId: tenantObjectId(),
                invoiceId: invoice._id,
                purchaseOrderId: prepared.order._id,
                referenceType: InvoiceReferenceType.PO,
                referenceNumber: prepared.order.poNumber,
              },
              ...prepared.grns.map((grn) => ({
                tenantId: tenantObjectId(),
                invoiceId: invoice._id,
                purchaseOrderId: prepared.order._id,
                grnId: grn._id,
                referenceType: InvoiceReferenceType.GRN,
                referenceNumber: grn.grnNumber,
              })),
            ],
            session ? { session } : undefined,
          );
          const attachmentIds = await this.attachments.record(
            'INVOICE',
            invoice._id,
            dto.attachments,
            user.userId,
            session,
          );
          if (attachmentIds.length) {
            await this.invoices.updateOne(
              { _id: invoice._id, tenantId: tenantObjectId() },
              { $set: { attachments: attachmentIds } },
              session ? { session } : undefined,
            );
          }
          return invoice._id.toString();
        },
      );
      const created = await this.validation.requireInvoice(id);
      this.events.log('Invoice created', created, user.userId);
      await this.events.audit(AuditAction.INVOICE_CREATED, created, undefined, {
        invoiceNumber: created.invoiceNumber,
        vendorInvoiceNumber: created.vendorInvoiceNumber,
        purchaseOrderId: created.purchaseOrderId.toString(),
      });
      return this.get(id);
    } catch (error) {
      if (error instanceof MongoServerError) {
        this.validation.rethrowDuplicate(error);
      }
      throw error;
    }
  }

  async list(query: InvoiceListQueryDto) {
    const filter = buildInvoiceFilter(query);
    const { page, limit } = invoicePage(query);
    const { skip } = skipTake(page, limit);
    const [items, total] = await Promise.all([
      this.invoices
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<Invoice[]>()
        .exec(),
      this.invoices.countDocuments(filter).exec(),
    ]);
    return paginated(items, total, page, limit);
  }

  async get(id: string) {
    const invoice = await this.validation.requireInvoice(id);
    const [items, references, attachments] = await Promise.all([
      this.invoiceItems
        .find({ tenantId: tenantObjectId(), invoiceId: invoice._id })
        .lean()
        .exec(),
      this.references
        .find({ tenantId: tenantObjectId(), invoiceId: invoice._id })
        .lean()
        .exec(),
      this.attachmentModel
        .find({
          tenantId: tenantObjectId(),
          _id: { $in: invoice.attachments },
        })
        .lean()
        .exec(),
    ]);
    return { ...invoice, items, references, attachments };
  }

  async update(id: string, dto: UpdateInvoiceDto, user: AuthenticatedUser) {
    const current = await this.validation.requireInvoice(id);
    assertInvoiceEditable(current.status, current.correctionOpen);
    if (current.status !== InvoiceStatus.DRAFT && !dto.reason?.trim()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'A reason is required to correct an invoice',
        ErrorCodes.REASON_REQUIRED,
      );
    }
    const vendorInvoiceNumber =
      dto.vendorInvoiceNumber?.trim() ?? current.vendorInvoiceNumber;
    if (vendorInvoiceNumber !== current.vendorInvoiceNumber) {
      await this.validation.assertVendorInvoiceAvailable(
        current.vendorId.toString(),
        vendorInvoiceNumber,
        current._id.toString(),
      );
    }
    const customFields = dto.customFields
      ? await this.validation.validateCustomFields(dto.customFields)
      : current.customFields;
    if (dto.attachments) {
      this.validation.validateAttachments(dto.attachments, false);
    }
    const before = {
      vendorInvoiceNumber: current.vendorInvoiceNumber,
      totalAmount: current.totalAmount,
      remarks: current.remarks,
      status: current.status,
    };
    await runInTransactionWithRetry(this.connection, async (session) => {
      const patch: Record<string, unknown> = {
        vendorInvoiceNumber,
        invoiceDate: dto.invoiceDate
          ? new Date(dto.invoiceDate)
          : current.invoiceDate,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : current.dueDate,
        paymentTerms: dto.paymentTerms ?? current.paymentTerms,
        remarks: dto.remarks ?? current.remarks,
        customFields,
        additionalCharges: dto.additionalCharges ?? current.additionalCharges,
        totalAmount: dto.totalAmount ?? current.totalAmount,
        updatedBy: objectId(user.userId),
      };
      if (dto.invoiceItems || dto.grnIds) {
        const order = await this.validation.requirePurchaseOrder(
          current.purchaseOrderId.toString(),
        );
        const grnIds =
          dto.grnIds ??
          (
            await this.references
              .find({
                tenantId: tenantObjectId(),
                invoiceId: current._id,
                referenceType: InvoiceReferenceType.GRN,
              })
              .lean()
              .exec()
          )
            .map((row) => row.grnId?.toString())
            .filter((value): value is string => Boolean(value));
        const grns = await this.validation.requireGrns(grnIds, order);
        if (dto.invoiceItems) {
          const lines = await this.validation.prepareItems(
            order,
            grns,
            dto.invoiceItems,
          );
          this.validation.assertTotals({
            lineTotal: lines.lineTotal,
            additionalCharges: Number(patch.additionalCharges),
            totalAmount: Number(patch.totalAmount),
          });
          patch.subtotal = lines.subtotal;
          patch.taxAmount = lines.taxAmount;
          patch.discountAmount = lines.discountAmount;
          await this.invoiceItems.deleteMany(
            { tenantId: tenantObjectId(), invoiceId: current._id },
            session ? { session } : undefined,
          );
          await this.invoiceItems.insertMany(
            lines.items.map((item) => ({
              ...item,
              tenantId: tenantObjectId(),
              invoiceId: current._id,
            })),
            session ? { session } : undefined,
          );
        }
        if (dto.grnIds) {
          await this.references.deleteMany(
            {
              tenantId: tenantObjectId(),
              invoiceId: current._id,
              referenceType: InvoiceReferenceType.GRN,
            },
            session ? { session } : undefined,
          );
          await this.references.insertMany(
            grns.map((grn) => ({
              tenantId: tenantObjectId(),
              invoiceId: current._id,
              purchaseOrderId: order._id,
              grnId: grn._id,
              referenceType: InvoiceReferenceType.GRN,
              referenceNumber: grn.grnNumber,
            })),
            session ? { session } : undefined,
          );
        }
      }
      await this.invoices.updateOne(
        { _id: current._id, tenantId: tenantObjectId() },
        { $set: patch },
        session ? { session } : undefined,
      );
      if (dto.attachments?.length) {
        const attachmentIds = await this.attachments.record(
          'INVOICE',
          current._id,
          dto.attachments,
          user.userId,
          session,
        );
        await this.invoices.updateOne(
          { _id: current._id, tenantId: tenantObjectId() },
          { $addToSet: { attachments: { $each: attachmentIds } } },
          session ? { session } : undefined,
        );
      }
    });
    const updated = await this.validation.requireInvoice(id);
    this.events.log('Invoice updated', updated, user.userId);
    await this.events.audit(AuditAction.INVOICE_UPDATED, updated, before, {
      vendorInvoiceNumber: updated.vendorInvoiceNumber,
      totalAmount: updated.totalAmount,
      remarks: updated.remarks,
      reason: dto.reason,
      changedBy: user.userId,
      changedAt: new Date().toISOString(),
    });
    return this.get(id);
  }

  async submit(id: string, user: AuthenticatedUser) {
    const current = await this.validation.requireInvoice(id);
    if (current.status === InvoiceStatus.SUBMITTED) return this.get(id);
    assertInvoiceTransition(current.status, InvoiceStatus.SUBMITTED);
    const count = await this.invoiceItems.countDocuments({
      tenantId: tenantObjectId(),
      invoiceId: current._id,
    });
    if (count === 0 || current.attachments.length === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Invoice items and attachments are required before submit',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const updated = await this.invoices
      .findOneAndUpdate(
        {
          _id: current._id,
          tenantId: tenantObjectId(),
          status: InvoiceStatus.DRAFT,
        },
        {
          $set: {
            status: InvoiceStatus.SUBMITTED,
            submittedAt: new Date(),
            updatedBy: objectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Invoice>()
      .exec();
    if (!updated) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Invoice was already submitted',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    this.events.log('Invoice submitted', updated, user.userId);
    await this.events.audit(AuditAction.INVOICE_SUBMITTED, updated, undefined, {
      status: InvoiceStatus.SUBMITTED,
    });
    await this.events.notify({
      eventType: NotificationEventType.INVOICE_SUBMITTED,
      invoice: updated,
      title: 'Invoice submitted',
      body: `${updated.invoiceNumber} was submitted for accounts review`,
    });
    return this.get(id);
  }

  async cancel(id: string, dto: InvoiceReasonDto, user: AuthenticatedUser) {
    const current = await this.validation.requireInvoice(id);
    assertInvoiceTransition(current.status, InvoiceStatus.CANCELLED);
    const updated = await this.invoices
      .findOneAndUpdate(
        {
          _id: current._id,
          tenantId: tenantObjectId(),
          status: current.status,
        },
        {
          $set: {
            status: InvoiceStatus.CANCELLED,
            cancellationReason: dto.reason.trim(),
            updatedBy: objectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Invoice>()
      .exec();
    if (!updated) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Invoice could not be cancelled',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    this.events.log('Invoice cancelled', updated, user.userId);
    await this.events.audit(AuditAction.INVOICE_CANCELLED, updated, undefined, {
      status: InvoiceStatus.CANCELLED,
      reason: dto.reason.trim(),
    });
    return updated;
  }

  private async prepare(dto: CreateInvoiceDto) {
    this.validation.validateAttachments(dto.attachments, true);
    const order = await this.validation.requirePurchaseOrder(
      dto.purchaseOrderId,
    );
    const vendor = await this.validation.requireVendor(dto.vendorId, order);
    const grns = await this.validation.requireGrns(dto.grnIds, order);
    const lines = await this.validation.prepareItems(
      order,
      grns,
      dto.invoiceItems,
    );
    this.validation.assertTotals({
      lineTotal: lines.lineTotal,
      additionalCharges: dto.additionalCharges ?? 0,
      totalAmount: dto.totalAmount,
    });
    return { order, vendor, grns, lines };
  }
}
