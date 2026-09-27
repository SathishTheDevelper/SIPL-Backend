import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateSiteDto } from '../dto/site.dto';
import { SitesService } from '../services/sites.service';

@ApiTags('Sites')
@ApiBearerAuth()
@Controller('projects')
export class ProjectSitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Post(':projectId/sites')
  @RequirePermissions(PermissionCode.SITES_CREATE)
  @ApiOperation({ summary: 'Create a site for a project' })
  create(
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @Body() dto: CreateSiteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sitesService.create(projectId, dto, user);
  }

  @Get(':projectId/sites')
  @RequirePermissions(PermissionCode.SITES_READ)
  @ApiOperation({ summary: 'List sites for a project' })
  list(@Param('projectId', ParseObjectIdPipe) projectId: string) {
    return this.sitesService.listByProject(projectId);
  }
}
