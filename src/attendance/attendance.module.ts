import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { EmployeesModule } from '../employees/employees.module';
import { SitesModule } from '../sites/sites.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AttendanceController } from './controllers/attendance.controller';
import {
  AttendancePunch,
  AttendancePunchSchema,
} from './schemas/attendance-punch.schema';
import { Attendance, AttendanceSchema } from './schemas/attendance.schema';
import { AttendanceService } from './services/attendance.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Attendance.name, schema: AttendanceSchema },
      { name: AttendancePunch.name, schema: AttendancePunchSchema },
    ]),
    EmployeesModule,
    SitesModule,
    TenantsModule,
    AuditModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
