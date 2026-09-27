import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AddressDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  line1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  state!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  country!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  postalCode!: string;
}
