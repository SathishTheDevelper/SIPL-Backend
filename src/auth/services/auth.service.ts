import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { ErrorCodes } from '../../common/constants/error-codes';
import { SystemRole } from '../../common/constants/system-roles';
import { AppException } from '../../common/exceptions/app.exception';
import { hashPassword, verifyPassword } from '../../common/utils/password.util';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { MailService } from '../../mail/mail.service';
import { TenantsService } from '../../tenants/services/tenants.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { User } from '../../users/schemas/user.schema';
import { UsersService } from '../../users/services/users.service';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { LoginDto } from '../dto/login.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { TokenPair, TokenService } from './token.service';

type UserWithId = User & { _id: Types.ObjectId };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async login(
    dto: LoginDto,
  ): Promise<TokenPair & { user: Record<string, unknown> }> {
    const tenantId = await this.resolveTenantId(dto.tenantCode);
    const user = await this.usersService.findAuthByEmailAndTenant(
      dto.email,
      tenantId,
    );

    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Invalid email or password',
        ErrorCodes.INVALID_CREDENTIALS,
      );
    }

    this.assertNotLocked(user);

    const passwordOk = await verifyPassword(dto.password, user.passwordHash);
    if (!passwordOk) {
      await this.usersService.recordFailedLogin(user);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Invalid email or password',
        ErrorCodes.INVALID_CREDENTIALS,
      );
    }

    if (user.status === UserStatus.INACTIVE || user.deletedAt) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Account is inactive',
        ErrorCodes.ACCOUNT_INACTIVE,
      );
    }

    if (user.tenantId) {
      const tenant = await this.tenantsService.findActiveById(
        user.tenantId.toString(),
      );
      if (!tenant) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'Tenant is not available',
          ErrorCodes.TENANT_INACTIVE,
        );
      }
    }

    await this.usersService.recordSuccessfulLogin(user._id.toString());
    const tokens = await this.tokenService.issuePair({
      userId: user._id.toString(),
      tenantId: user.tenantId ? user.tenantId.toString() : null,
      role: user.role,
      permissions: user.permissions,
    });

    await this.auditService.record({
      action: AuditAction.LOGIN,
      module: 'AUTH',
      entityType: 'User',
      entityId: user._id.toString(),
      tenantId: user.tenantId ? user.tenantId.toString() : null,
      userId: user._id.toString(),
    });

    return { ...tokens, user: this.sanitize(user) };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokenService.rotate(refreshToken);
  }

  async logout(
    user: AuthenticatedUser,
    refreshToken?: string,
    jti?: string,
    exp?: number,
  ) {
    if (refreshToken) {
      await this.tokenService.revokeRefresh(refreshToken);
    }
    if (jti) {
      await this.tokenService.denyAccess(jti, exp);
    }
    await this.auditService.record({
      action: AuditAction.LOGOUT,
      module: 'AUTH',
      entityType: 'User',
      entityId: user.userId,
      tenantId: user.tenantId,
      userId: user.userId,
    });
    return { loggedOut: true, userId: user.userId };
  }

  async me(user: AuthenticatedUser) {
    const current = await this.usersService.findAuthById(user.userId);
    if (!current) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Authentication required',
        ErrorCodes.UNAUTHORIZED,
      );
    }
    return {
      ...this.sanitize(current),
      tenantId: user.tenantId,
      isSuperAdmin: user.isSuperAdmin,
    };
  }

  async changePassword(user: AuthenticatedUser, dto: ChangePasswordDto) {
    const current = await this.usersService.findAuthById(user.userId);
    if (!current) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Authentication required',
        ErrorCodes.UNAUTHORIZED,
      );
    }
    const matches = await verifyPassword(
      dto.currentPassword,
      current.passwordHash,
    );
    if (!matches) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Current password is incorrect',
        ErrorCodes.PASSWORD_MISMATCH,
      );
    }
    const rounds = this.configService.get<number>('bcryptRounds', 12);
    await this.usersService.updatePassword(
      user.userId,
      await hashPassword(dto.newPassword, rounds),
    );
    await this.tokenService.revokeAllForUser(user.userId);
    return { passwordChanged: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const tenantId = dto.tenantCode
      ? await this.resolveTenantId(dto.tenantCode)
      : null;
    const user = await this.usersService.findAuthByEmailAndTenant(
      dto.email,
      tenantId,
    );

    if (user && user.status !== UserStatus.INACTIVE && !user.deletedAt) {
      const token = await this.tokenService.createPasswordResetToken(
        user._id.toString(),
        user.tenantId ? user.tenantId.toString() : null,
      );
      await this.mailService.sendPasswordReset({
        to: user.email,
        token,
      });
    } else {
      this.logger.log(
        'Password reset requested for unknown or inactive account',
      );
    }

    return {
      message: 'If the account exists, a reset email has been sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const payload = await this.tokenService.consumePasswordResetToken(
      dto.token,
    );
    const rounds = this.configService.get<number>('bcryptRounds', 12);
    await this.usersService.updatePassword(
      payload.userId,
      await hashPassword(dto.newPassword, rounds),
    );
    await this.tokenService.revokeAllForUser(payload.userId);
    return { passwordReset: true };
  }

  async switchTenant(
    user: AuthenticatedUser,
    tenantId: string,
  ): Promise<TokenPair> {
    if (user.role !== SystemRole.SUPER_ADMIN) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Only platform super admins can switch tenant context',
        ErrorCodes.FORBIDDEN,
      );
    }
    const tenant = await this.tenantsService.findActiveById(tenantId);
    if (!tenant) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    await this.tokenService.revokeAllForUser(user.userId);
    return this.tokenService.issuePair({
      userId: user.userId,
      tenantId: tenantId,
      role: user.role,
      permissions: user.permissions,
    });
  }

  private async resolveTenantId(
    tenantCode?: string,
  ): Promise<Types.ObjectId | null> {
    if (!tenantCode) {
      return null;
    }
    const tenant = await this.tenantsService.findByCode(tenantCode);
    if (!tenant) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Invalid email or password',
        ErrorCodes.INVALID_CREDENTIALS,
      );
    }
    return tenant._id;
  }

  private assertNotLocked(user: User): void {
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Account is temporarily locked',
        ErrorCodes.ACCOUNT_LOCKED,
      );
    }
  }

  private sanitize(user: UserWithId): Record<string, unknown> {
    return {
      id: user._id.toString(),
      tenantId: user.tenantId ? user.tenantId.toString() : null,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      roleId: user.roleId.toString(),
      permissions: user.permissions,
      status: user.status,
    };
  }
}
