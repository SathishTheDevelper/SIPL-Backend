import { HttpStatus, Injectable } from '@nestjs/common';
import { FilterQuery } from 'mongoose';
import { ErrorCodes } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { normalizeEmail } from '../../common/utils/object-id.util';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import {
  UpdateTenantDto,
  UpdateTenantSettingsDto,
} from '../dto/update-tenant.dto';
import { TenantStatus } from '../enums/tenant-status.enum';
import { TenantsRepository } from '../repositories/tenants.repository';
import { Tenant, TenantSettings } from '../schemas/tenant.schema';
import { defaultSubscription, defaultTenantSettings } from '../tenant-defaults';

@Injectable()
export class TenantsService {
  constructor(private readonly tenantsRepository: TenantsRepository) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    const existing = await this.tenantsRepository.findByCode(dto.code);
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Tenant code already exists',
        ErrorCodes.DUPLICATE_CODE,
      );
    }

    const settings = defaultTenantSettings();
    if (dto.geofenceRadiusMeters) {
      settings.geofenceRadiusMeters = dto.geofenceRadiusMeters;
    }

    return this.tenantsRepository.create({
      name: dto.name,
      code: dto.code.toUpperCase(),
      legalName: dto.legalName,
      gstNumber: dto.gstNumber,
      panNumber: dto.panNumber,
      address: dto.address,
      phone: dto.phone,
      email: normalizeEmail(dto.email),
      status: dto.status ?? TenantStatus.TRIAL,
      settings,
      subscription: {
        ...defaultSubscription(),
        ...dto.subscription,
      },
    });
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, limit } = skipTake(query.page, query.limit);
    const filter: FilterQuery<Tenant> = {};
    if (query.q) {
      filter.$or = [
        { name: { $regex: query.q, $options: 'i' } },
        { code: { $regex: query.q, $options: 'i' } },
        { legalName: { $regex: query.q, $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.tenantsRepository.findMany(filter, skip, limit),
      this.tenantsRepository.count(filter),
    ]);
    return paginated(items, total, query.page, query.limit);
  }

  async findByIdOrThrow(id: string): Promise<Tenant> {
    const tenant = await this.tenantsRepository.findById(id);
    if (!tenant) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return tenant;
  }

  async findByCode(code: string): Promise<Tenant | null> {
    return this.tenantsRepository.findByCode(code);
  }

  async findActiveById(id: string): Promise<Tenant | null> {
    const tenant = await this.tenantsRepository.findById(id);
    if (!tenant) {
      return null;
    }
    if (
      tenant.status !== TenantStatus.ACTIVE &&
      tenant.status !== TenantStatus.TRIAL
    ) {
      return null;
    }
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    if (dto.code) {
      const existing = await this.tenantsRepository.findByCode(dto.code);
      const existingId = existing?._id?.toString();
      if (existing && existingId !== id) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'Tenant code already exists',
          ErrorCodes.DUPLICATE_CODE,
        );
      }
    }

    const current = await this.findByIdOrThrow(id);
    const updated = await this.tenantsRepository.updateById(id, {
      name: dto.name,
      code: dto.code?.toUpperCase(),
      legalName: dto.legalName,
      gstNumber: dto.gstNumber,
      panNumber: dto.panNumber,
      address: dto.address,
      phone: dto.phone,
      email: dto.email ? normalizeEmail(dto.email) : undefined,
      status: dto.status,
      subscription: dto.subscription
        ? { ...current.subscription, ...dto.subscription }
        : undefined,
    });
    if (!updated) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return updated;
  }

  async updateStatus(id: string, status: TenantStatus): Promise<Tenant> {
    await this.findByIdOrThrow(id);
    const updated = await this.tenantsRepository.updateById(id, { status });
    if (!updated) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return updated;
  }

  async updateSettings(
    id: string,
    dto: UpdateTenantSettingsDto,
  ): Promise<Tenant> {
    const tenant = await this.findByIdOrThrow(id);
    const settings: TenantSettings = {
      ...tenant.settings,
      ...dto,
      numbering: {
        ...tenant.settings.numbering,
        ...(dto.numbering ?? {}),
      },
      slaHoursByModule: {
        ...tenant.settings.slaHoursByModule,
        ...(dto.slaHoursByModule ?? {}),
      },
      notificationRecipients: {
        ...tenant.settings.notificationRecipients,
        ...(dto.notificationRecipients ?? {}),
      },
      poApprovalLimits:
        dto.poApprovalLimits ?? tenant.settings.poApprovalLimits,
      approvalHierarchy:
        dto.approvalHierarchy ?? tenant.settings.approvalHierarchy,
    };
    const updated = await this.tenantsRepository.updateById(id, { settings });
    if (!updated) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return updated;
  }
}
