import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AttachmentMetaDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  mimeType!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  size!: number;

  @ApiProperty({
    description:
      'Key of an object already stored outside MongoDB. File bytes are not stored.',
  })
  @IsString()
  @MaxLength(1024)
  storageKey!: string;
}

export class AttachmentListDto {
  @ApiPropertyOptional({ type: [AttachmentMetaDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AttachmentMetaDto)
  attachments?: AttachmentMetaDto[];
}
