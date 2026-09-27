import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { BusinessModule } from '../../common/constants/modules';
import { ErrorCodes } from '../../common/constants/error-codes';
import { TenantContext } from '../../common/context/tenant.context';
import { FilteredQueryDto } from '../../common/dto/filtered-query.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { CustomFieldValidationService } from '../../custom-fields/services/custom-field-validation.service';
import {
  CreateMaterialCategoryDto,
  CreateMaterialDto,
  CreateUnitDto,
  UpdateMaterialCategoryDto,
  UpdateMaterialDto,
  UpdateUnitDto,
} from '../dto/material.dto';
import { MasterStatus } from '../enums/material.enums';
import { MaterialCategory } from '../schemas/material-category.schema';
import { Material } from '../schemas/material.schema';
import { UnitOfMeasure } from '../schemas/unit-of-measure.schema';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(Material.name) private readonly materials: Model<Material>,
    @InjectModel(MaterialCategory.name)
    private readonly categories: Model<MaterialCategory>,
    @InjectModel(UnitOfMeasure.name)
    private readonly units: Model<UnitOfMeasure>,
    private readonly customFields: CustomFieldValidationService,
    private readonly auditService: AuditService,
  ) {}

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }

  private missing(message: string): never {
    throw new AppException(HttpStatus.NOT_FOUND, message, ErrorCodes.NOT_FOUND);
  }

  private duplicate(message: string): never {
    throw new AppException(
      HttpStatus.CONFLICT,
      message,
      ErrorCodes.DUPLICATE_CODE,
    );
  }

  async requireCategory(id: string): Promise<MaterialCategory> {
    const row = await this.categories
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<MaterialCategory>()
      .exec();
    if (!row) this.missing('Material category not found');
    return row;
  }

  async requireUnit(id: string): Promise<UnitOfMeasure> {
    const row = await this.units
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<UnitOfMeasure>()
      .exec();
    if (!row) this.missing('Unit of measure not found');
    return row;
  }

  async requireMaterial(id: string): Promise<Material> {
    const row = await this.materials
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<Material>()
      .exec();
    if (!row) this.missing('Material not found');
    return row;
  }

  async createCategory(dto: CreateMaterialCategoryDto) {
    const customFields = await this.customFields.validate(
      BusinessModule.MATERIAL_CATEGORY,
      dto.customFields,
    );
    try {
      const created = await this.categories.create({
        tenantId: this.tenantId(),
        code: dto.code.trim().toUpperCase(),
        name: dto.name,
        description: dto.description,
        customFields,
      });
      return created.toObject();
    } catch (error) {
      this.rethrowDuplicate(error, 'Material category code already exists');
    }
  }

  async listCategories(query: FilteredQueryDto) {
    const filter = { tenantId: this.tenantId() };
    const page = skipTake(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.categories
        .find(filter)
        .sort({ name: 1 })
        .skip(page.skip)
        .limit(page.limit)
        .lean()
        .exec(),
      this.categories.countDocuments(filter).exec(),
    ]);
    return paginated(data, total, query.page, query.limit);
  }

  getCategory(id: string) {
    return this.requireCategory(id);
  }

  async updateCategory(id: string, dto: UpdateMaterialCategoryDto) {
    await this.requireCategory(id);
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.MATERIAL_CATEGORY,
          dto.customFields,
        )
      : undefined;
    return this.categories
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            ...(dto.name ? { name: dto.name } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description }
              : {}),
            ...(customFields ? { customFields } : {}),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  async deleteCategory(id: string) {
    await this.requireCategory(id);
    const used = await this.materials
      .countDocuments({ tenantId: this.tenantId(), categoryId: id })
      .exec();
    if (used > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Category is used by materials',
        ErrorCodes.CONFLICT,
      );
    }
    await this.categories
      .deleteOne({ _id: id, tenantId: this.tenantId() })
      .exec();
    return { deleted: true };
  }

  async createUnit(dto: CreateUnitDto) {
    try {
      const created = await this.units.create({
        tenantId: this.tenantId(),
        code: dto.code.trim().toUpperCase(),
        name: dto.name,
        symbol: dto.symbol,
      });
      return created.toObject();
    } catch (error) {
      this.rethrowDuplicate(error, 'Unit code already exists');
    }
  }

  async listUnits(query: FilteredQueryDto) {
    const filter = { tenantId: this.tenantId() };
    const page = skipTake(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.units
        .find(filter)
        .sort({ code: 1 })
        .skip(page.skip)
        .limit(page.limit)
        .lean()
        .exec(),
      this.units.countDocuments(filter).exec(),
    ]);
    return paginated(data, total, query.page, query.limit);
  }

  getUnit(id: string) {
    return this.requireUnit(id);
  }

  async updateUnit(id: string, dto: UpdateUnitDto) {
    await this.requireUnit(id);
    return this.units
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        { $set: dto },
        { new: true },
      )
      .lean()
      .exec();
  }

  async deleteUnit(id: string) {
    await this.requireUnit(id);
    const used = await this.materials
      .countDocuments({ tenantId: this.tenantId(), unitId: id })
      .exec();
    if (used > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Unit is used by materials',
        ErrorCodes.CONFLICT,
      );
    }
    await this.units.deleteOne({ _id: id, tenantId: this.tenantId() }).exec();
    return { deleted: true };
  }

  async createMaterial(dto: CreateMaterialDto, user: AuthenticatedUser) {
    await this.requireCategory(dto.categoryId);
    await this.requireUnit(dto.unitId);
    const customFields = await this.customFields.validate(
      BusinessModule.MATERIAL,
      dto.customFields,
    );
    try {
      const created = await this.materials.create({
        tenantId: this.tenantId(),
        materialCode: dto.materialCode.trim().toUpperCase(),
        name: dto.name,
        description: dto.description,
        categoryId: new Types.ObjectId(dto.categoryId),
        unitId: new Types.ObjectId(dto.unitId),
        defaultRate: dto.defaultRate ?? 0,
        taxRate: dto.taxRate ?? 0,
        customFields,
        createdBy: new Types.ObjectId(user.userId),
      });
      await this.auditService.record({
        action: AuditAction.CREATE,
        module: BusinessModule.MATERIAL,
        entityType: 'Material',
        entityId: created._id.toString(),
        after: { materialCode: created.materialCode, name: created.name },
      });
      return created.toObject();
    } catch (error) {
      this.rethrowDuplicate(error, 'Material code already exists');
    }
  }

  async listMaterials(query: FilteredQueryDto) {
    const filter: Record<string, unknown> = { tenantId: this.tenantId() };
    if (query.q) {
      filter.$or = [
        { name: { $regex: query.q, $options: 'i' } },
        { materialCode: { $regex: query.q, $options: 'i' } },
      ];
    }
    const page = skipTake(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.materials
        .find(filter)
        .select({
          materialCode: 1,
          name: 1,
          status: 1,
          categoryId: 1,
          unitId: 1,
          defaultRate: 1,
        })
        .sort({ materialCode: 1 })
        .skip(page.skip)
        .limit(page.limit)
        .lean()
        .exec(),
      this.materials.countDocuments(filter).exec(),
    ]);
    return paginated(data, total, query.page, query.limit);
  }

  getMaterial(id: string) {
    return this.requireMaterial(id);
  }

  async updateMaterial(
    id: string,
    dto: UpdateMaterialDto,
    user: AuthenticatedUser,
  ) {
    const current = await this.requireMaterial(id);
    if (dto.categoryId) await this.requireCategory(dto.categoryId);
    if (dto.unitId) await this.requireUnit(dto.unitId);
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.MATERIAL,
          dto.customFields,
        )
      : current.customFields;
    const updated = await this.materials
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            name: dto.name ?? current.name,
            description: dto.description ?? current.description,
            categoryId: dto.categoryId
              ? new Types.ObjectId(dto.categoryId)
              : current.categoryId,
            unitId: dto.unitId
              ? new Types.ObjectId(dto.unitId)
              : current.unitId,
            defaultRate: dto.defaultRate ?? current.defaultRate,
            taxRate: dto.taxRate ?? current.taxRate,
            customFields,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    await this.auditService.record({
      action: AuditAction.UPDATE,
      module: BusinessModule.MATERIAL,
      entityType: 'Material',
      entityId: id,
      after: { name: updated?.name },
    });
    return updated;
  }

  async setMaterialStatus(
    id: string,
    status: MasterStatus,
    user: AuthenticatedUser,
  ) {
    await this.requireMaterial(id);
    const updated = await this.materials
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        { $set: { status, updatedBy: new Types.ObjectId(user.userId) } },
        { new: true },
      )
      .lean()
      .exec();
    await this.auditService.record({
      action: AuditAction.STATUS_CHANGE,
      module: BusinessModule.MATERIAL,
      entityType: 'Material',
      entityId: id,
      after: { status },
    });
    return updated;
  }

  private rethrowDuplicate(error: unknown, message: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    ) {
      this.duplicate(message);
    }
    throw error;
  }
}
