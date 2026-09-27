import { HttpStatus, Injectable } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { DocumentType } from '../../common/constants/modules';
import { ErrorCodes } from '../../common/constants/error-codes';
import { TenantContext } from '../../common/context/tenant.context';
import { AppException } from '../../common/exceptions/app.exception';
import { TenantsService } from '../../tenants/services/tenants.service';
import { NumberingConfig } from '../../tenants/schemas/tenant.schema';
import { NumberingRepository } from '../repositories/numbering.repository';
import { NumberingSequence } from '../schemas/numbering-sequence.schema';

const SETTINGS_KEY: Record<
  string,
  keyof import('../../tenants/schemas/tenant.schema').TenantNumbering
> = {
  [DocumentType.LEAD]: 'lead',
  [DocumentType.OPPORTUNITY]: 'opportunity',
  [DocumentType.TENDER]: 'tender',
  [DocumentType.PROJECT]: 'project',
  [DocumentType.MATERIAL_REQUEST]: 'materialRequest',
  [DocumentType.MR]: 'materialRequest',
  [DocumentType.BOQ]: 'boq',
  [DocumentType.EMPLOYEE]: 'employee',
  [DocumentType.RFQ]: 'rfq',
  [DocumentType.QUOTATION]: 'quotation',
  [DocumentType.PURCHASE_ORDER]: 'purchaseOrder',
  [DocumentType.PO]: 'purchaseOrder',
  [DocumentType.DELIVERY]: 'delivery',
  [DocumentType.GRN]: 'grn',
  [DocumentType.INVOICE]: 'invoice',
  [DocumentType.PAYMENT]: 'payment',
};

@Injectable()
export class NumberingService {
  constructor(
    private readonly numberingRepository: NumberingRepository,
    private readonly tenantsService: TenantsService,
  ) {}

  async next(
    documentType: string,
    session?: ClientSession,
  ): Promise<{ number: string; sequence: number }> {
    const tenantId = TenantContext.requireTenantId();
    const tenant = await this.tenantsService.findByIdOrThrow(tenantId);
    const config = this.resolveConfig(tenant.settings.numbering, documentType);
    const year = new Date().getFullYear();
    const sequence = await this.numberingRepository.increment(
      new Types.ObjectId(tenantId),
      documentType.toUpperCase(),
      year,
      config.prefix,
      config.padding,
      session,
    );
    if (!sequence.current) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Could not allocate document number',
        ErrorCodes.NUMBERING_FAILED,
      );
    }
    const padded = String(sequence.current).padStart(config.padding, '0');
    const number = config.includeYear
      ? `${config.prefix}-${year}-${padded}`
      : `${config.prefix}-${padded}`;
    return { number, sequence: sequence.current };
  }

  async list(): Promise<NumberingSequence[]> {
    return this.numberingRepository.findAll(
      new Types.ObjectId(TenantContext.requireTenantId()),
    );
  }

  private resolveConfig(
    numbering: import('../../tenants/schemas/tenant.schema').TenantNumbering,
    documentType: string,
  ): NumberingConfig {
    const key = SETTINGS_KEY[documentType.toUpperCase()];
    const config = key ? numbering[key] : undefined;
    if (!config) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        `Numbering is not configured for ${documentType}`,
        ErrorCodes.NUMBERING_FAILED,
      );
    }
    return config;
  }
}
