import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { ErrorCodes } from '../../common/constants/error-codes';
import { TenantContext } from '../../common/context/tenant.context';
import { AppException } from '../../common/exceptions/app.exception';
import { GrnStatus } from '../../grn/enums/grn.enums';
import { PurchaseOrderStatus } from '../../purchase-orders/enums/purchase-order.enums';
import { assertInvoiceAttachments } from '../utils/invoice-attachments';
import { InvoiceValidationService } from './invoice-validation.service';

function lean(value: unknown) {
  const query = {
    lean: () => ({ exec: async () => value }),
    session: () => query,
  };
  return query;
}

describe('InvoiceValidationService', () => {
  const tenantId = new Types.ObjectId();
  const poId = new Types.ObjectId();
  const vendorId = new Types.ObjectId();
  const otherPo = new Types.ObjectId();

  function asTenant<T>(fn: () => Promise<T>) {
    return TenantContext.run(
      {
        tenantId: tenantId.toString(),
        userId: new Types.ObjectId().toString(),
        role: 'TENANT_ADMIN',
        permissions: [],
        isSuperAdmin: false,
      },
      fn,
    );
  }

  function service(overrides?: {
    order?: unknown;
    vendor?: unknown;
    grns?: unknown;
    invoice?: unknown;
  }) {
    const orders = {
      findOne: jest.fn().mockReturnValue(
        lean(
          overrides && 'order' in overrides
            ? overrides.order
            : {
                _id: poId,
                vendorId,
                projectId: new Types.ObjectId(),
                siteId: new Types.ObjectId(),
                status: PurchaseOrderStatus.PARTIALLY_DELIVERED,
              },
        ),
      ),
    };
    const vendors = {
      findOne: jest
        .fn()
        .mockReturnValue(
          lean(
            overrides && 'vendor' in overrides
              ? overrides.vendor
              : { _id: vendorId, name: 'Vendor' },
          ),
        ),
    };
    const grns = {
      find: jest
        .fn()
        .mockReturnValue(
          lean(overrides && 'grns' in overrides ? overrides.grns : []),
        ),
    };
    const invoices = {
      findOne: jest
        .fn()
        .mockReturnValue(
          lean(overrides && 'invoice' in overrides ? overrides.invoice : null),
        ),
    };
    const created = new InvoiceValidationService(
      invoices as never,
      orders as never,
      {} as never,
      vendors as never,
      grns as never,
      {} as never,
      { findById: jest.fn().mockResolvedValue({ _id: 'project' }) } as never,
      { findById: jest.fn().mockResolvedValue({ _id: 'site' }) } as never,
      { validate: jest.fn().mockResolvedValue({}) } as never,
    );
    return { created, orders, vendors, grns, invoices };
  }

  it('loads a purchase order with the tenant id', async () => {
    const { created, orders } = service();
    const order = await asTenant(() =>
      created.requirePurchaseOrder(poId.toString()),
    );
    expect(order).toMatchObject({ _id: poId });
    expect(orders.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.any(Types.ObjectId) }),
    );
    const filter = orders.findOne.mock.calls[0][0] as {
      tenantId: Types.ObjectId;
    };
    expect(filter.tenantId).toEqual(tenantId);
  });

  it('rejects a missing purchase order', async () => {
    const { created } = service({ order: null });
    await expect(
      asTenant(() => created.requirePurchaseOrder(poId.toString())),
    ).rejects.toMatchObject({
      errorCode: ErrorCodes.PO_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('rejects a cancelled purchase order', async () => {
    const { created } = service({
      order: {
        _id: poId,
        vendorId,
        status: PurchaseOrderStatus.CANCELLED,
      },
    });
    await expect(
      asTenant(() => created.requirePurchaseOrder(poId.toString())),
    ).rejects.toMatchObject({
      errorCode: ErrorCodes.INVALID_PO,
    });
  });

  it('rejects a vendor that does not match the purchase order', async () => {
    const { created } = service();
    await expect(
      asTenant(() =>
        created.requireVendor(new Types.ObjectId().toString(), {
          _id: poId,
          vendorId,
        } as never),
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.VENDOR_PO_MISMATCH });
  });

  it('rejects a missing vendor in the tenant', async () => {
    const { created } = service({ vendor: null });
    await expect(
      asTenant(() =>
        created.requireVendor(vendorId.toString(), {
          _id: poId,
          vendorId,
        } as never),
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.VENDOR_NOT_FOUND });
  });

  it('rejects a GRN from another purchase order', async () => {
    const grnId = new Types.ObjectId();
    const { created } = service({
      grns: [
        {
          _id: grnId,
          purchaseOrderId: otherPo,
          projectId: new Types.ObjectId(),
          siteId: new Types.ObjectId(),
          status: GrnStatus.APPROVED,
        },
      ],
    });
    await expect(
      asTenant(() =>
        created.requireGrns([grnId.toString()], {
          _id: poId,
          projectId: new Types.ObjectId(),
          siteId: new Types.ObjectId(),
        } as never),
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.GRN_PO_MISMATCH });
  });

  it('rejects a missing GRN as not found for the tenant', async () => {
    const { created } = service({ grns: [] });
    await expect(
      asTenant(() =>
        created.requireGrns([new Types.ObjectId().toString()], {
          _id: poId,
          projectId: new Types.ObjectId(),
          siteId: new Types.ObjectId(),
        } as never),
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.GRN_NOT_FOUND });
  });

  it('rejects a duplicate vendor invoice number', async () => {
    const { created } = service({ invoice: { _id: new Types.ObjectId() } });
    await expect(
      asTenant(() =>
        created.assertVendorInvoiceAvailable(vendorId.toString(), 'INV-9'),
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.DUPLICATE_INVOICE_NUMBER });
  });

  it('returns not found when the invoice is outside the tenant', async () => {
    const { created, invoices } = service({ invoice: null });
    await expect(
      asTenant(() => created.requireInvoice(new Types.ObjectId().toString())),
    ).rejects.toBeInstanceOf(AppException);
    const filter = invoices.findOne.mock.calls[0][0] as {
      tenantId: Types.ObjectId;
      _id: Types.ObjectId;
    };
    expect(filter.tenantId).toEqual(tenantId);
    expect(filter._id).toBeInstanceOf(Types.ObjectId);
  });

  it('rejects an attachment whose extension does not match the MIME type', () => {
    expect(() =>
      assertInvoiceAttachments(
        [
          {
            fileName: 'invoice.exe',
            mimeType: 'application/pdf',
            size: 100,
            storageKey: 'tenant/invoice.pdf',
          },
        ],
        true,
      ),
    ).toThrow(AppException);
  });
});
