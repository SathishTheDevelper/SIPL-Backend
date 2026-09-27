import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TenantStatus } from '../enums/tenant-status.enum';
import { CreateTenantDto } from './create-tenant.dto';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {}

export class UpdateTenantStatusDto {
  @ApiPropertyOptional({ enum: TenantStatus })
  @IsEnum(TenantStatus)
  status!: TenantStatus;
}

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  geofenceRadiusMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  financialYearStartMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  invoiceTolerancePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  invoiceToleranceAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  gstEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  defaultGstPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  defaultPaymentTermsDays?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  workingDays?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  workingStartTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  workingEndTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  slaHoursByModule?: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  poApprovalLimits?: { roleCode: string; maxAmount: number }[];

  @ApiPropertyOptional()
  @IsOptional()
  approvalHierarchy?: Record<string, unknown>[];

  @ApiPropertyOptional()
  @IsOptional()
  numbering?: Record<
    string,
    { prefix: string; padding: number; includeYear?: boolean }
  >;

  @ApiPropertyOptional()
  @IsOptional()
  notificationRecipients?: Record<string, string[]>;

  @ApiPropertyOptional()
  @IsOptional()
  holidayCalendarId?: string;
}
