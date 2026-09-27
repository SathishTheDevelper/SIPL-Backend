import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../../common/constants/permissions';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-object-id.pipe';
import { UpdateRequirementDto } from '../dto/requirement.dto';
import { RequirementsService } from '../services/requirements.service';

@ApiTags('Requirements')
@ApiBearerAuth()
@Controller('requirements')
export class RequirementsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Get(':id')
  @RequirePermissions(PermissionCode.REQUIREMENTS_READ)
  @ApiOperation({ summary: 'Get a requirement. Cross-tenant ids return 404.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.requirementsService.findById(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.REQUIREMENTS_UPDATE)
  @ApiOperation({ summary: 'Update a draft requirement' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateRequirementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requirementsService.update(id, dto, user);
  }

  @Post(':id/submit')
  @RequirePermissions(PermissionCode.REQUIREMENTS_UPDATE)
  @ApiOperation({ summary: 'Submit a requirement' })
  submit(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requirementsService.submit(id, user);
  }
}
