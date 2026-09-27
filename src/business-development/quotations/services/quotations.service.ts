import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../../audit/enums/audit-action.enum';
import { AuditService } from '../../../audit/services/audit.service';
import {
  BusinessModule,
  DocumentType,
} from '../../../common/constants/modules';
import { ErrorCodes } from '../../../common/constants/error-codes';
import { TenantContext } from '../../../common/context/tenant.context';
import { AppException } from '../../../common/exceptions/app.exception';
import { assertTransition } from '../../../common/utils/status-transition';
import { CustomFieldValidationService } from '../../../custom-fields/services/custom-field-validation.service';
import { NotificationEventType } from '../../../notifications/enums/notification.enums';
import { NotificationsService } from '../../../notifications/services/notifications.service';
import { NumberingService } from '../../../numbering/services/numbering.service';
import { TendersService } from '../../tenders/services/tenders.service';
import { CreateQuotationDto, UpdateQuotationDto } from '../dto/quotation.dto';
import {
  QUOTATION_TRANSITIONS,
  QuotationStatus,
} from '../enums/quotation-status.enum';
import { Quotation } from '../schemas/quotation.schema';
import { calculateQuotationTotals } from '../utils/quotation-totals';

const ELIGIBLE_FOR_DECISION = [
  QuotationStatus.SUBMITTED,
  QuotationStatus.ACCEPTED,
];

@Injectable()
export class QuotationsService {
  constructor(
    @InjectModel(Quotation.name) private readonly model: Model<Quotation>,
    private readonly tendersService: TendersService,
    private readonly numberingService: NumberingService,
    private readonly customFields: CustomFieldValidationService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    tenderId: string,
    dto: CreateQuotationDto,
    user: AuthenticatedUser,
  ) {
    const tender = await this.tendersService.findById(tenderId);
    const customFields = await this.customFields.validate(
      BusinessModule.QUOTATION,
      dto.customFields,
    );
    const totals = calculateQuotationTotals(dto.items, dto.discount ?? 0);
    const { number } = await this.numberingService.next(DocumentType.QUOTATION);
    const created = await this.model.create({
      tenantId: this.tenantId(),
      quotationNumber: number,
      tenderId: tender._id,
      opportunityId: tender.opportunityId,
      version: 1,
      isCurrent: true,
      quotationDate: dto.quotationDate
        ? new Date(dto.quotationDate)
        : new Date(),
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      currency: dto.currency ?? 'INR',
      paymentTerms: dto.paymentTerms,
      deliveryTerms: dto.deliveryTerms,
      status: QuotationStatus.DRAFT,
      items: totals.items,
      customFields,
      createdBy: new Types.ObjectId(user.userId),
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.QUOTATION,
      entityType: 'Quotation',
      entityId: created._id.toString(),
      after: { quotationNumber: number, total: totals.total, version: 1 },
    });
    return created.toObject();
  }

  async listByTender(tenderId: string) {
    await this.tendersService.findById(tenderId);
    return this.model
      .find({
        tenantId: this.tenantId(),
        tenderId: new Types.ObjectId(tenderId),
      })
      .sort({ version: -1, createdAt: -1 })
      .lean<Quotation[]>()
      .exec();
  }

  async findById(id: string): Promise<Quotation> {
    const doc = await this.model
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<Quotation>()
      .exec();
    if (!doc) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return doc;
  }

