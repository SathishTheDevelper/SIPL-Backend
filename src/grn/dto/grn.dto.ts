import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AttachmentMetaDto } from '../../attachments/dto/attachment.dto';

export class CreateGrnItemDto {
  @ApiProperty()
  @IsMongoId()
  purchaseOrderItemId!: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  receivedQuantity!: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  acceptedQuantity!: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  rejectedQuantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}

export class CreateGrnDto {
  @ApiProperty()
  @IsMongoId()
  deliveryId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  grnDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;

  @ApiProperty({ type: [CreateGrnItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGrnItemDto)
  items!: CreateGrnItemDto[];

  @ApiPropertyOptional({ type: [AttachmentMetaDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AttachmentMetaDto)
  attachments?: AttachmentMetaDto[];
}

export class UpdateGrnDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  grnDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}

export class GrnReasonDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  reason!: string;
}
