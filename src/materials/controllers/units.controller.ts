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
import { CreateUnitDto, UpdateUnitDto } from '../dto/material.dto';
import { MaterialsService } from '../services/materials.service';

@ApiTags('Units')
@ApiBearerAuth()
@Controller('units')
export class UnitsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @RequirePermissions(PermissionCode.UNITS_CREATE)
  create(@Body() dto: CreateUnitDto) {
    return this.materialsService.createUnit(dto);
  }

  @Get()
  @RequirePermissions(PermissionCode.UNITS_READ)
  list(@Query() query: FilteredQueryDto) {
    return this.materialsService.listUnits(query);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.UNITS_READ)
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.materialsService.getUnit(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.UNITS_UPDATE)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateUnitDto,
  ) {
    return this.materialsService.updateUnit(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.UNITS_DELETE)
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.materialsService.deleteUnit(id);
  }
}
