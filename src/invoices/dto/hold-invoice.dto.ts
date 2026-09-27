import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class HoldInvoiceDto {
  @ApiProperty({ example: 'Waiting for vendor clarification' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  holdReason!: string;
}

export class InvoiceReasonDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;
}
