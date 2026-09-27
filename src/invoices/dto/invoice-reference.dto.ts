import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { InvoiceReferenceType } from '../enums/invoice-reference-type.enum';

export class InvoiceReferenceDto {
  @ApiProperty({ enum: InvoiceReferenceType })
  @IsEnum(InvoiceReferenceType)
  referenceType!: InvoiceReferenceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  purchaseOrderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  grnId?: string;

  @ApiProperty()
  @IsString()
  referenceNumber!: string;
}
