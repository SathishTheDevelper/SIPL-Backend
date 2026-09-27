import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { UpdateSiteDto } from '../dto/site.dto';
import { SitesService } from '../services/sites.service';

@ApiTags('Sites')
@ApiBearerAuth()
@Controller('sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get(':id')
  @RequirePermissions(PermissionCode.SITES_READ)
  @ApiOperation({ summary: 'Get a site. Cross-tenant ids return 404.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.sitesService.findById(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.SITES_UPDATE)
  @ApiOperation({ summary: 'Update a site' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateSiteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sitesService.update(id, dto, user);
  }

  @Post(':id/activate')
  @RequirePermissions(PermissionCode.SITES_UPDATE)
  @ApiOperation({ summary: 'Activate a draft or inactive site' })
  activate(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sitesService.activate(id, user);
  }

  @Post(':id/deactivate')
  @RequirePermissions(PermissionCode.SITES_UPDATE)
  @ApiOperation({ summary: 'Deactivate an active site' })
  deactivate(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sitesService.deactivate(id, user);
  }

  @Post(':id/close')
  @RequirePermissions(PermissionCode.SITES_UPDATE)
  @ApiOperation({ summary: 'Close a site' })
  close(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sitesService.close(id, user);
  }
}
