import { config as loadEnv } from 'dotenv';
import mongoose, { Types } from 'mongoose';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PermissionCode,
} from '../../common/constants/permissions';
import {
  SystemRole,
  TENANT_ROLE_CODES,
} from '../../common/constants/system-roles';
import { hashPassword } from '../../common/utils/password.util';
import {
  Permission,
  PermissionSchema,
} from '../../permissions/schemas/permission.schema';
import { Role, RoleSchema } from '../../roles/schemas/role.schema';
import { TenantStatus } from '../../tenants/enums/tenant-status.enum';
import { Tenant, TenantSchema } from '../../tenants/schemas/tenant.schema';
import {
  defaultSubscription,
  defaultTenantSettings,
} from '../../tenants/tenant-defaults';
import { UserStatus } from '../../users/enums/user-status.enum';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { CustomFieldType } from '../../custom-fields/enums/field-type.enum';
import {
  CustomFieldDefinition,
  CustomFieldDefinitionSchema,
} from '../../custom-fields/schemas/custom-field-definition.schema';
import {
  BusinessCalendar,
  BusinessCalendarSchema,
} from '../../sla/schemas/business-calendar.schema';
import {
  SlaConfiguration,
  SlaConfigurationSchema,
} from '../../sla/schemas/sla-configuration.schema';
import { Holiday, HolidaySchema } from '../../sla/schemas/holiday.schema';
import {
  WorkflowDefinition,
  WorkflowDefinitionSchema,
} from '../../workflow/schemas/workflow-definition.schema';
import {
  ApproverType,
  WorkflowStatus,
  WorkflowStepType,
} from '../../workflow/enums/workflow.enums';
import { WorkflowModule } from '../../common/constants/modules';
import {
  NotificationTemplate,
  NotificationTemplateSchema,
} from '../../notifications/schemas/notification-template.schema';
import { NotificationChannel } from '../../notifications/enums/notification.enums';
import { AuditLog, AuditLogSchema } from '../../audit/schemas/audit-log.schema';
import {
  NumberingSequence,
  NumberingSequenceSchema,
} from '../../numbering/schemas/numbering-sequence.schema';
import {
  Notification,
  NotificationSchema,
} from '../../notifications/schemas/notification.schema';
import {
  SlaInstance,
  SlaInstanceSchema,
} from '../../sla/schemas/sla-instance.schema';
import {
  WorkflowInstance,
  WorkflowInstanceSchema,
} from '../../workflow/schemas/workflow-instance.schema';

function modelOf<T>(name: string, schema: mongoose.Schema) {
  return (
    (mongoose.models[name] as mongoose.Model<T>) ||
    mongoose.model<T>(name, schema)
  );
}

if (!process.env.MONGODB_URI) {
  loadEnv();
}

export const DEMO_PASSWORD = 'TenantAdmin@12345';
export const EMPLOYEE_PASSWORD = 'Employee@12345';

