import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class SwitchTenantDto {
  @ApiProperty({
    description:
      'Accepted only to mint a new JWT. Subsequent tenant isolation still comes from the token, never from the request.',
  })
  @IsMongoId()
  tenantId!: string;
}
