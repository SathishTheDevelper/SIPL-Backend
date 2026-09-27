import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  BoqDecisionDto,
  CreateBoqDto,
  CreateBoqItemDto,
  UpdateBoqDto,
  UpdateBoqItemDto,
} from '../dto/boq.dto';
import { BoqService } from '../services/boq.service';

@ApiTags('BOQ')
@ApiBearerAuth()
@Controller()
export class BoqController {
  constructor(private readonly boqService: BoqService) {}

  @Post('projects/:projectId/boq')
  @RequirePermissions(PermissionCode.BOQ_CREATE)
  @ApiOperation({ summary: 'Create the next BOQ version for a project' })
  create(
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @Body() dto: CreateBoqDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boqService.create(projectId, dto, user);
  }

  @Get('projects/:projectId/boq')
  @RequirePermissions(PermissionCode.BOQ_READ)
  list(@Param('projectId', ParseObjectIdPipe) projectId: string) {
    return this.boqService.listByProject(projectId);
  }

  @Get('boq/:id')
  @RequirePermissions(PermissionCode.BOQ_READ)
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.boqService.get(id);
  }

  @Patch('boq/:id')
  @RequirePermissions(PermissionCode.BOQ_UPDATE)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateBoqDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boqService.update(id, dto, user);
  }

  @Post('boq/:id/submit')
  @RequirePermissions(PermissionCode.BOQ_UPDATE)
  submit(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boqService.submit(id, user);
  }

  @Post('boq/:id/approve')
  @RequirePermissions(PermissionCode.WORKFLOW_ACT)
  @ApiOperation({ summary: 'Approve through the configured BOQ workflow' })
  approve(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: BoqDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boqService.approve(id, dto, user);
  }

  @Post('boq/:id/reject')
  @RequirePermissions(PermissionCode.WORKFLOW_ACT)
  reject(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: BoqDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boqService.reject(id, dto, user);
  }

  @Post('boq/:id/revise')
  @RequirePermissions(PermissionCode.BOQ_CREATE)
  revise(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boqService.revise(id, user);
  }

  @Get('boq/:id/items')
  @RequirePermissions(PermissionCode.BOQ_READ)
  items(@Param('id', ParseObjectIdPipe) id: string) {
    return this.boqService.listItems(id);
  }

  @Post('boq/:id/items')
  @RequirePermissions(PermissionCode.BOQ_UPDATE)
  addItem(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateBoqItemDto,
  ) {
    return this.boqService.addItem(id, dto);
  }

  @Patch('boq/:id/items/:itemId')
  @RequirePermissions(PermissionCode.BOQ_UPDATE)
  updateItem(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('itemId', ParseObjectIdPipe) itemId: string,
    @Body() dto: UpdateBoqItemDto,
  ) {
    return this.boqService.updateItem(id, itemId, dto);
  }

  @Delete('boq/:id/items/:itemId')
  @RequirePermissions(PermissionCode.BOQ_UPDATE)
  deleteItem(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('itemId', ParseObjectIdPipe) itemId: string,
  ) {
    return this.boqService.deleteItem(id, itemId);
  }
}