export async function runSeed(
  options: { disconnect?: boolean; includeInvoiceSamples?: boolean } = {},
) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(uri);
  const PermissionModel = modelOf<Permission>(
    Permission.name,
    PermissionSchema,
  );
  const RoleModel = modelOf<Role>(Role.name, RoleSchema);
  const TenantModel = modelOf<Tenant>(Tenant.name, TenantSchema);
  const UserModel = modelOf<User>(User.name, UserSchema);
  const CustomFieldModel = modelOf<CustomFieldDefinition>(
    CustomFieldDefinition.name,
    CustomFieldDefinitionSchema,
  );
  const CalendarModel = modelOf<BusinessCalendar>(
    BusinessCalendar.name,
    BusinessCalendarSchema,
  );
  const HolidayModel = modelOf<Holiday>(Holiday.name, HolidaySchema);
  const SlaConfigModel = modelOf<SlaConfiguration>(
    SlaConfiguration.name,
    SlaConfigurationSchema,
  );
  const WorkflowModel = modelOf<WorkflowDefinition>(
    WorkflowDefinition.name,
    WorkflowDefinitionSchema,
  );
  const TemplateModel = modelOf<NotificationTemplate>(
    NotificationTemplate.name,
    NotificationTemplateSchema,
  );
  const AuditModel = modelOf<AuditLog>(AuditLog.name, AuditLogSchema);
  const NumberingModel = modelOf<NumberingSequence>(
    NumberingSequence.name,
    NumberingSequenceSchema,
  );
  const NotificationModel = modelOf<Notification>(
    Notification.name,
    NotificationSchema,
  );
  const SlaInstanceModel = modelOf<SlaInstance>(
    SlaInstance.name,
    SlaInstanceSchema,
  );
  const WorkflowInstanceModel = modelOf<WorkflowInstance>(
    WorkflowInstance.name,
    WorkflowInstanceSchema,
  );

  await Promise.all([
    PermissionModel.deleteMany({}),
    RoleModel.deleteMany({}),
    TenantModel.deleteMany({}),
    UserModel.deleteMany({}),
    CustomFieldModel.deleteMany({}),
    CalendarModel.deleteMany({}),
    HolidayModel.deleteMany({}),
    SlaConfigModel.deleteMany({}),
    WorkflowModel.deleteMany({}),
    TemplateModel.deleteMany({}),
    NumberingModel.deleteMany({}),
    NotificationModel.deleteMany({}),
    SlaInstanceModel.deleteMany({}),
    WorkflowInstanceModel.deleteMany({}),
  ]);
  await AuditModel.collection.deleteMany({});

  await PermissionModel.insertMany(
    ALL_PERMISSIONS.map((code) => ({
      code,
      name: code,
      module: code.split('.')[0],
      description: `Permission ${code}`,
    })),
  );

  const superAdminRole = await RoleModel.create({
    tenantId: null,
    code: SystemRole.SUPER_ADMIN,
    name: 'Platform Super Admin',
    description: 'Platform operator. Not a tenant user.',
    permissions: ALL_PERMISSIONS,
    isSystem: true,
    isActive: true,
  });

  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
  const superAdminEmail = (
    process.env.SUPER_ADMIN_EMAIL ?? 'admin@sipl.local'
  ).toLowerCase();
  const superAdminPassword =
    process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@12345';

  await UserModel.create({
    tenantId: null,
    email: superAdminEmail,
    passwordHash: await hashPassword(superAdminPassword, rounds),
    firstName: 'Platform',
    lastName: 'Admin',
    roleId: superAdminRole._id,
    role: SystemRole.SUPER_ADMIN,
    permissions: ALL_PERMISSIONS,
    status: UserStatus.ACTIVE,
    failedLoginAttempts: 0,
    passwordChangedAt: new Date(),
  });

  const tenantA = await createTenant(TenantModel, {
    name: 'Tenant A',
    code: 'TENANTA',
    legalName: 'Tenant A Constructions Pvt Ltd',
    email: 'ops@tenant-a.local',
    phone: '+910000000001',
    city: 'Chennai',
  });
  const tenantB = await createTenant(TenantModel, {
    name: 'Tenant B',
    code: 'TENANTB',
    legalName: 'Tenant B Interiors Pvt Ltd',
    email: 'ops@tenant-b.local',
    phone: '+910000000002',
    city: 'Bengaluru',
  });

  await seedTenantUsers(RoleModel, UserModel, tenantA._id, 'a', rounds);
  await seedTenantUsers(RoleModel, UserModel, tenantB._id, 'b', rounds);
  await seedTenantPlatform(
    tenantA._id,
    'A',
    CustomFieldModel,
    CalendarModel,
    HolidayModel,
    SlaConfigModel,
    WorkflowModel,
    TemplateModel,
  );
  await seedTenantPlatform(
    tenantB._id,
    'B',
    CustomFieldModel,
    CalendarModel,
    HolidayModel,
    SlaConfigModel,
    WorkflowModel,
    TemplateModel,
  );

  console.log('Seed completed');
  console.log(`Super admin: ${superAdminEmail}`);
  console.log('Tenant A admin: admin.a@tenant-a.local / TenantAdmin@12345');
  console.log(
    'Tenant A accounts: accounts.a@tenant-a.local / TenantAdmin@12345',
  );
  console.log('Tenant B admin: admin.b@tenant-b.local / TenantAdmin@12345');
  if (options.includeInvoiceSamples) {
    const admin = await UserModel.findOne({ email: 'admin.a@tenant-a.local' });
    const accounts = await UserModel.findOne({
      email: 'accounts.a@tenant-a.local',
    });
    if (admin?.tenantId && accounts) {
      const { seedInvoiceSamples } = await import('./invoice-samples');
      await seedInvoiceSamples({
        tenantId: admin.tenantId,
        userId: admin._id,
        accountsUserId: accounts._id,
      });
      console.log('Invoice samples: MATCH, MISMATCH, and HOLD for tenant A');
    }
  }
  if (options.disconnect !== false && process.argv[1]?.includes('seed')) {
    await mongoose.disconnect();
  }
}

