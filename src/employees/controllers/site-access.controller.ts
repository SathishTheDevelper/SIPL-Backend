import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { FilteredQueryDto } from '../../common/dto/filtered-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CreateSiteAccessDto,
  SiteAccessDecisionDto,
} from '../dto/employee.dto';
import { SiteAccessService } from '../services/site-access.service';

@ApiTags('Site Access Requests')
@ApiBearerAuth()
@Controller('site-access-requests')
export class SiteAccessController {
  constructor(private readonly siteAccessService: SiteAccessService) {}

  @Post()
  @RequirePermissions(PermissionCode.SITE_ACCESS_CREATE)
  @ApiOperation({
    summary: 'Request additional site access for the signed-in employee',
  })
  create(
    @Body() dto: CreateSiteAccessDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.siteAccessService.create(dto, user);
  }

  @Get()
  @RequirePermissions(PermissionCode.SITE_ACCESS_READ)
  list(@Query() query: FilteredQueryDto) {
    return this.siteAccessService.list(query);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.SITE_ACCESS_READ)
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.siteAccessService.get(id);
  }

  @Post(':id/approve')
  @RequirePermissions(PermissionCode.WORKFLOW_ACT)
  @ApiOperation({
    summary: 'HR approval through the configured site-access workflow',
  })
  approve(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SiteAccessDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.siteAccessService.approve(id, dto, user);
  }

  @Post(':id/reject')
  @RequirePermissions(PermissionCode.WORKFLOW_ACT)
  reject(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SiteAccessDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.siteAccessService.reject(id, dto, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(PermissionCode.SITE_ACCESS_CREATE)
  cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.siteAccessService.cancel(id, user);
  }
}
