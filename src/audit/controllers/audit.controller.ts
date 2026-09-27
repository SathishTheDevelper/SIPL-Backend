import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCodes } from '../../common/constants/error-codes';
import { PermissionCode } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { ListAuditLogsDto } from '../dto/list-audit-logs.dto';
import { AuditService } from '../services/audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions(PermissionCode.AUDIT_READ)
  @ApiOperation({ summary: 'List immutable tenant audit logs' })
  findAll(@Query() query: ListAuditLogsDto) {
    return this.auditService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.AUDIT_READ)
  @ApiOperation({ summary: 'Get an audit log. Cross-tenant ids return 404.' })
  async findOne(@Param('id', ParseObjectIdPipe) id: string) {
    const log = await this.auditService.findById(id);
    if (!log) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return log;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rejected — audit logs cannot be modified' })
  rejectUpdate(@Body() _body: Record<string, never>) {
    throw new AppException(
      HttpStatus.FORBIDDEN,
      'Audit logs are immutable',
      ErrorCodes.AUDIT_IMMUTABLE,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Rejected — audit logs cannot be deleted' })
  rejectDelete() {
    throw new AppException(
      HttpStatus.FORBIDDEN,
      'Audit logs are immutable',
      ErrorCodes.AUDIT_IMMUTABLE,
    );
  }
}