async function createTenant(
  TenantModel: mongoose.Model<Tenant>,
  input: {
    name: string;
    code: string;
    legalName: string;
    email: string;
    phone: string;
    city: string;
  },
) {
  return TenantModel.create({
    name: input.name,
    code: input.code,
    legalName: input.legalName,
    gstNumber: input.code === 'TENANTA' ? '33AAAAA0000A1Z5' : '29BBBBB0000B1Z5',
    panNumber: input.code === 'TENANTA' ? 'AAAAA0000A' : 'BBBBB0000B',
    address: {
      line1: '1 Demo Street',
      city: input.city,
      state: input.city === 'Chennai' ? 'Tamil Nadu' : 'Karnataka',
      country: 'India',
      postalCode: '600001',
    },
    phone: input.phone,
    email: input.email,
    status: TenantStatus.ACTIVE,
    settings: defaultTenantSettings(),
    subscription: defaultSubscription(),
  });
}

async function seedTenantUsers(
  RoleModel: mongoose.Model<Role>,
  UserModel: mongoose.Model<User>,
  tenantId: Types.ObjectId,
  suffix: string,
  rounds: number,
) {
  const roleDocs = await RoleModel.insertMany(
    TENANT_ROLE_CODES.map((code) => ({
      tenantId,
      code,
      name: code.replace(/_/g, ' '),
      description: `Configurable ${code} role`,
      permissions:
        code === SystemRole.TENANT_ADMIN
          ? DEFAULT_ROLE_PERMISSIONS.TENANT_ADMIN
          : (DEFAULT_ROLE_PERMISSIONS[code] ?? [PermissionCode.USERS_READ]),
      isSystem: true,
      isActive: true,
    })),
  );

  const byCode = new Map(roleDocs.map((role) => [role.code, role]));
  const adminRole = byCode.get(SystemRole.TENANT_ADMIN)!;
  const employeeRole = byCode.get(SystemRole.EMPLOYEE)!;
  const mdRole = byCode.get(SystemRole.MD)!;
  const directorRole = byCode.get(SystemRole.DIRECTOR)!;
  const projectHeadRole = byCode.get(SystemRole.PROJECT_HEAD)!;
  const hrRole = byCode.get(SystemRole.HR)!;
  const siteEngineerRole = byCode.get(SystemRole.SITE_ENGINEER)!;
  const accountsRole = byCode.get(SystemRole.ACCOUNTS)!;

  await UserModel.create([
    {
      tenantId,
      email: `admin.${suffix}@tenant-${suffix}.local`,
      passwordHash: await hashPassword(DEMO_PASSWORD, rounds),
      firstName: 'Tenant',
      lastName: `Admin ${suffix.toUpperCase()}`,
      roleId: adminRole._id,
      role: adminRole.code,
      permissions: adminRole.permissions,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      passwordChangedAt: new Date(),
    },
    {
      tenantId,
      email: `md.${suffix}@tenant-${suffix}.local`,
      passwordHash: await hashPassword(DEMO_PASSWORD, rounds),
      firstName: 'Managing',
      lastName: `Director ${suffix.toUpperCase()}`,
      roleId: mdRole._id,
      role: mdRole.code,
      permissions: mdRole.permissions,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      passwordChangedAt: new Date(),
    },
    {
      tenantId,
      email: `projecthead.${suffix}@tenant-${suffix}.local`,
      passwordHash: await hashPassword(DEMO_PASSWORD, rounds),
      firstName: 'Project',
      lastName: `Head ${suffix.toUpperCase()}`,
      roleId: projectHeadRole._id,
      role: projectHeadRole.code,
      permissions: projectHeadRole.permissions,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      passwordChangedAt: new Date(),
    },
    {
      tenantId,
      email: `director.${suffix}@tenant-${suffix}.local`,
      passwordHash: await hashPassword(DEMO_PASSWORD, rounds),
      firstName: 'Director',
      lastName: suffix.toUpperCase(),
      roleId: directorRole._id,
      role: directorRole.code,
      permissions: directorRole.permissions,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      passwordChangedAt: new Date(),
    },
    {
      tenantId,
      email: `hr.${suffix}@tenant-${suffix}.local`,
      passwordHash: await hashPassword(DEMO_PASSWORD, rounds),
      firstName: 'HR',
      lastName: suffix.toUpperCase(),
      roleId: hrRole._id,
      role: hrRole.code,
      permissions: hrRole.permissions,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      passwordChangedAt: new Date(),
    },
    {
      tenantId,
      email: `siteengineer.${suffix}@tenant-${suffix}.local`,
      passwordHash: await hashPassword(DEMO_PASSWORD, rounds),
      firstName: 'Site',
      lastName: `Engineer ${suffix.toUpperCase()}`,
      roleId: siteEngineerRole._id,
      role: siteEngineerRole.code,
      permissions: siteEngineerRole.permissions,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      passwordChangedAt: new Date(),
    },
    {
      tenantId,
      email: `accounts.${suffix}@tenant-${suffix}.local`,
      passwordHash: await hashPassword(DEMO_PASSWORD, rounds),
      firstName: 'Accounts',
      lastName: suffix.toUpperCase(),
      roleId: accountsRole._id,
      role: accountsRole.code,
      permissions: accountsRole.permissions,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      passwordChangedAt: new Date(),
    },
    {
      tenantId,
      email: `employee.${suffix}@tenant-${suffix}.local`,
      passwordHash: await hashPassword(EMPLOYEE_PASSWORD, rounds),
      firstName: 'Site',
      lastName: `Employee ${suffix.toUpperCase()}`,
      roleId: employeeRole._id,
      role: employeeRole.code,
      permissions: employeeRole.permissions,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      passwordChangedAt: new Date(),
    },
  ]);
}

