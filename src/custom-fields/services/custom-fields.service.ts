import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCodes } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
} from '../dto/create-custom-field.dto';
import { CustomFieldType } from '../enums/field-type.enum';
import { CustomFieldsRepository } from '../repositories/custom-fields.repository';
import { CustomFieldDefinition } from '../schemas/custom-field-definition.schema';

@Injectable()
export class CustomFieldsService {
  constructor(private readonly repository: CustomFieldsRepository) {}

  async create(dto: CreateCustomFieldDto): Promise<CustomFieldDefinition> {
    this.assertSelectOptions(dto.fieldType, dto.options);
    const existing = await this.repository.findByModuleAndKey(
      dto.module,
      dto.key,
    );
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Custom field key already exists for this module',
        ErrorCodes.DUPLICATE_KEY,
      );
    }
    return this.repository.create({
      ...dto,
      module: dto.module.toUpperCase(),
      required: dto.required ?? false,
      options: dto.options ?? [],
      displayOrder: dto.displayOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
  }

  async findByModule(module: string, includeInactive = false) {
    return this.repository.findByModule(module, !includeInactive);
  }

  async update(
    id: string,
    dto: UpdateCustomFieldDto,
  ): Promise<CustomFieldDefinition> {
    const current = await this.repository.findByIdOrThrow(id);
    if (dto.options) {
      this.assertSelectOptions(current.fieldType, dto.options);
    }
    return this.repository.updateById(id, { $set: dto });
  }

  async remove(id: string): Promise<CustomFieldDefinition> {
    await this.repository.findByIdOrThrow(id);
    return this.repository.updateById(id, { $set: { isActive: false } });
  }

  validateValues(
    definitions: CustomFieldDefinition[],
    values: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const incoming = values ?? {};
    const result: Record<string, unknown> = {};
    for (const definition of definitions) {
      const raw = Object.prototype.hasOwnProperty.call(incoming, definition.key)
        ? incoming[definition.key]
        : definition.defaultValue;
      if (
        (raw === undefined || raw === null || raw === '') &&
        definition.required
      ) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          `${definition.label} is required`,
          ErrorCodes.INVALID_CUSTOM_FIELD,
        );
      }
      if (raw === undefined || raw === null || raw === '') {
        continue;
      }
      result[definition.key] = this.coerceAndValidate(definition, raw);
    }
    return result;
  }

  private coerceAndValidate(
    definition: CustomFieldDefinition,
    raw: unknown,
  ): unknown {
    switch (definition.fieldType) {
      case CustomFieldType.NUMBER:
      case CustomFieldType.DECIMAL:
      case CustomFieldType.CURRENCY:
      case CustomFieldType.PERCENTAGE: {
        const value = Number(raw);
        if (Number.isNaN(value)) {
          this.invalid(definition, 'must be a number');
        }
        this.assertRange(definition, value);
        return value;
      }
      case CustomFieldType.BOOLEAN:
        if (typeof raw !== 'boolean') {
          this.invalid(definition, 'must be a boolean');
        }
        return raw;
      case CustomFieldType.EMAIL: {
        const value = String(raw);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          this.invalid(definition, 'must be a valid email');
        }
        return value;
      }
      case CustomFieldType.SELECT:
        if (!definition.options.includes(String(raw))) {
          this.invalid(definition, 'must be one of the configured options');
        }
        return String(raw);
      case CustomFieldType.MULTI_SELECT: {
        if (!Array.isArray(raw)) {
          this.invalid(definition, 'must be an array');
        }
        const values = (raw as unknown[]).map(String);
        if (values.some((value) => !definition.options.includes(value))) {
          this.invalid(definition, 'contains an invalid option');
        }
        return values;
      }
      default: {
        const value = String(raw);
        const rules = definition.validation;
        if (rules?.minLength && value.length < rules.minLength) {
          this.invalid(definition, `must be at least ${rules.minLength} chars`);
        }
        if (rules?.maxLength && value.length > rules.maxLength) {
          this.invalid(definition, `must be at most ${rules.maxLength} chars`);
        }
        if (rules?.pattern && !new RegExp(rules.pattern).test(value)) {
          this.invalid(definition, 'does not match the required pattern');
        }
        return value;
      }
    }
  }

  private assertRange(definition: CustomFieldDefinition, value: number): void {
    const rules = definition.validation;
    if (rules?.min !== undefined && value < rules.min) {
      this.invalid(definition, `must be >= ${rules.min}`);
    }
    if (rules?.max !== undefined && value > rules.max) {
      this.invalid(definition, `must be <= ${rules.max}`);
    }
  }

  private assertSelectOptions(
    fieldType: CustomFieldType,
    options?: string[],
  ): void {
    if (
      (fieldType === CustomFieldType.SELECT ||
        fieldType === CustomFieldType.MULTI_SELECT) &&
      (!options || options.length === 0)
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Select fields require options',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
  }

  private invalid(definition: CustomFieldDefinition, message: string): never {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      `${definition.label} ${message}`,
      ErrorCodes.INVALID_CUSTOM_FIELD,
    );
  }
}
