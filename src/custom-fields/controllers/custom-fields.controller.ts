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
import { PermissionCode } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
} from '../dto/create-custom-field.dto';
import { CustomFieldsService } from '../services/custom-fields.service';

@ApiTags('Custom Fields')
@ApiBearerAuth()
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Post()
  @RequirePermissions(PermissionCode.CUSTOM_FIELDS_CREATE)
  @ApiOperation({ summary: 'Define a tenant-specific dynamic field' })
  create(@Body() dto: CreateCustomFieldDto) {
    return this.customFieldsService.create(dto);
  }

  @Get(':module')
  @RequirePermissions(PermissionCode.CUSTOM_FIELDS_READ)
  @ApiOperation({ summary: 'List custom field definitions for a module' })
  findByModule(
    @Param('module') module: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.customFieldsService.findByModule(
      module,
      includeInactive === 'true',
    );
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.CUSTOM_FIELDS_UPDATE)
  @ApiOperation({ summary: 'Update a custom field definition' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCustomFieldDto,
  ) {
    return this.customFieldsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.CUSTOM_FIELDS_DELETE)
  @ApiOperation({ summary: 'Deactivate a custom field definition' })
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.customFieldsService.remove(id);
  }
}
