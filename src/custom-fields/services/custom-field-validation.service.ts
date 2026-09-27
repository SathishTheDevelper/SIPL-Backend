import { Injectable } from '@nestjs/common';
import { CustomFieldsService } from './custom-fields.service';

@Injectable()
export class CustomFieldValidationService {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  async validate(
    module: string,
    values?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const definitions = await this.customFieldsService.findByModule(module);
    return this.customFieldsService.validateValues(definitions, values);
  }
}
