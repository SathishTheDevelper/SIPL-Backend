import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewInvoiceDto {
  @ApiPropertyOptional({ enum: ['ACCEPT', 'SEND_BACK'] })
  @IsOptional()
  @IsIn(['ACCEPT', 'SEND_BACK'])
  decision?: 'ACCEPT' | 'SEND_BACK';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;

  @ApiPropertyOptional({
    description:
      'Required when sending a mismatched invoice back for correction.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
