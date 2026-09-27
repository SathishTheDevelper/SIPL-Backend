import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { UpdatePreferenceDto } from '../dto/notification.dto';
import { NotificationsService } from '../services/notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermissions(PermissionCode.NOTIFICATIONS_READ)
  @ApiOperation({ summary: 'List in-app notifications for the current user' })
  inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.notificationsService.myInbox(user.userId, query);
  }

  @Patch(':id/read')
  @RequirePermissions(PermissionCode.NOTIFICATIONS_UPDATE)
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.notificationsService.markRead(user.userId, id);
  }

  @Get('preferences')
  @RequirePermissions(PermissionCode.NOTIFICATIONS_READ)
  @ApiOperation({ summary: 'List notification preferences' })
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listPreferences(user.userId);
  }

  @Patch('preferences')
  @RequirePermissions(PermissionCode.NOTIFICATIONS_UPDATE)
  @ApiOperation({ summary: 'Update a notification preference' })
  updatePreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePreferenceDto,
  ) {
    return this.notificationsService.upsertPreference(user.userId, dto);
  }
}
