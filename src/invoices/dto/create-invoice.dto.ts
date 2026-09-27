import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AttachmentMetaDto } from '../../attachments/dto/attachment.dto';
import { InvoiceType } from '../enums/invoice-type.enum';
import { InvoiceItemDto } from './invoice-item.dto';

export class CreateInvoiceDto {
  @ApiProperty({
    description:
      'Vendor invoice number. Unique per tenant and vendor. The system invoice number is allocated separately.',
  })
  @IsString()
  @MaxLength(80)
  vendorInvoiceNumber!: string;

  @ApiProperty()
  @IsDateString()
  invoiceDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty()
  @IsMongoId()
  vendorId!: string;

  @ApiProperty()
  @IsMongoId()
  purchaseOrderId!: string;

  @ApiProperty({ type: [String], description: 'One or more GRNs for the PO.' })
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  grnIds!: string[];

  @ApiProperty({ type: [InvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  invoiceItems!: InvoiceItemDto[];

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  subtotal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  additionalCharges?: number;

  @ApiPropertyOptional({ enum: InvoiceType })
  @IsOptional()
  @IsEnum(InvoiceType)
  invoiceType?: InvoiceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentTerms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;

  @ApiPropertyOptional({
    example: { costCenter: 'CC-001', invoiceCategory: 'Material' },
  })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  @ApiProperty({ type: [AttachmentMetaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttachmentMetaDto)
  attachments!: AttachmentMetaDto[];
}
