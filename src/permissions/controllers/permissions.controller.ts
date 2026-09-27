import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator';
import { PermissionsService } from '../services/permissions.service';

@ApiTags('Permissions')
@ApiBearerAuth()
@SkipTenant()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions(PermissionCode.PERMISSIONS_READ)
  @ApiOperation({ summary: 'List platform permission catalog' })
  findAll() {
    return this.permissionsService.findAll();
  }
}
