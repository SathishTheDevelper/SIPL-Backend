import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { MongoServerError } from 'mongodb';
import { BusinessModule } from '../../common/constants/modules';
import { ErrorCodes } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { CustomFieldValidationService } from '../../custom-fields/services/custom-field-validation.service';
import { GrnStatus } from '../../grn/enums/grn.enums';
import { GrnItem } from '../../grn/schemas/grn-item.schema';
import { Grn } from '../../grn/schemas/grn.schema';
import { PurchaseOrderStatus } from '../../purchase-orders/enums/purchase-order.enums';
import { PurchaseOrderItem } from '../../purchase-orders/schemas/purchase-order-item.schema';
import { PurchaseOrder } from '../../purchase-orders/schemas/purchase-order.schema';
import { VendorSource } from '../../purchase-orders/schemas/upstream.schema';
import {
  computeLine,
  fromMilli,
  fromMinor,
  lineGrossMinor,
  toMilli,
  toMinor,
} from '../../purchase-orders/utils/po-math';
import { ProjectsService } from '../../projects/services/projects.service';
import { SitesService } from '../../sites/services/sites.service';
import { AttachmentMetaDto } from '../../attachments/dto/attachment.dto';
import { InvoiceItemDto } from '../dto/invoice-item.dto';
import {
  CONSUMED_INVOICE_STATUSES,
  InvoiceStatus,
} from '../enums/invoice-status.enum';
import { Invoice } from '../schemas/invoice.schema';
import { assertInvoiceAttachments } from '../utils/invoice-attachments';
import {
  invoiceNotFound,
  objectId,
  tenantObjectId,
} from '../utils/invoice-context';
import { amountWithinTolerance } from '../utils/invoice-match.engine';

const INVOICEABLE_PO_STATUSES = [
  PurchaseOrderStatus.APPROVED,
  PurchaseOrderStatus.SENT_TO_VENDOR,
  PurchaseOrderStatus.ACKNOWLEDGED,
  PurchaseOrderStatus.PARTIALLY_DELIVERED,
  PurchaseOrderStatus.FULLY_DELIVERED,
];

export interface PreparedInvoiceItem {
  purchaseOrderItemId: Types.ObjectId;
  materialId: Types.ObjectId;
  description?: string;
  orderedQuantity: number;
  invoicedQuantity: number;
  receivedQuantity: number;
  unit: string;
  unitId: Types.ObjectId;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  lineAmount: number;
}

@Injectable()
export class InvoiceValidationService {
  constructor(
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(PurchaseOrder.name)
    private readonly orders: Model<PurchaseOrder>,
    @InjectModel(PurchaseOrderItem.name)
    private readonly poItems: Model<PurchaseOrderItem>,
    @InjectModel(VendorSource.name)
    private readonly vendors: Model<VendorSource>,
    @InjectModel(Grn.name) private readonly grns: Model<Grn>,
    @InjectModel(GrnItem.name) private readonly grnItems: Model<GrnItem>,
    private readonly projectsService: ProjectsService,
    private readonly sitesService: SitesService,
    private readonly customFields: CustomFieldValidationService,
  ) {}

  async requireInvoice(id: string, session?: ClientSession): Promise<Invoice> {
    const query = this.invoices.findOne({
      _id: objectId(id),
      tenantId: tenantObjectId(),
    });
    if (session) query.session(session);
    const invoice = await query.lean<Invoice>().exec();
    if (!invoice) invoiceNotFound();
    return invoice;
  }

