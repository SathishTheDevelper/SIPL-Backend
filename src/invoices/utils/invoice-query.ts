import { FilterQuery } from 'mongoose';
import { InvoiceListQueryDto } from '../dto/invoice-list-query.dto';
import { Invoice } from '../schemas/invoice.schema';
import { escapeRegex, objectId, tenantObjectId } from './invoice-context';

export function invoicePage(query: InvoiceListQueryDto): {
  page: number;
  limit: number;
} {
  return {
    page: query.page ?? 1,
    limit: query.pageSize ?? query.limit ?? 20,
  };
}

export function buildInvoiceFilter(
  query: InvoiceListQueryDto,
): FilterQuery<Invoice> {
  const filter: FilterQuery<Invoice> = { tenantId: tenantObjectId() };
  if (query.status) filter.status = query.status;
  if (query.matchStatus) filter.matchStatus = query.matchStatus;
  if (query.vendorId) filter.vendorId = objectId(query.vendorId);
  if (query.projectId) filter.projectId = objectId(query.projectId);
  if (query.siteId) filter.siteId = objectId(query.siteId);
  if (query.invoiceNumber) {
    filter.invoiceNumber = {
      $regex: `^${escapeRegex(query.invoiceNumber)}`,
      $options: 'i',
    };
  }
  if (query.poNumber) {
    filter.poNumber = {
      $regex: `^${escapeRegex(query.poNumber)}`,
      $options: 'i',
    };
  }
  if (query.dateFrom || query.dateTo) {
    filter.invoiceDate = {};
    if (query.dateFrom) filter.invoiceDate.$gte = new Date(query.dateFrom);
    if (query.dateTo) filter.invoiceDate.$lte = new Date(query.dateTo);
  }
  if (query.submittedFrom || query.submittedTo) {
    filter.submittedAt = {};
    if (query.submittedFrom) {
      filter.submittedAt.$gte = new Date(query.submittedFrom);
    }
    if (query.submittedTo) {
      filter.submittedAt.$lte = new Date(query.submittedTo);
    }
  }
  if (query.minAmount !== undefined || query.maxAmount !== undefined) {
    filter.totalAmount = {};
    if (query.minAmount !== undefined)
      filter.totalAmount.$gte = query.minAmount;
    if (query.maxAmount !== undefined)
      filter.totalAmount.$lte = query.maxAmount;
  }
  const search = query.search?.trim() || query.q?.trim();
  if (search) {
    const prefix = { $regex: `^${escapeRegex(search)}`, $options: 'i' };
    filter.$or = [
      { invoiceNumber: prefix },
      { vendorInvoiceNumber: prefix },
      { poNumber: prefix },
      { vendorName: prefix },
    ];
  }
  return filter;
}
