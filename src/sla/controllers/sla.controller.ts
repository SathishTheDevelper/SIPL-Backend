import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CreateCalendarDto,
  CreateHolidayDto,
  UpsertSlaConfigurationDto,
} from '../dto/sla.dto';
import { SlaInstanceStatus } from '../enums/sla-status.enum';
import { SlaService } from '../services/sla.service';

@ApiTags('SLA')
@ApiBearerAuth()
@Controller('sla')
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  @Post('calendars')
  @RequirePermissions(PermissionCode.SLA_UPDATE)
  @ApiOperation({ summary: 'Create a tenant business calendar' })
  createCalendar(@Body() dto: CreateCalendarDto) {
    return this.slaService.createCalendar(dto);
  }

  @Get('calendars')
  @RequirePermissions(PermissionCode.SLA_READ)
  @ApiOperation({ summary: 'List tenant business calendars' })
  listCalendars() {
    return this.slaService.listCalendars();
  }

  @Post('holidays')
  @RequirePermissions(PermissionCode.SLA_UPDATE)
  @ApiOperation({ summary: 'Add a holiday to a business calendar' })
  addHoliday(@Body() dto: CreateHolidayDto) {
    return this.slaService.addHoliday(dto);
  }

  @Post('configurations')
  @RequirePermissions(PermissionCode.SLA_UPDATE)
  @ApiOperation({ summary: 'Create or update SLA hours for a module' })
  upsertConfiguration(@Body() dto: UpsertSlaConfigurationDto) {
    return this.slaService.upsertConfiguration(dto);
  }

  @Get('configurations')
  @RequirePermissions(PermissionCode.SLA_READ)
  @ApiOperation({ summary: 'List SLA configurations' })
  listConfigurations() {
    return this.slaService.listConfigurations();
  }

  @Get('instances')
  @RequirePermissions(PermissionCode.SLA_READ)
  @ApiOperation({ summary: 'List SLA instances' })
  listInstances(@Query('status') status?: SlaInstanceStatus) {
    return this.slaService.listInstances(status);
  }
}
