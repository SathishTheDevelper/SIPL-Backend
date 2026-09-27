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
import { PermissionCode } from '../../common/constants/permissions';
import { SystemRole } from '../../common/constants/system-roles';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import {
  UpdateTenantDto,
  UpdateTenantSettingsDto,
  UpdateTenantStatusDto,
} from '../dto/update-tenant.dto';
import { TenantsService } from '../services/tenants.service';

@ApiTags('Tenants')
@ApiBearerAuth()
@SkipTenant()
@Roles(SystemRole.SUPER_ADMIN)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @RequirePermissions(PermissionCode.TENANTS_CREATE)
  @ApiOperation({ summary: 'Create a tenant (platform super admin)' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  @RequirePermissions(PermissionCode.TENANTS_READ)
  @ApiOperation({ summary: 'List tenants' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.tenantsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.TENANTS_READ)
  @ApiOperation({ summary: 'Get tenant by id' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.tenantsService.findByIdOrThrow(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.TENANTS_UPDATE)
  @ApiOperation({ summary: 'Update tenant profile' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(PermissionCode.TENANTS_UPDATE)
  @ApiOperation({ summary: 'Update tenant status' })
  updateStatus(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.tenantsService.updateStatus(id, dto.status);
  }

  @Patch(':id/settings')
  @RequirePermissions(PermissionCode.TENANTS_UPDATE)
  @ApiOperation({
    summary:
      'Update configurable tenant settings (geofence, SLA, numbering, limits)',
  })
  updateSettings(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    return this.tenantsService.updateSettings(id, dto);
  }
}
