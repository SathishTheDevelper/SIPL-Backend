import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreatePlanningDto, UpdatePlanningDto } from '../dto/boq.dto';
import { BoqService } from '../services/boq.service';

@ApiTags('Material Planning')
@ApiBearerAuth()
@Controller()
export class MaterialPlanningController {
  constructor(private readonly boqService: BoqService) {}

  @Post('projects/:projectId/material-planning')
  @RequirePermissions(PermissionCode.PLANNING_CREATE)
  create(
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @Body() dto: CreatePlanningDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boqService.createPlanning(projectId, dto, user);
  }

  @Get('projects/:projectId/material-planning')
  @RequirePermissions(PermissionCode.PLANNING_READ)
  list(@Param('projectId', ParseObjectIdPipe) projectId: string) {
    return this.boqService.listPlanning(projectId);
  }

  @Get('material-planning/:id')
  @RequirePermissions(PermissionCode.PLANNING_READ)
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.boqService.getPlanning(id);
  }

  @Patch('material-planning/:id')
  @RequirePermissions(PermissionCode.PLANNING_UPDATE)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePlanningDto,
  ) {
    return this.boqService.updatePlanning(id, dto);
  }
}