  async requirePurchaseOrder(id: string): Promise<PurchaseOrder> {
    const order = await this.orders
      .findOne({ _id: objectId(id), tenantId: tenantObjectId() })
      .lean<PurchaseOrder>()
      .exec();
    if (!order) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Purchase order not found',
        ErrorCodes.PO_NOT_FOUND,
      );
    }
    if (order.status === PurchaseOrderStatus.CANCELLED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'A cancelled purchase order cannot be invoiced',
        ErrorCodes.INVALID_PO,
      );
    }
    if (!INVOICEABLE_PO_STATUSES.includes(order.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Purchase order is not ready for invoicing',
        ErrorCodes.INVALID_PO,
      );
    }
    return order;
  }

  async requireVendor(vendorId: string, order: PurchaseOrder) {
    if (order.vendorId.toString() !== vendorId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Invoice vendor does not match the purchase order vendor',
        ErrorCodes.VENDOR_PO_MISMATCH,
      );
    }
    const vendor = await this.vendors
      .findOne({ _id: objectId(vendorId), tenantId: tenantObjectId() })
      .lean<VendorSource>()
      .exec();
    if (!vendor) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Vendor not found',
        ErrorCodes.VENDOR_NOT_FOUND,
      );
    }
    return vendor;
  }

  async requireGrns(grnIds: string[], order: PurchaseOrder): Promise<Grn[]> {
    const unique = [...new Set(grnIds)];
    if (unique.length !== grnIds.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Duplicate GRN reference',
        ErrorCodes.INVALID_GRN_REFERENCE,
      );
    }
    const rows = await this.grns
      .find({
        _id: { $in: unique.map((id) => objectId(id)) },
        tenantId: tenantObjectId(),
      })
      .lean<Grn[]>()
      .exec();
    if (rows.length !== unique.length) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'GRN not found',
        ErrorCodes.GRN_NOT_FOUND,
      );
    }
    for (const grn of rows) {
      if (grn.purchaseOrderId.toString() !== order._id.toString()) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'GRN does not belong to the selected purchase order',
          ErrorCodes.GRN_PO_MISMATCH,
        );
      }
      if (grn.status === GrnStatus.CANCELLED) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'A cancelled GRN cannot be invoiced',
          ErrorCodes.INVALID_GRN,
        );
      }
      if (grn.status !== GrnStatus.APPROVED) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'Only an approved GRN can be invoiced',
          ErrorCodes.INVALID_GRN,
        );
      }
      if (
        grn.projectId.toString() !== order.projectId.toString() ||
        grn.siteId.toString() !== order.siteId.toString()
      ) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'GRN project or site does not match the purchase order',
          ErrorCodes.INVALID_GRN_REFERENCE,
        );
      }
    }
    await this.projectsService.findById(order.projectId.toString());
    await this.sitesService.findById(order.siteId.toString());
    return rows;
  }

  async prepareItems(
    order: PurchaseOrder,
    grns: Grn[],
    items: InvoiceItemDto[],
  ): Promise<{
    items: PreparedInvoiceItem[];
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    lineTotal: number;
  }> {
    const poItems = await this.poItems
      .find({
        tenantId: tenantObjectId(),
        purchaseOrderId: order._id,
      })
      .lean<PurchaseOrderItem[]>()
      .exec();
    const byId = new Map(poItems.map((item) => [item._id.toString(), item]));
    const received = await this.receivedByItem(grns.map((grn) => grn._id));
    const prepared: PreparedInvoiceItem[] = [];
    for (const line of items) {
      const poItem = byId.get(line.purchaseOrderItemId);
      if (!poItem) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Invoice item is not on the purchase order',
          ErrorCodes.VALIDATION_ERROR,
        );
      }
      if (line.materialId && line.materialId !== poItem.materialId.toString()) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Invoice material does not match the purchase order item',
          ErrorCodes.VALIDATION_ERROR,
        );
      }
      const unitPrice = line.unitPrice ?? poItem.unitRate;
      const taxRate = line.taxRate ?? poItem.taxRate ?? 0;
      const discountAmount = line.discountAmount ?? 0;
      const computed = computeLine({
        quantity: line.invoicedQuantity,
        unitRate: unitPrice,
        discount: discountAmount,
        taxRate,
      });
      const lineAmount = line.lineAmount ?? computed.lineTotal;
      prepared.push({
        purchaseOrderItemId: poItem._id,
        materialId: poItem.materialId,
        description: line.description ?? poItem.description,
        orderedQuantity: poItem.quantity,
        invoicedQuantity: computed.quantity,
        receivedQuantity: received.get(poItem._id.toString()) ?? 0,
        unit: line.unit?.trim() || 'UNIT',
        unitId: poItem.unitId,
        unitPrice: computed.unitRate,
        taxRate,
        taxAmount: line.taxAmount ?? computed.taxAmount,
        discountAmount: computed.discount,
        lineAmount,
      });
    }
    const gross = fromMinor(
      prepared.reduce(
        (sum, line) =>
          sum + lineGrossMinor(line.invoicedQuantity, line.unitPrice),
        0,
      ),
    );
    return {
      items: prepared,
      subtotal: gross,
      taxAmount: fromMinor(
        prepared.reduce((sum, line) => sum + toMinor(line.taxAmount), 0),
      ),
      discountAmount: fromMinor(
        prepared.reduce((sum, line) => sum + toMinor(line.discountAmount), 0),
      ),
      lineTotal: fromMinor(
        prepared.reduce((sum, line) => sum + toMinor(line.lineAmount), 0),
      ),
    };
  }

  assertTotals(input: {
    lineTotal: number;
    additionalCharges: number;
    totalAmount: number;
  }): void {
    const expected = fromMinor(
      toMinor(input.lineTotal) + toMinor(input.additionalCharges),
    );
    if (
      !amountWithinTolerance(expected, input.totalAmount, {
        percent: 0,
        amount: 0.05,
      })
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Invoice total does not match the invoice lines',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
  }

  async assertVendorInvoiceAvailable(
    vendorId: string,
    vendorInvoiceNumber: string,
    excludeInvoiceId?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      tenantId: tenantObjectId(),
      vendorId: objectId(vendorId),
      vendorInvoiceNumber: vendorInvoiceNumber.trim(),
    };
    if (excludeInvoiceId) filter._id = { $ne: objectId(excludeInvoiceId) };
    const existing = await this.invoices.findOne(filter).lean().exec();
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Invoice number already exists for this vendor',
        ErrorCodes.DUPLICATE_INVOICE_NUMBER,
      );
    }
  }

  validateAttachments(
    files: AttachmentMetaDto[] | undefined,
    required = false,
  ): void {
    assertInvoiceAttachments(files, required);
  }

  async validateCustomFields(values?: Record<string, unknown>) {
    return this.customFields.validate(BusinessModule.INVOICE, values);
  }

  rethrowDuplicate(error: unknown): never {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Invoice number already exists for this tenant',
        ErrorCodes.DUPLICATE_INVOICE_NUMBER,
      );
    }
    throw error;
  }

  consumedStatuses(): InvoiceStatus[] {
    return CONSUMED_INVOICE_STATUSES;
  }

  private async receivedByItem(grnIds: Types.ObjectId[]) {
    const rows = await this.grnItems
      .find({
        tenantId: tenantObjectId(),
        grnId: { $in: grnIds },
      })
      .lean<GrnItem[]>()
      .exec();
    const totals = new Map<string, number>();
    for (const row of rows) {
      const key = row.purchaseOrderItemId.toString();
      const current = totals.get(key) ?? 0;
      totals.set(
        key,
        fromMilli(toMilli(current) + toMilli(row.acceptedQuantity)),
      );
    }
    return totals;
  }
}
