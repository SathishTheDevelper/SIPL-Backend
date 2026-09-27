import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    description: 'Required for tenant users. Omit for platform SUPER_ADMIN.',
  })
  @IsOptional()
  @IsString()
  tenantCode?: string;
}
