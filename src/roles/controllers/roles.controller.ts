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
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateRoleDto, UpdateRoleDto } from '../dto/create-role.dto';
import { RolesService } from '../services/roles.service';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @RequirePermissions(PermissionCode.ROLES_CREATE)
  @ApiOperation({ summary: 'Create a configurable tenant role' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Get()
  @RequirePermissions(PermissionCode.ROLES_READ)
  @ApiOperation({ summary: 'List tenant roles' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.rolesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.ROLES_READ)
  @ApiOperation({ summary: 'Get a tenant role. Cross-tenant ids return 404.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.rolesService.findById(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.ROLES_UPDATE)
  @ApiOperation({ summary: 'Update a tenant role and its permissions' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.ROLES_DELETE)
  @ApiOperation({ summary: 'Deactivate a non-system tenant role' })
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.rolesService.remove(id);
  }
}
