import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { DocumentType } from '../../common/constants/modules';

export class NextNumberDto {
  @ApiProperty({ enum: Object.values(DocumentType) })
  @IsString()
  @IsIn(Object.values(DocumentType))
  documentType!: string;
}
