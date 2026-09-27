import { HttpStatus, Inject, Injectable, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilterQuery, Types } from 'mongoose';
import { ErrorCodes } from '../../common/constants/error-codes';
import { TenantContext } from '../../common/context/tenant.context';
import { AppException } from '../../common/exceptions/app.exception';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { normalizeEmail } from '../../common/utils/object-id.util';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { hashPassword } from '../../common/utils/password.util';
import { RolesService } from '../../roles/services/roles.service';
import { TenantsService } from '../../tenants/services/tenants.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserStatus } from '../enums/user-status.enum';
import { UsersRepository } from '../repositories/users.repository';
import { User } from '../schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    @Inject(forwardRef(() => RolesService))
    private readonly rolesService: RolesService,
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const tenantId = TenantContext.requireTenantId();
    const tenant = await this.tenantsService.findByIdOrThrow(tenantId);
    const currentCount = await this.usersRepository.countByTenant(
      new Types.ObjectId(tenantId),
    );
    if (currentCount >= tenant.subscription.maxUsers) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Tenant user subscription limit reached',
        ErrorCodes.USER_LIMIT_REACHED,
      );
    }

    const email = normalizeEmail(dto.email);
    const existing = await this.usersRepository.findAuthByEmailAndTenant(
      email,
      new Types.ObjectId(tenantId),
    );
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Email already exists for this tenant',
        ErrorCodes.DUPLICATE_EMAIL,
      );
    }

    const role = await this.rolesService.findAssignableRole(dto.roleId);
    const rounds = this.configService.get<number>('bcryptRounds', 12);
    return this.usersRepository.create({
      email,
      passwordHash: await hashPassword(dto.password, rounds),
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      roleId: new Types.ObjectId(role.id),
      role: role.code,
      permissions: role.permissions,
      managerUserId: dto.managerUserId
        ? new Types.ObjectId(dto.managerUserId)
        : undefined,
      status: dto.status ?? UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      passwordChangedAt: new Date(),
    });
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, limit } = skipTake(query.page, query.limit);
    const filter: FilterQuery<User> = {};
    if (query.q) {
      filter.$or = [
        { email: { $regex: query.q, $options: 'i' } },
        { firstName: { $regex: query.q, $options: 'i' } },
        { lastName: { $regex: query.q, $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.usersRepository.search(filter, skip, limit),
      this.usersRepository.countSearch(filter),
    ]);
    return paginated(items, total, query.page, query.limit);
  }

  async findById(id: string): Promise<User> {
    return this.usersRepository.findByIdOrThrow(id);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.usersRepository.findByIdOrThrow(id);
    const update: Partial<User> = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      status: dto.status,
      managerUserId: dto.managerUserId
        ? new Types.ObjectId(dto.managerUserId)
        : undefined,
    };
    if (dto.roleId) {
      const role = await this.rolesService.findAssignableRole(dto.roleId);
      update.roleId = new Types.ObjectId(role.id);
      update.role = role.code;
      update.permissions = role.permissions;
    }
    return this.usersRepository.updateById(id, { $set: update });
  }

  async remove(id: string): Promise<User> {
    return this.usersRepository.updateById(id, {
      $set: { status: UserStatus.INACTIVE, deletedAt: new Date() },
    });
  }

  async findAuthByEmailAndTenant(
    email: string,
    tenantId: Types.ObjectId | null,
  ) {
    return this.usersRepository.findAuthByEmailAndTenant(
      normalizeEmail(email),
      tenantId,
    );
  }

  async findAuthById(id: string) {
    return this.usersRepository.findAuthById(id);
  }

  async recordSuccessfulLogin(id: string): Promise<void> {
    await this.usersRepository.updateRaw(id, {
      $set: {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: UserStatus.ACTIVE,
      },
    });
  }

  async recordFailedLogin(user: User & { _id: Types.ObjectId }): Promise<void> {
    const maxFailed = this.configService.get<number>('auth.maxFailedLogins', 5);
    const lockoutMinutes = this.configService.get<number>(
      'auth.lockoutMinutes',
      15,
    );
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const update: Record<string, unknown> = { failedLoginAttempts: attempts };
    if (attempts >= maxFailed) {
      update.status = UserStatus.LOCKED;
      update.lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
    }
    await this.usersRepository.updateRaw(user._id.toString(), { $set: update });
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.usersRepository.updateRaw(id, {
      $set: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: UserStatus.ACTIVE,
      },
    });
  }
}
