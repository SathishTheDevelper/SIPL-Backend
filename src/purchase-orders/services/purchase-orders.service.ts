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
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { runInTransaction } from '../../common/utils/mongo-transaction';
import { assertEquals } from '../../common/utils/status-transition';
import { CustomFieldValidationService } from '../../custom-fields/services/custom-field-validation.service';
import { MaterialsService } from '../../materials/services/materials.service';
import { NotificationEventType } from '../../notifications/enums/notification.enums';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NumberingService } from '../../numbering/services/numbering.service';
import { ProjectsService } from '../../projects/services/projects.service';
import { SitesService } from '../../sites/services/sites.service';
import { TenantsService } from '../../tenants/services/tenants.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersRepository } from '../../users/repositories/users.repository';
import { WorkflowInstanceStatus } from '../../workflow/enums/workflow.enums';
import {
  WorkflowOutcome,
  WorkflowOutcomeRegistry,
} from '../../workflow/services/workflow-outcome.registry';
import { WorkflowService } from '../../workflow/services/workflow.service';
import {
  AcknowledgePurchaseOrderDto,
  CancelPurchaseOrderDto,
  CreatePoLineDto,
  CreatePurchaseOrderChargeDto,
  CreatePurchaseOrderDto,
  ListPurchaseOrdersDto,
  UpdatePoLineDto,
  UpdatePurchaseOrderChargeDto,
  UpdatePurchaseOrderDto,
} from '../dto/purchase-order.dto';
import {
  PurchaseOrderApprovalStatus,
  PurchaseOrderStatus,
} from '../enums/purchase-order.enums';
import { PurchaseOrderApprovalReference } from '../schemas/purchase-order-approval-reference.schema';
import { PurchaseOrderCharge } from '../schemas/purchase-order-charge.schema';
import { PurchaseOrderItem } from '../schemas/purchase-order-item.schema';
import { PurchaseOrder } from '../schemas/purchase-order.schema';
import {
  ComparisonStatementSource,
  ProcurementRequestSource,
  PurchaseApprovalSource,
  VendorSelectionItemSource,
  VendorSelectionSource,
  VendorSource,
} from '../schemas/upstream.schema';
import {
  calculatePurchaseOrderTotals,
  computeCharge,
  computeLine,
  fromMilli,
  pendingMilli,
  toMinor,
} from '../utils/po-math';

const SELECTED = ['APPROVED', 'SELECTED'];

