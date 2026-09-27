import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { NextNumberDto } from '../dto/next-number.dto';
import { NumberingService } from '../services/numbering.service';

@ApiTags('Numbering')
@ApiBearerAuth()
@Controller('numbering')
export class NumberingController {
  constructor(private readonly numberingService: NumberingService) {}

  @Get()
  @RequirePermissions(PermissionCode.NUMBERING_READ)
  @ApiOperation({ summary: 'List tenant numbering sequences' })
  list() {
    return this.numberingService.list();
  }

  @Post('next')
  @RequirePermissions(PermissionCode.NUMBERING_CREATE)
  @ApiOperation({
    summary:
      'Allocate the next document number atomically for the current tenant',
  })
  next(@Body() dto: NextNumberDto) {
    return this.numberingService.next(dto.documentType);
  }
}
