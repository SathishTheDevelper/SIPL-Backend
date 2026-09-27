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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionCode } from '../../common/constants/permissions';
import { FilteredQueryDto } from '../../common/dto/filtered-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CreateMaterialCategoryDto,
  UpdateMaterialCategoryDto,
} from '../dto/material.dto';
import { MaterialsService } from '../services/materials.service';

@ApiTags('Material Categories')
@ApiBearerAuth()
@Controller('material-categories')
export class MaterialCategoriesController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @RequirePermissions(PermissionCode.CATEGORIES_CREATE)
  create(@Body() dto: CreateMaterialCategoryDto) {
    return this.materialsService.createCategory(dto);
  }

  @Get()
  @RequirePermissions(PermissionCode.CATEGORIES_READ)
  list(@Query() query: FilteredQueryDto) {
    return this.materialsService.listCategories(query);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.CATEGORIES_READ)
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.materialsService.getCategory(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.CATEGORIES_UPDATE)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateMaterialCategoryDto,
  ) {
    return this.materialsService.updateCategory(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.CATEGORIES_DELETE)
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.materialsService.deleteCategory(id);
  }
}