@Injectable()
export class PurchaseOrdersService implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(PurchaseOrder.name)
    private readonly orders: Model<PurchaseOrder>,
    @InjectModel(PurchaseOrderItem.name)
    private readonly items: Model<PurchaseOrderItem>,
    @InjectModel(PurchaseOrderCharge.name)
    private readonly charges: Model<PurchaseOrderCharge>,
    @InjectModel(PurchaseOrderApprovalReference.name)
    private readonly approvalRefs: Model<PurchaseOrderApprovalReference>,
    @InjectModel(PurchaseApprovalSource.name)
    private readonly approvals: Model<PurchaseApprovalSource>,
    @InjectModel(VendorSelectionSource.name)
    private readonly selections: Model<VendorSelectionSource>,
    @InjectModel(VendorSelectionItemSource.name)
    private readonly selectionItems: Model<VendorSelectionItemSource>,
    @InjectModel(ProcurementRequestSource.name)
    private readonly procurements: Model<ProcurementRequestSource>,
    @InjectModel(ComparisonStatementSource.name)
    private readonly comparisons: Model<ComparisonStatementSource>,
    @InjectModel(VendorSource.name)
    private readonly vendors: Model<VendorSource>,
    private readonly projectsService: ProjectsService,
    private readonly sitesService: SitesService,
    private readonly materialsService: MaterialsService,
    private readonly tenantsService: TenantsService,
    private readonly numberingService: NumberingService,
    private readonly customFields: CustomFieldValidationService,
    private readonly workflowService: WorkflowService,
    private readonly outcomeRegistry: WorkflowOutcomeRegistry,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
    private readonly usersRepository: UsersRepository,
  ) {}

  onModuleInit(): void {
    this.outcomeRegistry.register((outcome) => this.onWorkflowOutcome(outcome));
  }

  async create(dto: CreatePurchaseOrderDto, user: AuthenticatedUser) {
    const tenantId = this.tenantId();
    const existing = await this.orders
      .findOne({
        tenantId,
        purchaseApprovalId: this.oid(dto.purchaseApprovalId),
      })
      .lean<PurchaseOrder>()
      .exec();
    if (existing) return existing;

    const approval = await this.requireApproval(dto.purchaseApprovalId);
    if (approval.status !== 'APPROVED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'A purchase order can only be created from an approved purchase approval',
        ErrorCodes.PURCHASE_APPROVAL_REQUIRED,
      );
    }
    this.assertMatches(
      dto.procurementRequestId,
      approval.procurementRequestId,
      'procurement request',
    );
    this.assertMatches(
      dto.comparisonStatementId,
      approval.comparisonStatementId,
      'comparison statement',
    );
    this.assertMatches(
      dto.vendorSelectionId,
      approval.vendorSelectionId,
      'vendor selection',
    );

    const [selection, comparison, procurement, vendor, project, site, tenant] =
      await Promise.all([
        this.requireSelection(approval.vendorSelectionId.toString()),
        this.requireComparison(approval.comparisonStatementId.toString()),
        this.requireProcurement(approval.procurementRequestId.toString()),
        this.requireVendor(approval.vendorId.toString()),
        this.projectsService.findById(approval.projectId.toString()),
        this.sitesService.findById(approval.siteId.toString()),
        this.tenantsService.findByIdOrThrow(tenantId.toString()),
      ]);
    if (!SELECTED.includes(selection.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Vendor selection is not approved',
        ErrorCodes.INVALID_STATUS,
      );
    }
    this.sameId(selection.vendorId, approval.vendorId, 'Vendor selection');
    this.sameId(selection.projectId, approval.projectId, 'Vendor selection');
    this.sameId(selection.siteId, approval.siteId, 'Vendor selection');
    this.sameId(
      selection.procurementRequestId,
      approval.procurementRequestId,
      'Vendor selection',
    );
    this.sameId(
      selection.comparisonStatementId,
      approval.comparisonStatementId,
      'Vendor selection',
    );
    this.sameId(
      comparison.procurementRequestId,
      approval.procurementRequestId,
      'Comparison statement',
    );
    this.sameId(
      procurement.projectId,
      approval.projectId,
      'Procurement request',
    );
    this.sameId(procurement.siteId, approval.siteId, 'Procurement request');
    if (['CANCELLED', 'REJECTED'].includes(procurement.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Procurement request cannot be converted to a purchase order',
        ErrorCodes.INVALID_STATUS,
      );
    }
    if (site.projectId.toString() !== project._id.toString()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Site does not belong to the approved project',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    if (vendor.status && vendor.status !== 'ACTIVE') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Vendor is not active',
        ErrorCodes.INVALID_STATUS,
      );
    }

    const customFields = await this.customFields.validate(
      BusinessModule.PURCHASE_ORDER,
      dto.customFields,
    );
    const sourceItems = await this.selectionItemsFor(approval, dto);

    try {
      const created = await runInTransaction(
        this.connection,
        async (session) => {
          const again = await this.orders
            .findOne({ tenantId, purchaseApprovalId: approval._id })
            .session(session ?? null)
            .lean<PurchaseOrder>()
            .exec();
          if (again) return again;

          const allocated = await this.numberingService.next(
            DocumentType.PO,
            session,
          );
          const [order] = await this.orders.create(
            [
              {
                tenantId,
                poNumber: allocated.number,
                purchaseApprovalId: approval._id,
                procurementRequestId: approval.procurementRequestId,
                comparisonStatementId: approval.comparisonStatementId,
                vendorSelectionId: approval.vendorSelectionId,
                projectId: approval.projectId,
                siteId: approval.siteId,
                vendorId: approval.vendorId,
                poDate: new Date(),
                expectedDeliveryDate: dto.expectedDeliveryDate
                  ? new Date(dto.expectedDeliveryDate)
                  : undefined,
                currency: tenant.settings.currency,
                paymentTerms:
                  dto.paymentTerms ??
                  `${tenant.settings.defaultPaymentTermsDays} days`,
                deliveryTerms: dto.deliveryTerms,
                remarks: dto.remarks,
                customFields,
                createdBy: this.oid(user.userId),
                status: PurchaseOrderStatus.DRAFT,
                approvalStatus: PurchaseOrderApprovalStatus.NOT_STARTED,
              },
            ],
            session ? { session } : undefined,
          );

          const itemPayloads = [];
          for (const source of sourceItems) {
            await this.materialsService.requireMaterial(
              source.materialId.toString(),
            );
            await this.materialsService.requireUnit(source.unitId.toString());
            const line = computeLine({
              quantity: source.quantity,
              unitRate: source.unitRate,
              discount: source.discount ?? 0,
              taxRate: source.taxRate ?? 0,
            });
            itemPayloads.push({
              tenantId,
              purchaseOrderId: order._id,
              materialId: source.materialId,
              boqItemId: source.boqItemId,
              rfqItemId: source.rfqItemId,
              vendorQuotationItemId: source.vendorQuotationItemId,
              vendorSelectionItemId: source._id,
              description: source.description,
              quantity: line.quantity,
              receivedQuantity: 0,
              pendingQuantity: line.quantity,
              unitId: source.unitId,
              unitRate: line.unitRate,
              discount: line.discount,
              taxRate: line.taxRate,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
              expectedDeliveryDate: source.expectedDeliveryDate,
              remarks: source.remarks,
              customFields: {},
            });
          }
          if (itemPayloads.length > 0) {
            await this.items.insertMany(
              itemPayloads,
              session ? { session } : undefined,
            );
          }
          if (dto.charges?.length) {
            await this.charges.insertMany(
              dto.charges.map((charge) => {
                const computed = computeCharge(charge);
                return {
                  tenantId,
                  purchaseOrderId: order._id,
                  projectId: approval.projectId,
                  vendorId: approval.vendorId,
                  chargeType: charge.chargeType,
                  description: charge.description,
                  amount: computed.amount,
                  taxRate: computed.taxRate,
                  taxAmount: computed.taxAmount,
                  totalAmount: computed.totalAmount,
                  createdBy: this.oid(user.userId),
                };
              }),
              session ? { session } : undefined,
            );
          }
          await this.refreshTotals(order._id, dto.discount ?? 0, session);
          await this.procurements
            .updateOne(
              { _id: approval.procurementRequestId, tenantId },
              { $set: { status: 'PO_CREATED' } },
              session ? { session } : undefined,
            )
            .exec();
          const saved = await this.orders
            .findOne({ _id: order._id, tenantId })
            .session(session ?? null)
            .lean<PurchaseOrder>()
            .exec();
          return saved!;
        },
      );

      await this.auditService.record({
        action: AuditAction.CREATE,
        module: BusinessModule.PURCHASE_ORDER,
        entityType: 'PurchaseOrder',
        entityId: created._id.toString(),
        after: {
          poNumber: created.poNumber,
          purchaseApprovalId: dto.purchaseApprovalId,
          grandTotal: created.grandTotal,
          additionalChargesTotal: created.additionalChargesTotal,
        },
      });
      return created;
    } catch (error) {
      if (this.isDuplicate(error)) {
        const recovered = await this.orders
          .findOne({
            tenantId,
            purchaseApprovalId: this.oid(dto.purchaseApprovalId),
          })
          .lean<PurchaseOrder>()
          .exec();
        if (recovered) return recovered;
      }
      throw error;
    }
  }

  async list(query: ListPurchaseOrdersDto) {
    const filter: Record<string, unknown> = { tenantId: this.tenantId() };
    if (query.status) filter.status = query.status;
    if (query.vendorId) filter.vendorId = this.oid(query.vendorId);
    if (query.projectId) filter.projectId = this.oid(query.projectId);
    if (query.siteId) filter.siteId = this.oid(query.siteId);
    const search = query.search ?? query.q;
    if (search) {
      filter.poNumber = { $regex: this.escape(search), $options: 'i' };
    }
    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom) range.$gte = new Date(query.dateFrom);
      if (query.dateTo) range.$lte = new Date(query.dateTo);
      filter.poDate = range;
    }
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const page = skipTake(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.orders
        .find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(page.skip)
        .limit(page.limit)
        .lean()
        .exec(),
      this.orders.countDocuments(filter).exec(),
    ]);
    return paginated(data, total, query.page, query.limit);
  }

  async summary() {
    const [facet] = await this.orders
      .aggregate<{
        byStatus: { _id: string; count: number }[];
        pending: { count: number }[];
      }>([
        { $match: { tenantId: this.tenantId() } },
        {
          $facet: {
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            pending: [
              {
                $match: {
                  status: PurchaseOrderStatus.PENDING_APPROVAL,
                  approvalStatus: PurchaseOrderApprovalStatus.PENDING,
                },
              },
              { $count: 'count' },
            ],
          },
        },
      ])
      .exec();
    const count = (status: string) =>
      facet?.byStatus.find((row) => row._id === status)?.count ?? 0;
    return {
      draftPOs: count(PurchaseOrderStatus.DRAFT),
      pendingApproval: facet?.pending[0]?.count ?? 0,
      approvedPOs: count(PurchaseOrderStatus.APPROVED),
      sentToVendor: count(PurchaseOrderStatus.SENT_TO_VENDOR),
      acknowledged: count(PurchaseOrderStatus.ACKNOWLEDGED),
      partiallyDelivered: count(PurchaseOrderStatus.PARTIALLY_DELIVERED),
      fullyDelivered: count(PurchaseOrderStatus.FULLY_DELIVERED),
      cancelled: count(PurchaseOrderStatus.CANCELLED),
    };
  }

  get(id: string) {
    return this.requireOrder(id);
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    user: AuthenticatedUser,
  ) {
    const current = await this.requireOrder(id);
    if (dto.discount !== undefined) this.assertFinancialEdit(current);
    if (
      current.status === PurchaseOrderStatus.CANCELLED ||
      current.status === PurchaseOrderStatus.CLOSED
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Purchase order cannot be edited',
        ErrorCodes.INVALID_STATUS,
      );
    }
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.PURCHASE_ORDER,
          dto.customFields,
        )
      : current.customFields;
    const updated = await this.orders
      .findOneAndUpdate(
        { _id: this.oid(id), tenantId: this.tenantId() },
        {
          $set: {
            expectedDeliveryDate: dto.expectedDeliveryDate
              ? new Date(dto.expectedDeliveryDate)
              : current.expectedDeliveryDate,
            paymentTerms: dto.paymentTerms ?? current.paymentTerms,
            deliveryTerms: dto.deliveryTerms ?? current.deliveryTerms,
            remarks: dto.remarks ?? current.remarks,
            customFields,
            updatedBy: this.oid(user.userId),
          },
        },
        { new: true },
      )
      .lean<PurchaseOrder>()
      .exec();
    if (dto.discount !== undefined) {
      await this.refreshTotals(current._id, dto.discount);
      return this.requireOrder(id);
    }
    await this.auditService.record({
      action: AuditAction.UPDATE,
      module: BusinessModule.PURCHASE_ORDER,
      entityType: 'PurchaseOrder',
      entityId: id,
      after: { remarks: dto.remarks, discount: dto.discount },
    });
    return updated;
  }

  async submit(id: string, user: AuthenticatedUser) {
    const existing = await this.requireOrder(id);
    if (
      existing.status === PurchaseOrderStatus.PENDING_APPROVAL &&
      existing.approvalStatus === PurchaseOrderApprovalStatus.PENDING &&
      existing.workflowInstanceId
    ) {
      return existing;
    }
    if (existing.approvalStatus === PurchaseOrderApprovalStatus.REJECTED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'A rejected purchase order cannot be resubmitted',
        ErrorCodes.INVALID_STATUS,
      );
    }
    const lines = await this.items.countDocuments({
      tenantId: this.tenantId(),
      purchaseOrderId: existing._id,
    });
    if (lines === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Purchase order has no items',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const locked = await this.orders
      .findOneAndUpdate(
        {
          _id: existing._id,
          tenantId: this.tenantId(),
          status: PurchaseOrderStatus.DRAFT,
        },
        {
          $set: {
            status: PurchaseOrderStatus.PENDING_APPROVAL,
            approvalStatus: PurchaseOrderApprovalStatus.PENDING,
            updatedBy: this.oid(user.userId),
          },
        },
        { new: true },
      )
      .lean<PurchaseOrder>()
      .exec();
    if (!locked) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Purchase order was already submitted',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    try {
      const project = await this.projectsService.findById(
        locked.projectId.toString(),
      );
      const instance = await this.workflowService.start(
        {
          module: WorkflowModule.PO_APPROVAL,
          entityType: 'PurchaseOrder',
          entityId: locked._id.toString(),
          context: {
            projectId: locked.projectId.toString(),
            projectHeadUserId: project.projectHead?.toString(),
            amount: locked.grandTotal,
            currency: locked.currency,
            vendorId: locked.vendorId.toString(),
          },
        },
        user,
      );
      const updated = await this.orders
        .findOneAndUpdate(
          { _id: locked._id, tenantId: this.tenantId() },
          { $set: { workflowInstanceId: instance._id } },
          { new: true },
        )
        .lean<PurchaseOrder>()
        .exec();
      await this.auditService.record({
        action: AuditAction.SUBMIT,
        module: BusinessModule.PURCHASE_ORDER,
        entityType: 'PurchaseOrder',
        entityId: id,
        after: {
          status: PurchaseOrderStatus.PENDING_APPROVAL,
          grandTotal: locked.grandTotal,
        },
      });
      await this.notifyRoles(
        [SystemRole.PROJECT_HEAD, SystemRole.PROCUREMENT],
        NotificationEventType.PO_APPROVAL_PENDING,
        'Purchase order approval pending',
        `${locked.poNumber} is waiting for approval`,
        id,
      );
      return updated;
    } catch (error) {
      await this.orders
        .updateOne(
          {
            _id: locked._id,
            tenantId: this.tenantId(),
            status: PurchaseOrderStatus.PENDING_APPROVAL,
            approvalStatus: PurchaseOrderApprovalStatus.PENDING,
          },
          {
            $set: {
              status: PurchaseOrderStatus.DRAFT,
              approvalStatus: PurchaseOrderApprovalStatus.NOT_STARTED,
            },
          },
        )
        .exec();
      throw error;
    }
  }

  async cancel(
    id: string,
    dto: CancelPurchaseOrderDto,
    user: AuthenticatedUser,
  ) {
    if (!dto.reason?.trim()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Reason is required to cancel a purchase order',
        ErrorCodes.REASON_REQUIRED,
      );
    }
    const current = await this.requireOrder(id);
    if (
      current.status === PurchaseOrderStatus.FULLY_DELIVERED ||
      current.status === PurchaseOrderStatus.CLOSED
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'A fully delivered or closed purchase order cannot be cancelled',
        ErrorCodes.INVALID_STATUS,
      );
    }
    if (current.status === PurchaseOrderStatus.PARTIALLY_DELIVERED) {
      const tenant = await this.tenantsService.findByIdOrThrow(
        this.tenantId().toString(),
      );
      if (!tenant.settings.allowPartialPoCancel) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'Partial delivery cancellation is not enabled for this tenant',
          ErrorCodes.INVALID_STATUS,
        );
      }
    }
    if (current.status === PurchaseOrderStatus.CANCELLED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Purchase order is already cancelled',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    const updated = await this.orders
      .findOneAndUpdate(
        { _id: current._id, tenantId: this.tenantId(), status: current.status },
        {
          $set: {
            status: PurchaseOrderStatus.CANCELLED,
            cancellationReason: dto.reason.trim(),
            updatedBy: this.oid(user.userId),
          },
        },
        { new: true },
      )
      .lean<PurchaseOrder>()
      .exec();
    await this.auditService.record({
      action: AuditAction.CANCEL,
      module: BusinessModule.PURCHASE_ORDER,
      entityType: 'PurchaseOrder',
      entityId: id,
      after: {
        status: PurchaseOrderStatus.CANCELLED,
        reason: dto.reason.trim(),
      },
    });
    await this.notifyRoles(
      [SystemRole.PROJECT_HEAD, SystemRole.PROCUREMENT, SystemRole.PURCHASE],
      NotificationEventType.PO_REJECTED,
      'Purchase order cancelled',
      `${current.poNumber} was cancelled. ${dto.reason.trim()}`,
      id,
    );
    return updated;
  }

  async sendToVendor(id: string, user: AuthenticatedUser) {
    const current = await this.requireOrder(id);
    assertEquals(
      current.status,
      PurchaseOrderStatus.APPROVED,
      'Only an approved purchase order can be sent to the vendor',
    );
    if (current.approvalStatus !== PurchaseOrderApprovalStatus.APPROVED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Purchase order approval is not complete',
        ErrorCodes.INVALID_STATUS,
      );
    }
    const updated = await this.orders
      .findOneAndUpdate(
        {
          _id: current._id,
          tenantId: this.tenantId(),
          status: PurchaseOrderStatus.APPROVED,
        },
        {
          $set: {
            status: PurchaseOrderStatus.SENT_TO_VENDOR,
            updatedBy: this.oid(user.userId),
          },
        },
        { new: true },
      )
      .lean<PurchaseOrder>()
      .exec();
    await this.auditService.record({
      action: AuditAction.STATUS_CHANGE,
      module: BusinessModule.PURCHASE_ORDER,
      entityType: 'PurchaseOrder',
      entityId: id,
      after: { status: PurchaseOrderStatus.SENT_TO_VENDOR },
    });
    await this.notifyRoles(
      [SystemRole.PROCUREMENT, SystemRole.PURCHASE, SystemRole.PROJECT_HEAD],
      NotificationEventType.PO_SENT_TO_VENDOR,
      'Purchase order sent to vendor',
      `${current.poNumber} was sent to the vendor`,
      id,
    );
    return updated;
  }

  async acknowledge(
    id: string,
    dto: AcknowledgePurchaseOrderDto,
    user: AuthenticatedUser,
  ) {
    const current = await this.requireOrder(id);
    assertEquals(
      current.status,
      PurchaseOrderStatus.SENT_TO_VENDOR,
      'Only a purchase order sent to the vendor can be acknowledged',
    );
    const updated = await this.orders
      .findOneAndUpdate(
        {
          _id: current._id,
          tenantId: this.tenantId(),
          status: PurchaseOrderStatus.SENT_TO_VENDOR,
        },
        {
          $set: {
            status: PurchaseOrderStatus.ACKNOWLEDGED,
            acknowledgedAt: new Date(dto.acknowledgedAt),
            acknowledgementRemarks: dto.remarks,
            expectedDeliveryDate: dto.expectedDeliveryDate
              ? new Date(dto.expectedDeliveryDate)
              : current.expectedDeliveryDate,
            updatedBy: this.oid(user.userId),
          },
        },
        { new: true },
      )
      .lean<PurchaseOrder>()
      .exec();
    await this.auditService.record({
      action: AuditAction.ACKNOWLEDGE,
      module: BusinessModule.PURCHASE_ORDER,
      entityType: 'PurchaseOrder',
      entityId: id,
      after: {
        status: PurchaseOrderStatus.ACKNOWLEDGED,
        acknowledgedAt: dto.acknowledgedAt,
      },
    });
    await this.notifyRoles(
      [
        SystemRole.PROJECT_HEAD,
        SystemRole.PROCUREMENT,
        SystemRole.SITE_ENGINEER,
      ],
      NotificationEventType.PO_ACKNOWLEDGED,
      'Purchase order acknowledged',
      `${current.poNumber} was acknowledged`,
      id,
    );
    return updated;
  }

  async listItems(id: string) {
    const order = await this.requireOrder(id);
    return this.items
      .find({ tenantId: this.tenantId(), purchaseOrderId: order._id })
      .lean()
      .exec();
  }

  async addItem(id: string, dto: CreatePoLineDto, user: AuthenticatedUser) {
    const order = await this.requireOrder(id);
    this.assertFinancialEdit(order);
    await this.materialsService.requireMaterial(dto.materialId);
    await this.materialsService.requireUnit(dto.unitId);
    const customFields = await this.customFields.validate(
      BusinessModule.PURCHASE_ORDER_ITEM,
      dto.customFields,
    );
    const line = computeLine(dto);
    const header = await this.currentHeader(order);
    const created = await this.items.create({
      tenantId: this.tenantId(),
      purchaseOrderId: order._id,
      materialId: this.oid(dto.materialId),
      unitId: this.oid(dto.unitId),
      boqItemId: dto.boqItemId ? this.oid(dto.boqItemId) : undefined,
      description: dto.description,
      quantity: line.quantity,
      receivedQuantity: 0,
      pendingQuantity: line.quantity,
      unitRate: line.unitRate,
      discount: line.discount,
      taxRate: line.taxRate,
      taxAmount: line.taxAmount,
      lineTotal: line.lineTotal,
      expectedDeliveryDate: dto.expectedDeliveryDate
        ? new Date(dto.expectedDeliveryDate)
        : undefined,
      remarks: dto.remarks,
      customFields,
    });
    await this.refreshTotals(order._id, header);
    await this.orders.updateOne(
      { _id: order._id, tenantId: this.tenantId() },
      { $set: { updatedBy: this.oid(user.userId) } },
    );
    return created.toObject();
  }

  async updateItem(id: string, dto: UpdatePoLineDto, user: AuthenticatedUser) {
    const item = await this.requireItem(id);
    const order = await this.requireOrder(item.purchaseOrderId.toString());
    this.assertFinancialEdit(order);
    const header = await this.currentHeader(order);
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.PURCHASE_ORDER_ITEM,
          dto.customFields,
        )
      : item.customFields;
    const line = computeLine({
      quantity: dto.quantity ?? item.quantity,
      unitRate: dto.unitRate ?? item.unitRate,
      discount: dto.discount ?? item.discount,
      taxRate: dto.taxRate ?? item.taxRate,
    });
    const pending = fromMilli(
      pendingMilli(line.quantity, item.receivedQuantity),
    );
    if (pending < 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Ordered quantity cannot be less than the received quantity',
        ErrorCodes.PO_QUANTITY_EXCEEDED,
      );
    }
    const updated = await this.items
      .findOneAndUpdate(
        { _id: item._id, tenantId: this.tenantId() },
        {
          $set: {
            quantity: line.quantity,
            pendingQuantity: pending,
            unitRate: line.unitRate,
            discount: line.discount,
            taxRate: line.taxRate,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            description: dto.description ?? item.description,
            expectedDeliveryDate: dto.expectedDeliveryDate
              ? new Date(dto.expectedDeliveryDate)
              : item.expectedDeliveryDate,
            remarks: dto.remarks ?? item.remarks,
            customFields,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    await this.refreshTotals(order._id, header);
    await this.auditService.record({
      action: AuditAction.UPDATE,
      module: BusinessModule.PURCHASE_ORDER_ITEM,
      entityType: 'PurchaseOrderItem',
      entityId: id,
      after: { lineTotal: line.lineTotal, quantity: line.quantity },
    });
    await this.orders.updateOne(
      { _id: order._id },
      { $set: { updatedBy: this.oid(user.userId) } },
    );
    return updated;
  }

  async deleteItem(id: string) {
    const item = await this.requireItem(id);
    const order = await this.requireOrder(item.purchaseOrderId.toString());
    this.assertFinancialEdit(order);
    const header = await this.currentHeader(order);
    await this.items
      .deleteOne({ _id: item._id, tenantId: this.tenantId() })
      .exec();
    await this.refreshTotals(order._id, header);
    await this.auditService.record({
      action: AuditAction.DELETE,
      module: BusinessModule.PURCHASE_ORDER_ITEM,
      entityType: 'PurchaseOrderItem',
      entityId: id,
    });
    return { deleted: true };
  }

  async listCharges(id: string) {
    const order = await this.requireOrder(id);
    return this.charges
      .find({ tenantId: this.tenantId(), purchaseOrderId: order._id })
      .lean()
      .exec();
  }

  async addCharge(
    id: string,
    dto: CreatePurchaseOrderChargeDto,
    user: AuthenticatedUser,
  ) {
    const order = await this.requireOrder(id);
    this.assertFinancialEdit(order);
    const computed = computeCharge(dto);
    const header = await this.currentHeader(order);
    const created = await this.charges.create({
      tenantId: this.tenantId(),
      purchaseOrderId: order._id,
      projectId: order.projectId,
      vendorId: order.vendorId,
      chargeType: dto.chargeType,
      description: dto.description,
      amount: computed.amount,
      taxRate: computed.taxRate,
      taxAmount: computed.taxAmount,
      totalAmount: computed.totalAmount,
      createdBy: this.oid(user.userId),
    });
    await this.refreshTotals(order._id, header);
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.PURCHASE_ORDER_CHARGE,
      entityType: 'PurchaseOrderCharge',
      entityId: created._id.toString(),
      after: {
        purchaseOrderId: order._id.toString(),
        projectId: order.projectId.toString(),
        vendorId: order.vendorId.toString(),
        amount: computed.amount,
        chargeType: dto.chargeType,
      },
    });
    return created.toObject();
  }

  async updateCharge(
    id: string,
    dto: UpdatePurchaseOrderChargeDto,
    user: AuthenticatedUser,
  ) {
    const charge = await this.requireCharge(id);
    const order = await this.requireOrder(charge.purchaseOrderId.toString());
    this.assertFinancialEdit(order);
    const computed = computeCharge({
      amount: dto.amount ?? charge.amount,
      taxRate: dto.taxRate ?? charge.taxRate,
    });
    const header = await this.currentHeader(order);
    const updated = await this.charges
      .findOneAndUpdate(
        { _id: charge._id, tenantId: this.tenantId() },
        {
          $set: {
            chargeType: dto.chargeType ?? charge.chargeType,
            description: dto.description ?? charge.description,
            amount: computed.amount,
            taxRate: computed.taxRate,
            taxAmount: computed.taxAmount,
            totalAmount: computed.totalAmount,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    await this.refreshTotals(order._id, header);
    await this.auditService.record({
      action: AuditAction.UPDATE,
      module: BusinessModule.PURCHASE_ORDER_CHARGE,
      entityType: 'PurchaseOrderCharge',
      entityId: id,
      before: { amount: charge.amount },
      after: { amount: computed.amount, updatedBy: user.userId },
    });
    return updated;
  }

  async deleteCharge(id: string) {
    const charge = await this.requireCharge(id);
    const order = await this.requireOrder(charge.purchaseOrderId.toString());
    this.assertFinancialEdit(order);
    const header = await this.currentHeader(order);
    await this.charges
      .deleteOne({ _id: charge._id, tenantId: this.tenantId() })
      .exec();
    await this.refreshTotals(order._id, header);
    await this.auditService.record({
      action: AuditAction.DELETE,
      module: BusinessModule.PURCHASE_ORDER_CHARGE,
      entityType: 'PurchaseOrderCharge',
      entityId: id,
      before: { amount: charge.amount },
    });
    return { deleted: true };
  }

  async requireOrder(id: string): Promise<PurchaseOrder> {
    const row = await this.orders
      .findOne({ _id: this.oid(id), tenantId: this.tenantId() })
      .lean<PurchaseOrder>()
      .exec();
    if (!row) this.missing('Purchase order not found');
    return row;
  }

  async requireOpenForReceipt(id: string): Promise<PurchaseOrder> {
    const order = await this.requireOrder(id);
    if (order.approvalStatus === PurchaseOrderApprovalStatus.REJECTED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'A rejected purchase order cannot receive material',
        ErrorCodes.INVALID_STATUS,
      );
    }
    assertEquals(
      order.status,
      [
        PurchaseOrderStatus.APPROVED,
        PurchaseOrderStatus.SENT_TO_VENDOR,
        PurchaseOrderStatus.ACKNOWLEDGED,
        PurchaseOrderStatus.PARTIALLY_DELIVERED,
      ],
      'Purchase order is not open for delivery or receipt',
    );
    return order;
  }

  private async onWorkflowOutcome(outcome: WorkflowOutcome): Promise<void> {
    if (outcome.entityType !== 'PurchaseOrder') return;
    const current = await this.orders
      .findOne({ _id: this.oid(outcome.entityId), tenantId: this.tenantId() })
      .lean<PurchaseOrder>()
      .exec();
    if (!current) return;
    if (current.approvalStatus === PurchaseOrderApprovalStatus.APPROVED) return;

    let status = current.status;
    let approvalStatus = current.approvalStatus;
    if (outcome.instanceStatus === WorkflowInstanceStatus.APPROVED) {
      status = PurchaseOrderStatus.APPROVED;
      approvalStatus = PurchaseOrderApprovalStatus.APPROVED;
    } else if (outcome.instanceStatus === WorkflowInstanceStatus.REJECTED) {
      status = PurchaseOrderStatus.PENDING_APPROVAL;
      approvalStatus = PurchaseOrderApprovalStatus.REJECTED;
    } else if (outcome.instanceStatus === WorkflowInstanceStatus.SENT_BACK) {
      status = PurchaseOrderStatus.DRAFT;
      approvalStatus = PurchaseOrderApprovalStatus.SEND_BACK;
    } else {
      return;
    }

    const update: Record<string, unknown> = {
      $set: { status, approvalStatus },
    };
    if (outcome.instanceStatus === WorkflowInstanceStatus.SENT_BACK) {
      update.$unset = { workflowInstanceId: 1 };
    }
    const updated = await this.orders
      .findOneAndUpdate(
        {
          _id: current._id,
          tenantId: this.tenantId(),
          approvalStatus: { $ne: PurchaseOrderApprovalStatus.APPROVED },
        },
        update,
        { new: true },
      )
      .lean<PurchaseOrder>()
      .exec();
    if (!updated) return;

    await this.approvalRefs.create({
      tenantId: this.tenantId(),
      purchaseOrderId: current._id,
      action: outcome.action,
      actorUserId: this.oid(outcome.actorUserId),
      reason: outcome.reason,
      instanceStatus: outcome.instanceStatus,
    });

    if (approvalStatus === PurchaseOrderApprovalStatus.APPROVED) {
      await this.auditService.record({
        action: AuditAction.APPROVE,
        module: BusinessModule.PURCHASE_ORDER,
        entityType: 'PurchaseOrder',
        entityId: current._id.toString(),
        after: { status, approvalStatus },
      });
      await this.notifyRoles(
        [SystemRole.PROCUREMENT, SystemRole.PURCHASE],
        NotificationEventType.PO_APPROVED,
        'Purchase order approved',
        `${current.poNumber} was approved`,
        current._id.toString(),
        current.createdBy.toString(),
      );
      return;
    }
    if (approvalStatus === PurchaseOrderApprovalStatus.REJECTED) {
      await this.auditService.record({
        action: AuditAction.REJECT,
        module: BusinessModule.PURCHASE_ORDER,
        entityType: 'PurchaseOrder',
        entityId: current._id.toString(),
        after: { status, approvalStatus, reason: outcome.reason },
      });
      await this.notifyRoles(
        [SystemRole.PROCUREMENT, SystemRole.PURCHASE],
        NotificationEventType.PO_REJECTED,
        'Purchase order rejected',
        outcome.reason ?? `${current.poNumber} was rejected`,
        current._id.toString(),
        current.createdBy.toString(),
      );
      return;
    }
    await this.auditService.record({
      action: AuditAction.SEND_BACK,
      module: BusinessModule.PURCHASE_ORDER,
      entityType: 'PurchaseOrder',
      entityId: current._id.toString(),
      after: { status, approvalStatus, reason: outcome.reason },
    });
    await this.notifyRoles(
      [SystemRole.PROCUREMENT, SystemRole.PURCHASE],
      NotificationEventType.SEND_BACK,
      'Purchase order sent back',
      outcome.reason ?? `${current.poNumber} was sent back`,
      current._id.toString(),
      current.createdBy.toString(),
    );
  }

  private async selectionItemsFor(
    approval: PurchaseApprovalSource,
    dto: CreatePurchaseOrderDto,
  ) {
    const rows = await this.selectionItems
      .find({
        tenantId: this.tenantId(),
        vendorSelectionId: approval.vendorSelectionId,
      })
      .lean<VendorSelectionItemSource[]>()
      .exec();
    if (rows.length === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Approved vendor selection has no items',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    if (!dto.items?.length) {
      return rows.map((row) => ({
        ...row,
        expectedDeliveryDate: undefined,
        remarks: undefined,
      }));
    }
    const byId = new Map(rows.map((row) => [row._id.toString(), row]));
    return dto.items.map((requested) => {
      const source = byId.get(requested.vendorSelectionItemId);
      if (!source) this.missing('Vendor selection item not found');
      return {
        ...source,
        expectedDeliveryDate: requested.expectedDeliveryDate
          ? new Date(requested.expectedDeliveryDate)
          : undefined,
        remarks: requested.remarks,
      };
    });
  }

  private async refreshTotals(
    purchaseOrderId: Types.ObjectId,
    headerDiscount: number,
    session?: ClientSession,
  ) {
    const tenantId = this.tenantId();
    const itemQuery = this.items.find({ tenantId, purchaseOrderId });
    const chargeQuery = this.charges.find({ tenantId, purchaseOrderId });
    if (session) {
      itemQuery.session(session);
      chargeQuery.session(session);
    }
    const [itemRows, chargeRows] = await Promise.all([
      itemQuery.lean<PurchaseOrderItem[]>().exec(),
      chargeQuery.lean<PurchaseOrderCharge[]>().exec(),
    ]);
    const totals = calculatePurchaseOrderTotals(
      itemRows.map((item) => ({
        quantity: item.quantity,
        unitRate: item.unitRate,
        discount: item.discount,
        taxRate: item.taxRate,
      })),
      chargeRows.map((charge) => ({
        amount: charge.amount,
        taxRate: charge.taxRate,
      })),
      headerDiscount,
    );
    await this.orders
      .updateOne(
        { _id: purchaseOrderId, tenantId },
        {
          $set: {
            subtotal: totals.subtotal,
            discount: totals.discount,
            taxAmount: totals.taxAmount,
            additionalChargesTotal: totals.additionalChargesTotal,
            grandTotal: totals.grandTotal,
          },
        },
        session ? { session } : undefined,
      )
      .exec();
    return totals;
  }

  private async currentHeader(order: PurchaseOrder): Promise<number> {
    const rows = await this.items
      .find({ tenantId: this.tenantId(), purchaseOrderId: order._id })
      .select({ discount: 1 })
      .lean<PurchaseOrderItem[]>()
      .exec();
    const line = rows.reduce(
      (sum, item) => sum + toMinor(item.discount || 0),
      0,
    );
    return Math.max(toMinor(order.discount) - line, 0) / 100;
  }

  private assertFinancialEdit(order: PurchaseOrder): void {
    if (order.status !== PurchaseOrderStatus.DRAFT) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Financial changes after approval require an amendment',
        ErrorCodes.PO_AMENDMENT_REQUIRED,
      );
    }
  }

  private async requireItem(id: string): Promise<PurchaseOrderItem> {
    const row = await this.items
      .findOne({ _id: this.oid(id), tenantId: this.tenantId() })
      .lean<PurchaseOrderItem>()
      .exec();
    if (!row) this.missing('Purchase order item not found');
    return row;
  }

  private async requireCharge(id: string): Promise<PurchaseOrderCharge> {
    const row = await this.charges
      .findOne({ _id: this.oid(id), tenantId: this.tenantId() })
      .lean<PurchaseOrderCharge>()
      .exec();
    if (!row) this.missing('Purchase order charge not found');
    return row;
  }

  private async requireApproval(id: string): Promise<PurchaseApprovalSource> {
    const row = await this.approvals
      .findOne({ _id: this.oid(id), tenantId: this.tenantId() })
      .lean<PurchaseApprovalSource>()
      .exec();
    if (!row) this.missing('Purchase approval not found');
    return row;
  }

  private async requireSelection(id: string): Promise<VendorSelectionSource> {
    const row = await this.selections
      .findOne({ _id: this.oid(id), tenantId: this.tenantId() })
      .lean<VendorSelectionSource>()
      .exec();
    if (!row) this.missing('Vendor selection not found');
    return row;
  }

  private async requireComparison(
    id: string,
  ): Promise<ComparisonStatementSource> {
    const row = await this.comparisons
      .findOne({ _id: this.oid(id), tenantId: this.tenantId() })
      .lean<ComparisonStatementSource>()
      .exec();
    if (!row) this.missing('Comparison statement not found');
    return row;
  }

  private async requireProcurement(
    id: string,
  ): Promise<ProcurementRequestSource> {
    const row = await this.procurements
      .findOne({ _id: this.oid(id), tenantId: this.tenantId() })
      .lean<ProcurementRequestSource>()
      .exec();
    if (!row) this.missing('Procurement request not found');
    return row;
  }

  private async requireVendor(id: string): Promise<VendorSource> {
    const row = await this.vendors
      .findOne({ _id: this.oid(id), tenantId: this.tenantId() })
      .lean<VendorSource>()
      .exec();
    if (!row) this.missing('Vendor not found');
    return row;
  }

  private assertMatches(
    provided: string | undefined,
    actual: Types.ObjectId,
    label: string,
  ) {
    if (provided && provided !== actual.toString()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        `${label} does not match the purchase approval`,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
  }

  private sameId(left: Types.ObjectId, right: Types.ObjectId, label: string) {
    if (left.toString() !== right.toString()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        `${label} does not belong to this purchase approval`,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
  }

  private async notifyRoles(
    roles: string[],
    eventType: NotificationEventType,
    title: string,
    body: string,
    entityId: string,
    extraUserId?: string,
  ) {
    const users = await this.usersRepository.findMany({
      role: { $in: roles },
      status: UserStatus.ACTIVE,
    });
    const userIds = [
      ...users.map((user) => user._id.toString()),
      extraUserId,
    ].filter((value): value is string => Boolean(value));
    if (userIds.length === 0) return;
    await this.notifications.notify({
      userIds,
      eventType,
      title,
      body,
      entityType: 'PurchaseOrder',
      entityId,
    });
  }

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }

  private escape(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
