import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { FilteredQueryDto } from '../../common/dto/filtered-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CreateMaterialRequestDto,
  CreateMaterialRequestItemDto,
  UpdateMaterialRequestDto,
  UpdateMaterialRequestItemDto,
} from '../dto/material-request.dto';
import { MaterialRequestsService } from '../services/material-requests.service';

@ApiTags('Material Requests')
@ApiBearerAuth()
@Controller()
export class MaterialRequestsController {
  constructor(
    private readonly materialRequestsService: MaterialRequestsService,
  ) {}

  @Post('projects/:projectId/material-requests')
  @RequirePermissions(PermissionCode.MR_CREATE)
  @ApiOperation({
    summary: 'Create a draft site material request against the approved BOQ',
  })
  create(
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @Body() dto: CreateMaterialRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materialRequestsService.create(projectId, dto, user);
  }

  @Get('projects/:projectId/material-requests')
  @RequirePermissions(PermissionCode.MR_READ)
  list(
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @Query() query: FilteredQueryDto,
  ) {
    return this.materialRequestsService.listByProject(projectId, query);
  }

  @Get('material-requests/:id')
  @RequirePermissions(PermissionCode.MR_READ)
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.materialRequestsService.get(id);
  }

  @Patch('material-requests/:id')
  @RequirePermissions(PermissionCode.MR_UPDATE)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateMaterialRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materialRequestsService.update(id, dto, user);
  }

  @Post('material-requests/:id/submit')
  @RequirePermissions(PermissionCode.MR_UPDATE)
  @ApiOperation({
    summary:
      'Validate BOQ quantities, apply the 30% rule, and start the configured approval workflow',
  })
  submit(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materialRequestsService.submit(id, user);
  }

  @Post('material-requests/:id/cancel')
  @RequirePermissions(PermissionCode.MR_UPDATE)
  cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materialRequestsService.cancel(id, user);
  }

  @Get('material-requests/:id/items')
  @RequirePermissions(PermissionCode.MR_READ)
  items(@Param('id', ParseObjectIdPipe) id: string) {
    return this.materialRequestsService.listItems(id);
  }

  @Post('material-requests/:id/items')
  @RequirePermissions(PermissionCode.MR_UPDATE)
  addItem(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateMaterialRequestItemDto,
  ) {
    return this.materialRequestsService.addItem(id, dto);
  }

  @Patch('material-requests/:id/items/:itemId')
  @RequirePermissions(PermissionCode.MR_UPDATE)
  updateItem(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('itemId', ParseObjectIdPipe) itemId: string,
    @Body() dto: UpdateMaterialRequestItemDto,
  ) {
    return this.materialRequestsService.updateItem(id, itemId, dto);
  }

  @Delete('material-requests/:id/items/:itemId')
  @RequirePermissions(PermissionCode.MR_UPDATE)
  deleteItem(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('itemId', ParseObjectIdPipe) itemId: string,
  ) {
    return this.materialRequestsService.deleteItem(id, itemId);
  }
}
