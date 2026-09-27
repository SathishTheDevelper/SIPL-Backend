import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode } from '../../../common/constants/permissions';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-object-id.pipe';
import { ClientDecisionsService } from '../services/client-decisions.service';

@ApiTags('Client Decisions')
@ApiBearerAuth()
@Controller('client-decisions')
export class ClientDecisionsController {
  constructor(
    private readonly clientDecisionsService: ClientDecisionsService,
  ) {}

  @Get(':id')
  @RequirePermissions(PermissionCode.CLIENT_DECISIONS_READ)
  @ApiOperation({
    summary: 'Get a client decision. Cross-tenant ids return 404.',
  })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.clientDecisionsService.findById(id);
  }
}
