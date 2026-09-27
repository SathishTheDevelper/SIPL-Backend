import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin.a@tenant-a.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'TenantAdmin@12345' })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiPropertyOptional({
    example: 'TENANTA',
    description: 'Required for tenant users. Omit for platform SUPER_ADMIN.',
  })
  @IsOptional()
  @IsString()
  tenantCode?: string;
}
