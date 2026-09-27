import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionCode } from '../../common/constants/permissions';
import { FilteredQueryDto } from '../../common/dto/filtered-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateMaterialDto, UpdateMaterialDto } from '../dto/material.dto';
import { MasterStatus } from '../enums/material.enums';
import { MaterialsService } from '../services/materials.service';

@ApiTags('Materials')
@ApiBearerAuth()
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @RequirePermissions(PermissionCode.MATERIALS_CREATE)
  @ApiOperation({ summary: 'Create a material' })
  create(
    @Body() dto: CreateMaterialDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materialsService.createMaterial(dto, user);
  }

  @Get()
  @RequirePermissions(PermissionCode.MATERIALS_READ)
  list(@Query() query: FilteredQueryDto) {
    return this.materialsService.listMaterials(query);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.MATERIALS_READ)
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.materialsService.getMaterial(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.MATERIALS_UPDATE)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateMaterialDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materialsService.updateMaterial(id, dto, user);
  }

  @Post(':id/activate')
  @RequirePermissions(PermissionCode.MATERIALS_UPDATE)
  activate(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materialsService.setMaterialStatus(
      id,
      MasterStatus.ACTIVE,
      user,
    );
  }

  @Post(':id/deactivate')
  @RequirePermissions(PermissionCode.MATERIALS_UPDATE)
  deactivate(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materialsService.setMaterialStatus(
      id,
      MasterStatus.INACTIVE,
      user,
    );
  }
}