  async update(id: string, dto: UpdateQuotationDto, user: AuthenticatedUser) {
    const current = await this.findById(id);
    if (current.status !== QuotationStatus.DRAFT) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Only draft quotations can be updated',
        ErrorCodes.INVALID_STATUS,
      );
    }
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.QUOTATION,
          dto.customFields,
        )
      : current.customFields;
    const totals = calculateQuotationTotals(
      dto.items ?? current.items,
      dto.discount ?? current.discount,
    );
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            validUntil: dto.validUntil
              ? new Date(dto.validUntil)
              : current.validUntil,
            paymentTerms: dto.paymentTerms ?? current.paymentTerms,
            deliveryTerms: dto.deliveryTerms ?? current.deliveryTerms,
            subtotal: totals.subtotal,
            discount: totals.discount,
            tax: totals.tax,
            total: totals.total,
            items: totals.items,
            customFields,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Quotation>()
      .exec();
    return updated!;
  }

  async submit(id: string, user: AuthenticatedUser) {
    const current = await this.findById(id);
    assertTransition(
      current.status,
      QuotationStatus.SUBMITTED,
      QUOTATION_TRANSITIONS,
    );
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            status: QuotationStatus.SUBMITTED,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Quotation>()
      .exec();
    await this.auditService.record({
      action: AuditAction.SUBMIT,
      module: BusinessModule.QUOTATION,
      entityType: 'Quotation',
      entityId: id,
      after: { status: QuotationStatus.SUBMITTED, version: current.version },
    });
    const tender = await this.tendersService.findById(
      current.tenderId.toString(),
    );
    const recipients = [
      tender.owner?.toString(),
      tender.assignedTo?.toString(),
    ].filter((value): value is string => Boolean(value));
    if (recipients.length) {
      await this.notificationsService.notify({
        userIds: recipients,
        eventType: NotificationEventType.QUOTATION_SUBMITTED,
        title: `Quotation submitted: ${current.quotationNumber}`,
        body: `Quotation ${current.quotationNumber} v${current.version} was submitted`,
        entityType: 'Quotation',
        entityId: id,
      });
    }
    return updated!;
  }

  async revise(id: string, dto: UpdateQuotationDto, user: AuthenticatedUser) {
    const current = await this.findById(id);
    if (!current.isCurrent) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Only the current quotation version can be revised',
        ErrorCodes.INVALID_STATUS,
      );
    }
    if (
      current.status !== QuotationStatus.SUBMITTED &&
      current.status !== QuotationStatus.DRAFT
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Only draft or submitted quotations can be revised',
        ErrorCodes.INVALID_STATUS,
      );
    }
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.QUOTATION,
          dto.customFields,
        )
      : current.customFields;
    const totals = calculateQuotationTotals(
      dto.items ?? current.items,
      dto.discount ?? current.discount,
    );
    const { number } = await this.numberingService.next(DocumentType.QUOTATION);
    await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            isCurrent: false,
            status: QuotationStatus.REVISED,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
      )
      .exec();
    const created = await this.model.create({
      tenantId: this.tenantId(),
      quotationNumber: number,
      tenderId: current.tenderId,
      opportunityId: current.opportunityId,
      version: current.version + 1,
      previousQuotationId: current._id,
      isCurrent: true,
      quotationDate: new Date(),
      validUntil: dto.validUntil
        ? new Date(dto.validUntil)
        : current.validUntil,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      currency: current.currency,
      paymentTerms: dto.paymentTerms ?? current.paymentTerms,
      deliveryTerms: dto.deliveryTerms ?? current.deliveryTerms,
      status: QuotationStatus.DRAFT,
      items: totals.items,
      customFields,
      createdBy: new Types.ObjectId(user.userId),
    });
    await this.auditService.record({
      action: AuditAction.REVISE,
      module: BusinessModule.QUOTATION,
      entityType: 'Quotation',
      entityId: created._id.toString(),
      after: {
        quotationNumber: number,
        version: created.version,
        previousQuotationId: current._id.toString(),
      },
    });
    return created.toObject();
  }

  async cancel(id: string, user: AuthenticatedUser) {
    const current = await this.findById(id);
    assertTransition(
      current.status,
      QuotationStatus.CANCELLED,
      QUOTATION_TRANSITIONS,
    );
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            status: QuotationStatus.CANCELLED,
            isCurrent: false,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Quotation>()
      .exec();
    await this.auditService.record({
      action: AuditAction.STATUS_CHANGE,
      module: BusinessModule.QUOTATION,
      entityType: 'Quotation',
      entityId: id,
      after: { status: QuotationStatus.CANCELLED },
    });
    return updated!;
  }

  async markStatus(
    id: string,
    status: QuotationStatus,
    session?: ClientSession,
  ) {
    await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        { $set: { status } },
        { session },
      )
      .exec();
  }

  assertEligibleForDecision(quotation: Quotation): void {
    if (!ELIGIBLE_FOR_DECISION.includes(quotation.status)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Quotation is not submitted or eligible for a client decision',
        ErrorCodes.QUOTATION_NOT_ELIGIBLE,
      );
    }
    if (quotation.validUntil && quotation.validUntil.getTime() < Date.now()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Quotation has expired',
        ErrorCodes.QUOTATION_NOT_ELIGIBLE,
      );
    }
  }

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }
}
