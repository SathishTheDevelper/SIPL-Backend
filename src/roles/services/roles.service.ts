import { HttpStatus, Inject, Injectable, forwardRef } from '@nestjs/common';
import { FilterQuery, Types } from 'mongoose';
import { ErrorCodes } from '../../common/constants/error-codes';
import { SystemRole } from '../../common/constants/system-roles';
import { AppException } from '../../common/exceptions/app.exception';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { PermissionsService } from '../../permissions/services/permissions.service';
import { UsersRepository } from '../../users/repositories/users.repository';
import { CreateRoleDto, UpdateRoleDto } from '../dto/create-role.dto';
import { RolesRepository } from '../repositories/roles.repository';
import { Role } from '../schemas/role.schema';

export interface AssignableRole {
  id: string;
  code: string;
  permissions: string[];
}

@Injectable()
export class RolesService {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly permissionsService: PermissionsService,
    @Inject(forwardRef(() => UsersRepository))
    private readonly usersRepository: UsersRepository,
  ) {}

  async create(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.rolesRepository.findByCode(dto.code);
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Role code already exists for this tenant',
        ErrorCodes.DUPLICATE_CODE,
      );
    }
    await this.assertPermissionsExist(dto.permissions);
    return this.rolesRepository.create({
      code: dto.code.toUpperCase(),
      name: dto.name,
      description: dto.description,
      permissions: dto.permissions,
      isSystem: false,
      isActive: dto.isActive ?? true,
    });
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, limit } = skipTake(query.page, query.limit);
    const filter: FilterQuery<Role> = {};
    if (query.q) {
      filter.$or = [
        { name: { $regex: query.q, $options: 'i' } },
        { code: { $regex: query.q, $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.rolesRepository.search(filter, skip, limit),
      this.rolesRepository.count(filter),
    ]);
    return paginated(items, total, query.page, query.limit);
  }

  async findById(id: string): Promise<Role> {
    return this.rolesRepository.findByIdOrThrow(id);
  }

  async findAssignableRole(roleId: string): Promise<AssignableRole> {
    const role = await this.rolesRepository.findByIdOrThrow(roleId);
    if (!role.isActive) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Role is inactive',
        ErrorCodes.INVALID_ROLE,
      );
    }
    if (role.code === SystemRole.SUPER_ADMIN) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'SUPER_ADMIN cannot be assigned inside a tenant',
        ErrorCodes.INVALID_ROLE,
      );
    }
    return {
      id: (role as Role & { _id: Types.ObjectId })._id.toString(),
      code: role.code,
      permissions: role.permissions,
    };
  }

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    await this.rolesRepository.findByIdOrThrow(id);
    if (dto.permissions) {
      await this.assertPermissionsExist(dto.permissions);
    }
    const updated = await this.rolesRepository.updateById(id, {
      $set: dto,
    });
    if (dto.permissions || dto.name) {
      await this.usersRepository.updateMany(
        { roleId: new Types.ObjectId(id) },
        {
          $set: {
            role: updated.code,
            permissions: updated.permissions,
          },
        },
      );
    }
    return updated;
  }

  async remove(id: string): Promise<Role> {
    const role = await this.rolesRepository.findByIdOrThrow(id);
    if (role.isSystem) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'System roles cannot be deleted',
        ErrorCodes.SYSTEM_ROLE_PROTECTED,
      );
    }
    const inUse = await this.usersRepository.countByRole(id);
    if (inUse > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Role is assigned to users',
        ErrorCodes.ROLE_IN_USE,
      );
    }
    return this.rolesRepository.updateById(id, { $set: { isActive: false } });
  }

  private async assertPermissionsExist(codes: string[]): Promise<void> {
    const found = await this.permissionsService.findByCodes(codes);
    if (found.length !== codes.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'One or more permissions are invalid',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
  }
}
