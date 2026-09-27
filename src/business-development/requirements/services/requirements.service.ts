import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../../audit/enums/audit-action.enum';
import { AuditService } from '../../../audit/services/audit.service';
import { BusinessModule } from '../../../common/constants/modules';
import { ErrorCodes } from '../../../common/constants/error-codes';
import { TenantContext } from '../../../common/context/tenant.context';
import { AppException } from '../../../common/exceptions/app.exception';
import { CustomFieldValidationService } from '../../../custom-fields/services/custom-field-validation.service';
import { TenderRequirementReference } from '../../tenders/schemas/tender-requirement-reference.schema';
import { TendersService } from '../../tenders/services/tenders.service';
import {
  CreateRequirementDto,
  UpdateRequirementDto,
} from '../dto/requirement.dto';
import { RequirementStatus } from '../enums/requirement.enums';
import { Requirement, RequirementItem } from '../schemas/requirement.schema';

@Injectable()
export class RequirementsService {
  constructor(
    @InjectModel(Requirement.name) private readonly model: Model<Requirement>,
    @InjectModel(TenderRequirementReference.name)
    private readonly referenceModel: Model<TenderRequirementReference>,
    private readonly tendersService: TendersService,
    private readonly customFields: CustomFieldValidationService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    tenderId: string,
    dto: CreateRequirementDto,
    user: AuthenticatedUser,
  ) {
    const tender = await this.tendersService.findById(tenderId);
    const customFields = await this.customFields.validate(
      BusinessModule.REQUIREMENT,
      dto.customFields,
    );
    const items = this.computeItems(dto.items);
    const created = await this.model.create({
      tenantId: this.tenantId(),
      tenderId: tender._id,
      opportunityId: tender.opportunityId,
      projectType: dto.projectType,
      description: dto.description,
      location: dto.location,
      expectedStartDate: dto.expectedStartDate
        ? new Date(dto.expectedStartDate)
        : undefined,
      expectedEndDate: dto.expectedEndDate
        ? new Date(dto.expectedEndDate)
        : undefined,
      items,
      customFields,
      status: RequirementStatus.DRAFT,
      createdBy: new Types.ObjectId(user.userId),
    });
    await this.referenceModel.create({
      tenantId: this.tenantId(),
      tenderId: tender._id,
      requirementId: created._id,
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.REQUIREMENT,
      entityType: 'Requirement',
      entityId: created._id.toString(),
      after: { tenderId, projectType: dto.projectType },
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
      .sort({ createdAt: -1 })
      .lean<Requirement[]>()
      .exec();
  }

  async findById(id: string): Promise<Requirement> {
    const doc = await this.model
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<Requirement>()
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

  async update(id: string, dto: UpdateRequirementDto, user: AuthenticatedUser) {
    const current = await this.findById(id);
    if (current.status !== RequirementStatus.DRAFT) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Only draft requirements can be updated',
        ErrorCodes.INVALID_STATUS,
      );
    }
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.REQUIREMENT,
          dto.customFields,
        )
      : current.customFields;
    const items = dto.items ? this.computeItems(dto.items) : current.items;
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            description: dto.description ?? current.description,
            location: dto.location ?? current.location,
            expectedStartDate: dto.expectedStartDate
              ? new Date(dto.expectedStartDate)
              : current.expectedStartDate,
            expectedEndDate: dto.expectedEndDate
              ? new Date(dto.expectedEndDate)
              : current.expectedEndDate,
            items,
            customFields,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Requirement>()
      .exec();
    return updated!;
  }

  async submit(id: string, user: AuthenticatedUser) {
    await this.findById(id);
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            status: RequirementStatus.SUBMITTED,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Requirement>()
      .exec();
    await this.auditService.record({
      action: AuditAction.SUBMIT,
      module: BusinessModule.REQUIREMENT,
      entityType: 'Requirement',
      entityId: id,
    });
    return updated!;
  }

  private computeItems(
    items: {
      description: string;
      quantity: number;
      estimatedRate?: number;
      [key: string]: unknown;
    }[],
  ): RequirementItem[] {
    return items.map((item) => ({
      ...item,
      estimatedRate: item.estimatedRate ?? 0,
      estimatedAmount: Number(
        ((item.quantity ?? 0) * (item.estimatedRate ?? 0)).toFixed(2),
      ),
    })) as RequirementItem[];
  }

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }
}
