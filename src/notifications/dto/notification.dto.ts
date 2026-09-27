import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsString } from 'class-validator';
import { NotificationChannel } from '../enums/notification.enums';

export class UpdatePreferenceDto {
  @ApiProperty()
  @IsString()
  eventType!: string;

  @ApiProperty({ enum: NotificationChannel, isArray: true })
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels!: NotificationChannel[];

  @ApiPropertyOptional()
  @IsBoolean()
  enabled!: boolean;
}