async function seedTenantPlatform(
  tenantId: Types.ObjectId,
  label: string,
  CustomFieldModel: mongoose.Model<CustomFieldDefinition>,
  CalendarModel: mongoose.Model<BusinessCalendar>,
  HolidayModel: mongoose.Model<Holiday>,
  SlaConfigModel: mongoose.Model<SlaConfiguration>,
  WorkflowModel: mongoose.Model<WorkflowDefinition>,
  TemplateModel: mongoose.Model<NotificationTemplate>,
) {
  const settings = defaultTenantSettings();
  await CustomFieldModel.create([
    {
      tenantId,
      module: 'LEAD',
      key: 'industry',
      label: 'Industry',
      fieldType: CustomFieldType.TEXT,
      required: false,
      options: [],
      displayOrder: 1,
      isActive: true,
    },
    {
      tenantId,
      module: 'PROJECT',
      key: label === 'A' ? 'site_soil_type' : 'interior_style',
      label: label === 'A' ? 'Soil type' : 'Interior style',
      fieldType: label === 'A' ? CustomFieldType.SELECT : CustomFieldType.TEXT,
      required: false,
      options: label === 'A' ? ['clay', 'sand', 'rock'] : [],
      displayOrder: 1,
      isActive: true,
    },
    {
      tenantId,
      module: 'INVOICE',
      key: 'costCenter',
      label: 'Cost center',
      fieldType: CustomFieldType.TEXT,
      required: false,
      options: [],
      displayOrder: 1,
      isActive: true,
    },
  ]);

  const calendar = await CalendarModel.create({
    tenantId,
    name: 'Default',
    timezone: settings.timezone,
    workingDays: settings.workingDays,
    workingStartTime: settings.workingStartTime,
    workingEndTime: settings.workingEndTime,
    isDefault: true,
  });

  await HolidayModel.create({
    tenantId,
    calendarId: calendar._id,
    date: '2026-01-26',
    name: 'Republic Day',
  });

  await SlaConfigModel.insertMany(
    Object.entries(settings.slaHoursByModule).map(([module, hours]) => ({
      tenantId,
      module,
      hours,
      calendarId: calendar._id,
      escalateToRole: SystemRole.PROJECT_HEAD,
    })),
  );

  await WorkflowModel.create([
    {
      tenantId,
      module: WorkflowModule.MATERIAL_APPROVAL,
      name: 'Material request approval',
      version: 1,
      status: WorkflowStatus.ACTIVE,
      steps: [
        {
          sequence: 1,
          stepType: WorkflowStepType.APPROVAL,
          approverType: ApproverType.PROJECT_HEAD,
          slaHours: settings.slaHoursByModule.MATERIAL_APPROVAL,
          actions: ['APPROVE', 'REJECT', 'SEND_BACK', 'ESCALATE'],
        },
      ],
    },
    {
      tenantId,
      module: WorkflowModule.BOQ_APPROVAL,
      name: 'BOQ approval',
      version: 1,
      status: WorkflowStatus.ACTIVE,
      steps: [
        {
          sequence: 1,
          stepType: WorkflowStepType.APPROVAL,
          approverType: ApproverType.PROJECT_HEAD,
          slaHours: settings.slaHoursByModule.BOQ_APPROVAL,
          actions: ['APPROVE', 'REJECT', 'SEND_BACK', 'ESCALATE'],
        },
      ],
    },
    {
      tenantId,
      module: WorkflowModule.SITE_ACCESS,
      name: 'Additional site access',
      version: 1,
      status: WorkflowStatus.ACTIVE,
      steps: [
        {
          sequence: 1,
          stepType: WorkflowStepType.APPROVAL,
          approverType: ApproverType.ROLE,
          approverRole: SystemRole.HR,
          slaHours: settings.slaHoursByModule.SITE_ACCESS,
          actions: ['APPROVE', 'REJECT', 'SEND_BACK'],
        },
      ],
    },
    {
      tenantId,
      module: WorkflowModule.TENDER_APPROVAL,
      name: 'Tender approval',
      version: 1,
      status: WorkflowStatus.ACTIVE,
      steps: [
        {
          sequence: 1,
          stepType: WorkflowStepType.APPROVAL,
          approverType: ApproverType.PROJECT_HEAD,
          slaHours: settings.slaHoursByModule.TENDER_APPROVAL,
          actions: ['APPROVE', 'REJECT', 'SEND_BACK', 'ESCALATE'],
        },
      ],
    },
    {
      tenantId,
      module: WorkflowModule.PO_APPROVAL,
      name: 'Purchase order approval',
      version: 1,
      status: WorkflowStatus.ACTIVE,
      steps: [
        {
          sequence: 1,
          stepType: WorkflowStepType.APPROVAL,
          approverType: ApproverType.PROJECT_HEAD,
          actions: ['APPROVE', 'REJECT', 'SEND_BACK', 'ESCALATE'],
        },
      ],
    },
    {
      tenantId,
      module: WorkflowModule.GRN_APPROVAL,
      name: 'GRN approval',
      version: 1,
      status: WorkflowStatus.ACTIVE,
      steps: [
        {
          sequence: 1,
          stepType: WorkflowStepType.APPROVAL,
          approverType: ApproverType.PROJECT_HEAD,
          actions: ['APPROVE', 'REJECT', 'SEND_BACK', 'ESCALATE'],
        },
      ],
    },
    {
      tenantId,
      module: WorkflowModule.INVOICE_APPROVAL,
      name: 'Invoice accounts approval',
      version: 1,
      status: WorkflowStatus.ACTIVE,
      steps: [
        {
          sequence: 1,
          stepType: WorkflowStepType.APPROVAL,
          approverType: ApproverType.ROLE,
          approverRole: SystemRole.ACCOUNTS,
          slaHours: settings.slaHoursByModule.INVOICE_APPROVAL,
          actions: ['APPROVE', 'REJECT', 'SEND_BACK'],
        },
      ],
    },
  ]);

  await TemplateModel.create({
    tenantId,
    code: 'APPROVAL_PENDING',
    channel: NotificationChannel.EMAIL,
    subject: 'Approval pending',
    body: 'A record is waiting for your approval.',
  });
}

if (process.argv[1]?.includes('seed')) {
  void runSeed({ disconnect: true, includeInvoiceSamples: true }).catch(
    (error: Error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}
